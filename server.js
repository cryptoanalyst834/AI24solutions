// AI24Solutions Telegram-бот с меню режимов и Express-сервером
const express = require('express');
const bodyParser = require('body-parser');
const { Telegraf, Markup } = require('telegraf');
require('dotenv').config();

const app = express();
app.use(bodyParser.json());

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

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
  ctx.reply(greetings, mainMenu);
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

  const answer = handleUserMessage(text);
  ctx.reply(answer);
});

// Простой HTTP-сервер для Render
app.get('/', (_, res) => {
  res.send('AI24Solutions bot is live ✅');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Сервер слушает порт ${PORT}`);
});

bot.launch();
console.log('✅ AI24Solutions бот запущен');
