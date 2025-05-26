const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Telegraf, Markup } = require('telegraf');
const { google } = require('googleapis');
const path = require('path');
const dotenv = require('dotenv');
const { OpenAI } = require("openai");

dotenv.config();
const app = express();
app.use(cors());
app.use(bodyParser.json());

// Telegram bot
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// GPT-4o через OpenRouter
const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
  defaultHeaders: {
    "HTTP-Referer": "https://ai24solutions.onrender.com/",
    "X-Title": "AI24SolutionsBot"
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
  ['💡 Ассистент AI24', '📝 Пройти квиз'],
  ['🤖 Задать AI-вопрос']
]).resize();

const awaitingAIQuestion = new Set();
let formStep = {};
let formData = {};

bot.start((ctx) => {
  const name = ctx.from.first_name || 'друг';
  ctx.reply(`Привет, ${name}! 👋\n\nЯ — ассистент AI24Solutions. Помогаю разобраться с нейро-решениями. Выбери, с чего начать:`, mainMenu);
});

// ==== Ассистент ====
const assistantOptions = [
  "Автоматизация бизнес-процессов",
  "Чат-боты и ассистенты",
  "Обучение персонала нейросетям",
  "Индивидуальное ИИ-решение под задачу",
  "Задать вопрос или оставить заявку"
];

const assistantResponses = {
  "Автоматизация бизнес-процессов": `📊 Мы проводим бесплатный аудит процессов и помогаем внедрить AI туда, где это даёт прибыль.\nПодробнее: https://ai24solutions.ru/audits`,
  "Чат-боты и ассистенты": `🤖 Создаём Telegram-ботов, ассистентов, консультантов и ботов для HR/записей.\nПодробнее: https://ai24solutions.tilda.ws/chat-bots`,
  "Обучение персонала нейросетям": `🎓 Проводим короткие и эффективные практикумы по ChatGPT, Midjourney, автоматизации без кода и др.\nПодробнее: https://ai24solutions.ru/educations`,
  "Индивидуальное ИИ-решение под задачу": `📈 Помогаем сократить рутину, повысить продажи и принимать решения на основе данных.\nПодробнее: https://ai24solutions.ru/analytics`
};

bot.hears('💡 Ассистент AI24', async (ctx) => {
  await ctx.reply('Выберите интересующее направление:', Markup.keyboard(assistantOptions.map(o => [o])).resize());
});

// правильная обработка кнопок из массива
assistantOptions.forEach(option => {
  bot.hears(option, async (ctx) => {
    const response = assistantResponses[option];
    if (response) await ctx.reply(response);
  });
});

// ==== Анкета ====
bot.hears('Задать вопрос или оставить заявку', async (ctx) => {
  const id = ctx.from.id;
  formStep[id] = 1;
  formData[id] = {};
  await ctx.reply('1️⃣ Как вас зовут?');
});

bot.on('text', async (ctx) => {
  const id = ctx.from.id;
  const text = ctx.message.text;

  // AI-вопрос
  if (awaitingAIQuestion.has(id)) {
    awaitingAIQuestion.delete(id);

    try {
      const completion = await openai.chat.completions.create({
        model: "openrouter/gpt-4o",
        messages: [{ role: "user", content: text }]
      });

      const reply = completion.choices[0]?.message?.content || "Ответ от AI не получен.";
      return ctx.reply(reply);
    } catch (err) {
      console.error("❌ Ошибка AI:", err.message || err);
      return ctx.reply("Произошла ошибка при обращении к AI. Попробуйте позже.");
    }
  }

  // Анкета
  if (formStep[id]) {
    if (formStep[id] === 1) formData[id].name = text;
    if (formStep[id] === 2) formData[id].business = text;
    if (formStep[id] === 3) formData[id].goal = text;
    if (formStep[id] === 4) {
      formData[id].contact = text;

      const msg = `📥 Новый лид:\n👤 Имя: ${formData[id].name}\n🏢 Бизнес: ${formData[id].business}\n🎯 Задача: ${formData[id].goal}\n📬 Контакт: ${formData[id].contact}`;
      await ctx.reply("✅ Спасибо! Мы свяжемся с вами в ближайшее время.");
      await bot.telegram.sendMessage(process.env.ADMIN_ID, msg);

      delete formStep[id];
      delete formData[id];
      return;
    }

    formStep[id]++;
    if (formStep[id] === 2) return ctx.reply('2️⃣ Чем занимается ваш бизнес?');
    if (formStep[id] === 3) return ctx.reply('3️⃣ Какая задача стоит?');
    if (formStep[id] === 4) return ctx.reply('4️⃣ Контакт (Telegram / почта)');
  }
});

// ==== WebApp-квиз ====
app.post('/send-results', async (req, res) => {
  const { name, email, answers } = req.body;
  console.log('📩 Запрос из WebApp:', req.body);

  const message = `📥 Новый квиз:\n👤 Имя: ${name}\n💬 Telegram: ${email}\n🧠 Ответы:\n${answers.join('\n')}`;

  try {
    await bot.telegram.sendMessage(process.env.ADMIN_ID, message);

    const authClient = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: authClient });
    const now = new Date().toLocaleString('ru-RU');

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[now, name, email, ...answers]]
      }
    });

    res.status(200).send('OK');
  } catch (err) {
    console.error('❌ Ошибка при отправке в Telegram или Google Sheets:', err);
    res.status(500).send('Ошибка при отправке');
  }
});

// ==== Квиз ====
bot.hears('📝 Пройти квиз', async (ctx) => {
  await ctx.reply('Откройте квиз по кнопке ниже:', {
    reply_markup: {
      inline_keyboard: [[{ text: '🚀 Пройти квиз', web_app: { url: process.env.WEB_APP_URL } }]]
    }
  });
});

// ==== AI-вопрос ====
bot.hears('🤖 Задать AI-вопрос', async (ctx) => {
  awaitingAIQuestion.add(ctx.from.id);
  await ctx.reply('Введите ваш вопрос — постараюсь ответить максимально понятно 🤖');
});

// ==== Express старт ====
app.get('/', (_, res) => res.send('AI24Solutions бот работает ✅'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Сервер слушает порт ${PORT}`);
});

bot.launch();
console.log('✅ AI24Solutions бот запущен');
