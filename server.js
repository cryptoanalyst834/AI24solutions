const express = require('express');
const bodyParser = require('body-parser');
const { Telegraf } = require('telegraf');
const cors = require('cors');
const { OpenAI } = require("openai");
require('dotenv').config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

app.use((req, res, next) => {
  console.log(`➡️ ${req.method} ${req.url}`);
  next();
});

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
  defaultHeaders: {
    "HTTP-Referer": "https://ai24solutions.onrender.com/",
    "X-Title": "AI24SolutionsBot"
  }
});

// Подключаем webhook к Express
app.use(bot.webhookCallback('/telegram'));

// === /start ===
bot.start((ctx) => {
  const name = ctx.from.first_name || 'друг';
  ctx.reply(`Привет, ${name}! 👋\nНажми кнопку ниже, чтобы пройти квиз и получить стратегию развития с ИИ.`, {
    reply_markup: {
      keyboard: [[{ text: '📝 Пройти квиз', web_app: { url: process.env.WEB_APP_URL } }]],
      resize_keyboard: true,
    },
  });
});

// === FSM для AI-режима ===
const awaitingAIQuestion = new Set();

bot.command('ai', (ctx) => {
  awaitingAIQuestion.add(ctx.from.id);
  ctx.reply('Введите ваш вопрос по AI, и я постараюсь ответить 🙂');
});

bot.on('text', async (ctx) => {
  if (!awaitingAIQuestion.has(ctx.from.id)) return;

  const question = ctx.message.text;
  const estimatedLength = question.length;
  const user = ctx.from;
  const maxTokens = estimatedLength > 700 ? 1000 : estimatedLength > 300 ? 800 : 400;

  const primaryModel = "gpt-4o";
  const fallbackModel = "gpt-3.5-turbo";

  // Отправим вопрос администратору
  const adminLog = `📨 Новый AI-вопрос:\n👤 ${user.first_name} (@${user.username || "нет username"})\n🧠 Вопрос: ${question}`;
  await bot.telegram.sendMessage(process.env.ADMIN_ID, adminLog);

  try {
    const completion = await openai.chat.completions.create({
      messages: [{ role: "user", content: question }],
      model: primaryModel,
      max_tokens: maxTokens
    });

    const reply = completion.choices[0]?.message?.content || "Извините, не смог найти ответ.";
    await ctx.reply(reply);

    // Уведомим админа об успешной генерации
    await bot.telegram.sendMessage(process.env.ADMIN_ID, `✅ Ответ отправлен пользователю. Модель: ${primaryModel}`);
  } catch (err) {
    const errorMessage = err.response?.data || err.message || err;
    console.error("❌ GPT ERROR:", errorMessage);

    const isLimitError = JSON.stringify(errorMessage).includes("402");

    if (isLimitError) {
      try {
        const fallback = await openai.chat.completions.create({
          messages: [{ role: "user", content: question }],
          model: fallbackModel,
          max_tokens: Math.min(400, maxTokens)
        });

        const reply = fallback.choices[0]?.message?.content || "Ответ от fallback-модели не найден.";
        await ctx.reply(`⚠️ GPT-4 недоступен, ответ от GPT-3.5:\n\n${reply}`);

        // Лог для админа
        await bot.telegram.sendMessage(process.env.ADMIN_ID, `⚠️ Использована fallback-модель (${fallbackModel})`);
      } catch (e2) {
        const err2 = e2.response?.data || e2.message || e2;
        console.error("❌ Fallback GPT-3.5 Error:", err2);
        await ctx.reply("❌ Ошибка при переключении на GPT-3.5.");
        await bot.telegram.sendMessage(process.env.ADMIN_ID, "❌ Ошибка fallback-модели GPT-3.5");
      }
    } else {
      await ctx.reply("Ошибка AI: " + JSON.stringify(errorMessage).slice(0, 300) + "...");
    }
  }

  awaitingAIQuestion.delete(ctx.from.id);
});

// === Обработка квиза ===
app.post('/send-results', async (req, res) => {
  const { name, email, answers } = req.body;
  const message = `📥 Новый квиз:\n👤 Имя: ${name}\n💬 Telegram: ${email}\n🧠 Ответы:\n${answers.join('\n')}`;
  try {
    await bot.telegram.sendMessage(process.env.ADMIN_ID, message);
    res.status(200).send('OK');
  } catch (err) {
    const errorMessage = err.response?.data || err.message || err;
    console.error("❌ Ошибка отправки в Telegram:", errorMessage);
    res.status(500).send('Ошибка при отправке');
  }
});

// === Запуск бота через Webhook ===
bot.launch({
  webhook: {
    domain: process.env.DOMAIN,
    port: process.env.PORT || 3000,
  }
});

console.log('✅ Webhook запущен через Telegraf');
