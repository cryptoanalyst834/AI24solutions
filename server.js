const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Telegraf, Markup } = require('telegraf');
const dotenv = require('dotenv');
const { OpenAI } = require('openai');
const { google } = require('googleapis');
const path = require('path');

dotenv.config();
const app = express();
app.use(cors());
app.use(bodyParser.json());

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// OpenRouter (GPT-4o)
const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
  defaultHeaders: {
    'HTTP-Referer': process.env.DOMAIN,
    'X-Title': 'AI24SolutionsBot'
  }
});

// Google Sheets
const auth = new google.auth.GoogleAuth({
  keyFile: path.join(__dirname, 'credentials.json'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
});
const SPREADSHEET_ID = '1CajOn3ncsj8h21uxAk10XQWJTD40R6195oJKGSQPJaQ';
const SHEET_NAME = 'Лист2';

// Главное меню
const mainMenu = Markup.keyboard([
  ['💡 Ассистент AI24', '🤖 Задать AI-вопрос'],
  ['📩 Заказать бесплатный аудит']
]).resize();

// Ответы ассистента
const assistantOptions = [
  "Автоматизация бизнес-процессов",
  "Чат-боты и ассистенты",
  "Обучение персонала нейросетям",
  "Индивидуальное ИИ-решение под задачу"
];

const assistantResponses = {
  "Автоматизация бизнес-процессов": "📊 Автоматизируем воронки, внедряем нейросети в процессы.\nПодробнее: https://ai24solutions.ru/audits",
  "Чат-боты и ассистенты": "🤖 Создаём Telegram-ботов, ассистентов и AI-консультантов.\nПримеры: https://ai24solutions.tilda.ws/chat-bots",
  "Обучение персонала нейросетям": "🎓 Практикумы по ChatGPT, Midjourney и нейроавтоматизации.\nПодробнее: https://ai24solutions.ru/educations",
  "Индивидуальное ИИ-решение под задачу": "📈 Аналитика, предсказание продаж, кастомные решения.\nПодробнее: https://ai24solutions.ru/analytics"
};

const awaitingAI = new Set();
const auditStep = {};
const auditData = {};

bot.start((ctx) => {
  const name = ctx.from.first_name || 'друг';
  ctx.reply(`Привет, ${name}! Я — ассистент AI24Solutions 🤖\nЧем могу помочь?`, mainMenu);
});

// Ассистент
bot.hears('💡 Ассистент AI24', (ctx) => {
  ctx.reply('Выберите интересующее направление:', Markup.keyboard(assistantOptions.map(o => [o])).resize());
});

assistantOptions.forEach(option => {
  bot.hears(option, (ctx) => {
    ctx.reply(assistantResponses[option], mainMenu);
  });
});

// AI-вопрос
bot.hears('🤖 Задать AI-вопрос', (ctx) => {
  awaitingAI.add(ctx.from.id);
  ctx.reply('Введите ваш вопрос, и я постараюсь ответить 🤖');
});

bot.on('text', async (ctx) => {
  const id = ctx.from.id;
  const text = ctx.message.text;

  if (awaitingAI.has(id)) {
    awaitingAI.delete(id);
    try {
      const res = await openai.chat.completions.create({
        model: 'gpt-4o',
        max_tokens: 800,
        messages: [{ role: 'user', content: text }]
      });
      const reply = res.choices[0]?.message?.content || '⚠️ Не удалось получить ответ.';
      return ctx.reply(reply, mainMenu);
    } catch (err) {
      console.error('❌ AI Error:', err.message || err);
      return ctx.reply('⚠️ Ошибка при обращении к нейросети. Попробуйте позже.', mainMenu);
    }
  }

  // Аудит
  if (auditStep[id]) {
    if (!auditData[id]) auditData[id] = {};
    const step = auditStep[id];

    if (step === 1) {
      auditData[id].name = text;
      auditStep[id] = 2;
      return ctx.reply("🧠 Опишите кратко вашу задачу или сферу:");
    }

    if (step === 2) {
      auditData[id].task = text;
      auditStep[id] = 3;
      return ctx.reply("📞 Оставьте ваш контакт (Telegram или Email):");
    }

    if (step === 3) {
      auditData[id].contact = text;

      const msg = `📩 Заявка на аудит:\n👤 Имя: ${auditData[id].name}\n🧠 Задача: ${auditData[id].task}\n📞 Контакт: ${auditData[id].contact}`;
      try {
        await bot.telegram.sendMessage(process.env.ADMIN_ID, msg);

        const authClient = await auth.getClient();
        const sheets = google.sheets({ version: 'v4', auth: authClient });
        const now = new Date().toLocaleString('ru-RU');

        await sheets.spreadsheets.values.append({
          spreadsheetId: SPREADSHEET_ID,
          range: `${SHEET_NAME}!A1`,
          valueInputOption: 'USER_ENTERED',
          requestBody: {
            values: [[now, auditData[id].name, auditData[id].task, auditData[id].contact]]
          }
        });

        await ctx.reply("✅ Спасибо! Мы свяжемся с вами в ближайшее время.", mainMenu);
      } catch (error) {
        console.error('❌ Google Sheets Error:', error);
        await ctx.reply("⚠️ Ошибка записи. Попробуйте позже или свяжитесь с нами вручную.", mainMenu);
      }

      delete auditStep[id];
      delete auditData[id];
      return;
    }
    return;
  }

  if (text === '📩 Заказать бесплатный аудит') {
    auditStep[id] = 1;
    auditData[id] = {};
    return ctx.reply("👋 Представьтесь, пожалуйста:");
  }
});

// Подключение Webhook
app.use(bot.webhookCallback('/telegram'));

bot.telegram.setWebhook(`${process.env.DOMAIN}/telegram`).then(() => {
  console.log('📡 Webhook установлен');
}).catch(console.error);

// Сервер
app.get('/', (_, res) => res.send('✅ AI24Solutions работает'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Сервер слушает порт ${PORT}`);
});
