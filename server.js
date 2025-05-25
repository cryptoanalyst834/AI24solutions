const express = require('express');
const bodyParser = require('body-parser');
const { Telegraf } = require('telegraf');
const cors = require('cors');
const { OpenAI } = require("openai");
require('dotenv').config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

// === Инициализация Telegram-бота и OpenAI ===
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// === Команда /start с персонализацией ===
bot.start((ctx) => {
  const name = ctx.from.first_name || 'друг';
  ctx.reply(`Привет, ${name}! 👋\nНажми кнопку ниже, чтобы пройти квиз и получить стратегию развития с ИИ.`, {
    reply_markup: {
      keyboard: [[{ text: '📝 Пройти квиз', web_app: { url: process.env.WEB_APP_URL } }]],
      resize_keyboard: true,
    },
  });
});

// === Команда /ai для активации AI-помощника ===
bot.command('ai', (ctx) => {
  ctx.reply('Введите ваш вопрос по AI, и я постараюсь ответить 🙂');

  // ⛔ ВАЖНО: избегаем множественного назначения обработчика
  const handler = async (ctx2) => {
    try {
      const completion = await openai.chat.completions.create({
        messages: [{ role: "user", content: ctx2.message.text }],
        model: "gpt-4o", // или "gpt-3.5-turbo" для экономии
      });

      const reply = completion.choices[0]?.message?.content || "Извините, не смог найти ответ.";
      await ctx2.reply(reply);

      // После одного ответа отключаем обработчик
      bot.off('text', handler);
    } catch (err) {
      console.error(err);
      await ctx2.reply("Ошибка при получении ответа от AI.");
    }
  };

  bot.on('text', handler);
});

// === Обработка резуль
