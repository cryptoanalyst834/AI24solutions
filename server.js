// AI24Solutions Telegram-бот с записью в Google Sheets
const express = require('express');
const bodyParser = require('body-parser');
const { Telegraf, Markup } = require('telegraf');
const { google } = require('googleapis');
const path = require('path');
require('dotenv').config();
keyFile: path.join(__dirname, 'credentials.json')

const app = express();
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

const assistantOptions = [
  "Автоматизация бизнес-процессов",
  "Чат-боты и ассистенты",
  "Обучение персонала нейросетям",
  "Индивидуальное ИИ-решение под задачу",
  "Задать вопрос или оставить заявку"
];

const assistantResponses = {
  "Автоматизация бизнес-процессов": `📊 Аудиты и автоматизация:\n\n• Бесплатный аудит готовности к ИИ\n• SEO-аудит с рекомендациями\n• Комплексный digital-аудит с анализом конкурентов\n\n🔗 Подробнее: https://ai24solutions.ru/audits`,

  "Чат-боты и ассистенты": `🤖 Чат-боты для бизнеса:\n\n• Продажи, поддержка, HR, бронирования\n• Интерактивное обучение персонала\n• AI-боты с GPT и DialogFlow\n\n🔗 Подробнее: https://ai24solutions.tilda.ws/chat-bots`,

  "Обучение персонала нейросетям": `🎓 Обучение ИИ и нейросетям:\n\n• Корпоративные практикумы (2–4 часа)\n• Без воды: чёткие шаблоны и промпты\n• Обучение на ваших задачах и кейсах\n\n🔗 Подробнее: https://ai24solutions.ru/educations`,

  "Индивидуальное ИИ-решение под задачу": `📈 AI-аналитика и кастомные решения:\n\n• Анализ поведения клиентов\n• Прогнозирование и рекомендации\n• Снижение рутинных затрат на 30%+\n\n🔗 Подробнее: https://ai24solutions.ru/analytics`
};

const faq = {
  "сколько стоит": "Обычно решения стартуют от 15 000₽. Мы подбираем под задачу. Расскажите, чем занимаетесь — я предложу подходящее.",
  "кто вы": "AI24Solutions — агентство из Беларуси. Мы создаём чат-ботов, нейросетевых ассистентов и обучаем команды работе с ИИ.",
  "что можете": "Автоматизируем воронки, внедряем AI-ассистентов, CRM, Telegram-ботов и обучаем персонал. Расскажите, какая задача стоит."
};

function handleUserMessage(msg) {
  const lower = msg.toLowerCase();
  for (const key in faq) {
    if (lower.includes(key)) return faq[key];
  }
  return `Спасибо за вопрос! Я передам его команде. А пока выберите интересующее направление 👇`;
}

const contactForm = `Чтобы мы предложили решение под ваш бизнес, ответьте на пару вопросов:\n\n1️⃣ Как вас зовут?\n2️⃣ Чем занимается ваш бизнес?\n3️⃣ Какая задача стоит?\n4️⃣ Контакт (Telegram / почта)`;

function formatLead(data) {
  return `📥 Новый лид:\n👤 Имя: ${data.name}\n🏢 Бизнес: ${data.business}\n🎯 Задача: ${data.goal}\n📬 Контакт: ${data.contact}`;
}

let formStep = {};
let formData = {};
const awaitingAIQuestion = new Set();

bot.start((ctx) => {
  const userName = ctx.from.first_name || 'друг';
  ctx.reply(`Привет, ${userName}!

${greetings}`, mainMenu);
});

bot.hears('💡 Ассистент AI24', (ctx) => {
  ctx.reply('Выберите направление, которое вам интересно:', Markup.keyboard(assistantOptions.map(o => [o])).resize());
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

bot.hears('🤖 Задать AI-вопрос', (ctx) => {
  awaitingAIQuestion.add(ctx.from.id);
  ctx.reply('Введите ваш вопрос по AI — я постараюсь ответить 🙂');
});

bot.on('text', async (ctx) => {
  const id = ctx.from.id;
  const text = ctx.message.text;

  if (awaitingAIQuestion.has(id)) {
    awaitingAIQuestion.delete(id);
    return ctx.reply('🧠 (Здесь будет ответ от OpenAI или другой модели — временно отключено).');
  }

  if (formStep[id]) {
    const step = formStep[id];
    if (!formData[id]) formData[id] = {};
    if (step === 1) formData[id].name = text;
    if (step === 2) formData[id].business = text;
    if (step === 3) formData[id].goal = text;
    if (step === 4) {
      formData[id].contact = text;
      const msg = formatLead(formData[id]);
      await ctx.reply("✅ Спасибо! Мы свяжемся с вами в ближайшее время.");
      await bot.telegram.sendMessage(process.env.ADMIN_ID, msg);
      formStep[id] = 0;
      formData[id] = null;
      return;
    }
    formStep[id]++;
    if (formStep[id] === 2) ctx.reply("2️⃣ Чем занимается ваш бизнес?");
    if (formStep[id] === 3) ctx.reply("3️⃣ Какая задача стоит?");
    if (formStep[id] === 4) ctx.reply("4️⃣ Контакт (Telegram / почта)");
    return;
  }

  if (text === assistantOptions[4]) {
    formStep[id] = 1;
    ctx.reply("1️⃣ Как вас зовут?");
    return;
  }

  if (assistantResponses[text]) {
    return ctx.reply(assistantResponses[text]);
  }

  const answer = handleUserMessage(text);
  ctx.reply(answer);
});

app.post('/send-results', async (req, res) => {
  const { name, email, answers } = req.body;
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
    console.error('Ошибка при отправке в Telegram или Google Sheets:', err);
    res.status(500).send('Ошибка при отправке');
  }
});

app.get('/', (_, res) => {
  res.send('AI24Solutions bot is live ✅');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Сервер слушает порт ${PORT}`);
});

bot.launch();
console.log('✅ AI24Solutions бот запущен');
