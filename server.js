const express = require('express');
const bodyParser = require('body-parser');
const { Telegraf } = require('telegraf');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors()); // ✅ разрешаем CORS
app.use(bodyParser.json());

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

bot.start((ctx) => {
  ctx.reply('Привет! Нажми кнопку ниже, чтобы пройти квиз.', {
    reply_markup: {
      keyboard: [[{ text: '📝 Пройти квиз', web_app: { url: process.env.WEB_APP_URL } }]],
      resize_keyboard: true,
    },
  });
});

app.post('/send-results', async (req, res) => {
  const { name, email, answers } = req.body;
  const message = `📥 Новый квиз:\n👤 Имя: ${name}\n📧 Email: ${email}\n🧠 Ответы:\n${answers.join('\n')}`;
  try {
    await bot.telegram.sendMessage(process.env.ADMIN_ID, message);
    res.status(200).send('OK');
  } catch (e) {
    console.error(e);
    res.status(500).send('Ошибка при отправке');
  }
});

bot.launch();
app.listen(process.env.PORT || 3000, () => console.log('Backend started'));
