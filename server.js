// === ИМПОРТЫ ===
const express = require('express');
const bodyParser = require('body-parser');
const { Telegraf } = require('telegraf');
const cors = require('cors');
const { OpenAI } = require("openai");
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// === ИНИЦИАЛИЗАЦИЯ ===
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

// === ПОДПИСКИ ===
const PAID_USERS_PATH = path.join(__dirname, 'paid_users.json');
let paidUsers = new Set();
try {
  const data = fs.readFileSync(PAID_USERS_PATH, 'utf8');
  const ids = JSON.parse(data);
  paidUsers = new Set(ids);
  console.log('✅ Загружены платные пользователи:', [...paidUsers]);
} catch (err) {
  console.log('⚠️ Не удалось загрузить paid_users.json, создаётся новый.');
  fs.writeFileSync(PAID_USERS_PATH, JSON.stringify([]));
}
function savePaidUsers() {
  fs.writeFileSync(PAID_USERS_PATH, JSON.stringify([...paidUsers], null, 2));
}

// === КОМАНДЫ АДМИНА ===
bot.command('addpaid', async (ctx) => {
  if (ctx.from.id !== parseInt(process.env.ADMIN_ID)) return ctx.reply("❌ Нет прав доступа.");
  const args = ctx.message.text.split(" ");
  if (args.length < 2 || !args[1].startsWith("@")) return ctx.reply("⚠️ Использование: /addpaid @username");
  const username = args[1].substring(1);
  try {
    const chat = await bot.telegram.getChat(`@${username}`);
    paidUsers.add(chat.id);
    savePaidUsers();
    ctx.reply(`✅ @${username} (ID: ${chat.id}) добавлен в подписку.`);
  } catch (err) {
    console.error("❌ Ошибка добавления:", err);
    ctx.reply("❌ Не удалось найти пользователя.");
  }
});

bot.command('listpaid', async (ctx) => {
  if (ctx.from.id !== parseInt(process.env.ADMIN_ID)) return ctx.reply("❌ Нет прав доступа.");
  const list = [...paidUsers];
  if (list.length === 0) return ctx.reply("⚠️ Список подписчиков пуст.");
  ctx.reply(`👥 Подписчики (${list.length}):\n` + list.map(id => `• ${id}`).join("\n"));
});

bot.command('remove', async (ctx) => {
  if (ctx.from.id !== parseInt(process.env.ADMIN_ID)) return ctx.reply("❌ Нет прав доступа.");
  const args = ctx.message.text.split(" ");
  if (args.length < 2 || !args[1].startsWith("@")) return ctx.reply("⚠️ Использование: /remove @username");
  const username = args[1].substring(1);
  try {
    const chat = await bot.telegram.getChat(`@${username}`);
    if (!paidUsers.has(chat.id)) return ctx.reply(`⚠️ @${username} не найден в подписке.`);
    paidUsers.delete(chat.id);
    savePaidUsers();
    ctx.reply(`✅ @${username} удалён из подписчиков.`);
  } catch (err) {
    console.error("❌ Ошибка удаления:", err);
    ctx.reply("❌ Не удалось найти пользователя.");
  }
});
