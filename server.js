// AI24Solutions Telegram-бот с Google Sheets, CORS и человечным ассистентом
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Telegraf, Markup } = require('telegraf');
const { google } = require('googleapis');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

const auth = new google.auth.GoogleAuth({
  keyFile: path.join(__dirname, 'credentials.json'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
});

const SPREADSHEET_ID = '1CajOn3ncsj8h21uxAk10XQWJTD40R6195oJKGSQPJaQ';
const SHEET_NAME = 'Лист2';

const mainMenu = Markup.keyboard([
  ['💡 Ассистент AI24', '📝 Пройти квиз'],
  ['🤖 Задать AI-вопрос']
]).resize();

const greetings = `Здравствуйте! Я — ассистент AI24Solutions 🤖\n\nПомогаю разобраться с нейро-решениями и автоматизацией. Выберите режим работы ниже:`;

const assistantReplies = {
  'Автоматизация бизнес-процессов': `🔧 Автоматизация бизнес-процессов — наш ключевой профиль. Мы внедряем нейросети и чат-ботов для экономии времени, сокращения ручной работы и роста продаж.\n\nПодробнее на сайте: https://ai24solutions.ru/audits`,
  'Чат-боты и ассистенты': `🤖 Мы создаём чат-ботов для Telegram, WhatsApp, Instagram и сайтов. Они умеют консультировать, продавать, обучать и даже записывать клиентов.\n\nПосмотрите примеры: https://ai24solutions.tilda.ws/chat-bots`,
  'Обучение персонала нейросетям': `🎓 Проводим практикумы для команд. Покажем, как использовать ChatGPT, Midjourney, Canva и другие инструменты на реальных задачах бизнеса.\n\nПрограмма обучения: https://ai24solutions.ru/educations`,
  'Индивидуальное ИИ-решение под задачу': `📈 У вас нестандартная задача? Мы поможем разработать кастомное решение с нейросетями, автоматизацией и CRM-интеграцией.\n\nПишите, обсудим подход.`
};

const formStep = {};
const formData = {};
const awaitingAIQuestion = new Set();

bot.start((ctx) => {
  console.log('▶️ /start получен');
  const userName = ctx.from.first_name || 'друг';
  ctx.reply(`Привет, ${userName}!\n\n${greetings}`, mainMenu);
});

bot.hears('💡 Ассистент AI24', async (ctx) => {
  const keyboard = Markup.keyboard([
    ['Автоматизация бизнес-процессов'],
    ['Чат-боты и ассистенты'],
    ['Обучение персонала нейросетям'],
    ['Индивидуальное ИИ-решение под задачу'],
    ['Задать вопрос или оставить заявку']
  ]).resize();

  await ctx.reply('Выберите направление, которое вам интересно:', keyboard);
});

bot.hears('🤖 Задать AI-вопрос', async (ctx) => {
  awaitingAIQuestion.add(ctx.from.id);
  await ctx.reply('Введите ваш вопрос по AI — постараюсь ответить максимально понятно и по-человечески 🙂');
});

bot.hears('📝 Пройти квиз', (ctx) => {
  ctx.reply('Откройте квиз по кнопке ниже:', {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: '🚀 Пройти квиз',
            web_app: { url: process.env.WEB_APP_URL }
          }
        ]
      ]
    }
  });
});

bot.on('text', async (ctx) => {
  console.log('📨 Сообщение от пользователя:', ctx.message.text);

  const id = ctx.from.id;
  const text = ctx.message.text;

  if (awaitingAIQuestion.has(id)) {
    awaitingAIQuestion.delete(id);
    // Здесь можно подключить OpenAI API или заглушку
    return ctx.reply('🧠 Спасибо за вопрос! Я передам его экспертам и вернусь с ответом.');
  }

  if (assistantReplies[text]) {
    return ctx.reply(assistantReplies[text]);
  }

  if (text === 'Задать вопрос или оставить заявку') {
    await ctx.reply('1️⃣ Как вас зовут?');
    formStep[id] = 1;
    formData[id] = {};
    return;
  }

  if (formStep[id]) {
    if (formStep[id] === 1) formData[id].name = text;
    else if (formStep[id] === 2) formData[id].business = text;
    else if (formStep[id] === 3) formData[id].goal = text;
    else if (formStep[id] === 4) {
      formData[id].contact = text;
      const msg = `📥 Новый лид:\n👤 Имя: ${formData[id].name}\n🏢 Бизнес: ${formData[id].business}\n🎯 Задача: ${formData[id].goal}\n📬 Контакт: ${formData[id].contact}`;
      await ctx.reply('✅ Спасибо! Мы свяжемся с вами в ближайшее время.');
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

app.post('/send-results', async (req, res) => {
  const { name, email, answers } = req.body;
  console.log('📩 Получен запрос от WebApp:', req.body);
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

app.get('/', (_, res) => {
  res.send('✅ AI24Solutions backend работает');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Сервер слушает порт ${PORT}`);
});

bot.launch();
console.log('✅ AI24Solutions бот запущен');
