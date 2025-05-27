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

const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
  defaultHeaders: {
    "HTTP-Referer": "https://ai24solutions.onrender.com/",
    "X-Title": "AI24SolutionsBot"
  }
});

// === Google Sheets ===
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

const assistantOptions = [
  "Автоматизация бизнес-процессов",
  "Чат-боты и ассистенты",
  "Обучение персонала нейросетям",
  "Индивидуальное ИИ-решение под задачу"
];

const assistantResponses = {
  "Автоматизация бизнес-процессов": "📊 Подробнее: https://ai24solutions.ru/audits",
  "Чат-боты и ассистенты": "🤖 Подробнее: https://ai24solutions.tilda.ws/chat-bots",
  "Обучение персонала нейросетям": "🎓 Подробнее: https://ai24solutions.ru/educations",
  "Индивидуальное ИИ-решение под задачу": "📈 Подробнее: https://ai24solutions.ru/analytics"
};

// Состояния
const awaitingAI = new Set();
const auditStep = {};
const auditData = {};

// Старт
bot.start((ctx) => {
  const name = ctx.from.first_name || 'друг';
  ctx.reply(`Привет, ${name}! Я — ассистент AI24Solutions 🤖\nЧем могу помочь?`, mainMenu);
});

// Ассистент
bot.hears('💡 Ассистент AI24', (ctx) => {
  ctx.reply('Выберите направление:', Markup.keyboard(assistantOptions.map(o => [o])).resize());
});

assistantOptions.forEach((option) => {
  bot.hears(option, (ctx) => {
    ctx.reply(assistantResponses[option]);
  });
});

// AI-вопрос
bot.hears('🤖 Задать AI-вопрос', (ctx) => {
  awaitingAI.add(ctx.from.id);
  ctx.reply('Напишите свой вопрос по AI — и я постараюсь ответить 🤖');
});

// Основной обработчик
bot.on('text', async (ctx) => {
  const id = ctx.from.id;
  const text = ctx.message.text;

  // AI-вопрос
  if (awaitingAI.has(id)) {
    awaitingAI.delete(id);
    try {
      const res = await openai.chat.completions.create({
        model: 'gpt-4o',
        max_tokens: 1000,
        messages: [{ role: 'user', content: text }]
      });
      const reply = res.choices[0]?.message?.content || 'Ответ от AI не получен.';
      return ctx.reply(reply);
    } catch (err) {
      console.error("❌ AI Error:", err.message || err);
      return ctx.reply("⚠️ Ошибка при обращении к нейросети.");
    }
  }

  // Анкета на аудит
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

        console.log('📥 Пишем в Google Sheets:', auditData[id]);

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

        await ctx.reply("✅ Спасибо! Мы свяжемся с вами в ближайшее время.");
      } catch (error) {
        console.error('❌ Ошибка записи в таблицу:', error);
        await ctx.reply("⚠️ Не удалось записать данные. Свяжитесь с нами вручную @ai24solutions");
      }

      delete auditStep[id];
      delete auditData[id];
      return;
    }
    return;
  }

  // Запуск анкеты
  if (text === '📩 Заказать бесплатный аудит') {
    auditStep[id] = 1;
    auditData[id] = {};
    return ctx.reply("👋 Представьтесь, пожалуйста:");
  }
});

// Проверка сервера
app.get('/', (_, res) => res.send('✅ AI24Solutions бот работает'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Сервер слушает порт ${PORT}`));
bot.launch();
console.log('🤖 Бот AI24Solutions запущен');
