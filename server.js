const express = require('express');
const bodyParser = require('body-parser');
const { Telegraf } = require('telegraf');
const cors = require('cors');
const { OpenAI } = require("openai");
require('dotenv').config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Лог запросов
app.use((req, res, next) => {
  console.log(`➡️ ${req.method} ${req.url}`);
  next();
});

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const { OpenAI } = require("openai");
const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
  defaultHeaders: {
    "HTTP-Referer": "https://ai24solutions.onrender.com/", // свой домен или сайт
    "X-Title": "AI24SolutionsBot"
  }
});

// Подключаем webhook обработку в Express
app.use(bot.webhookCallback('/telegram'));

// /start
bot.start((ctx) => {
  const name = ctx.from.first_name || 'друг';
  ctx.reply(`Привет, ${name}! 👋\nНажми кнопку ниже, чтобы пройти квиз и получить стратегию развития с ИИ.`, {
    reply_markup: {
      keyboard: [[{ text: '📝 Пройти квиз', web_app: { url: process.env.WEB_APP_URL } }]],
      resize_keyboard: true,
    },
  });
});

// /ai режим
const awaitingAIQuestion = new Set();

bot.command('ai', (ctx) => {
  awaitingAIQuestion.add(ctx.from.id);
  ctx.reply('Введите ваш вопрос по AI, и я постараюсь ответить 🙂');
});

bot.on('text', async (ctx) => {
  console.log("📨 Текст от пользователя:", ctx.message.text);

  if (!awaitingAIQuestion.has(ctx.from.id)) return;

  try {
    const completion = await openai.chat.completions.create({
      messages: [{ role: "user", content: ctx.message.text }],
      model: "gpt-4o"
    });

    const reply = completion.choices[0]?.message?.content || "Извините, не смог найти ответ.";
    await ctx.reply(reply);
  } catch (err) {
    console.error("❌ GPT ERROR:", err.response?.data || err.message || err);
    await ctx.reply("Ошибка при получении ответа от AI.");
  }

  awaitingAIQuestion.delete(ctx.from.id);
});

// POST из WebApp
app.post('/send-results', async (req, res) => {
  const { name, email, answers } = req.body;
  const message = `📥 Новый квиз:\n👤 Имя: ${name}\n💬 Telegram: ${email}\n🧠 Ответы:\n${answers.join('\n')}`;
  try {
    await bot.telegram.sendMessage(process.env.ADMIN_ID, message);
    res.status(200).send('OK');
  } catch (err) {
  const errorMessage = err.response?.data || err.message || err;
  console.error("❌ GPT ERROR:", errorMessage);
  await ctx.reply(`Ошибка AI: ${JSON.stringify(errorMessage).slice(0, 300)}...`);
}
});

// 🟢 Запуск только webhook-а (Telegraf займёт порт сам)
bot.launch({
  webhook: {
    domain: process.env.DOMAIN,
    port: process.env.PORT || 3000,
  }
});

console.log('✅ Webhook запущен через Telegraf');
