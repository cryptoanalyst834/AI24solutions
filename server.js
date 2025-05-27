const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Telegraf, Markup } = require('telegraf');
const { google } = require('googleapis');
const path = require('path');
const dotenv = require('dotenv');
const { OpenAI } = require('openai');

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

const awaitingAI = new Set();

bot.start((ctx) => {
  const name = ctx.from.first_name || 'друг';
  ctx.reply(`Привет, ${name}! Я — бот AI24Solutions 🤖`, mainMenu);
});

bot.hears('💡 Ассистент AI24', (ctx) => {
  ctx.reply('Выберите направление:', Markup.keyboard(assistantOptions.map(o => [o])).resize());
});
assistantOptions.forEach((text) => {
  bot.hears(text, (ctx) => {
    ctx.reply(assistantResponses[text]);
  });
});

bot.hears('🤖 Задать AI-вопрос', (ctx) => {
  awaitingAI.add(ctx.from.id);
  ctx.reply('Напишите ваш вопрос, и я постараюсь ответить 💬');
});

bot.on('text', async (ctx) => {
  const id = ctx.from.id;
  const text = ctx.message.text;
  if (awaitingAI.has(id)) {
    awaitingAI.delete(id);
    try {
      const res = await openai.chat.completions.create({
        model: 'gpt-4o',
        max_tokens: 1000,
        temperature: 0.7,
        messages: [{ role: 'user', content: text }]
      });
      const reply = res.choices[0]?.message?.content || 'Ответ не получен.';
      await ctx.reply(reply);
    } catch (err) {
      console.error("❌ AI Error:", err.message || err);
      await ctx.reply("⚠️ Ошибка при обращении к нейросети.");
    }
  }
});

bot.hears('📝 Пройти квиз', async (ctx) => {
  await ctx.reply('Откройте квиз по кнопке ниже:', {
    reply_markup: {
      inline_keyboard: [[{
        text: '🚀 Пройти квиз',
        web_app: { url: process.env.WEB_APP_URL }
      }]]
    }
  });
});

app.post('/send-results', async (req, res) => {
  const { name, email, answers } = req.body;
  console.log('📩 Квиз отправлен:', req.body);
  const message = `📥 Новый квиз:\n👤 ${name}\n📬 ${email}\n🧠 ${answers.join('\n')}`;
  
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
  } catch (e) {
    console.error("❌ Ошибка записи в таблицу:", e.message || e);
    res.status(500).send('Ошибка записи');
  }
});

app.get('/', (_, res) => res.send('✅ Бот AI24Solutions работает'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Сервер слушает порт ${PORT}`));
bot.launch();
console.log('🤖 Бот AI24Solutions запущен');
