// AI24Solutions Telegram-бот с Google Sheets и CORS на верном порту
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
  ['💡 Ассистент AI24', '📜 Пройти квиз'],
  ['🤖 Задать AI-вопрос']
]).resize();

const greetings = `Здравствуйте! Я — ассистент AI24Solutions 🤖\n\nПомогаю разобраться с нейро-решениями и автоматизацией. Выберите режим работы ниже:`;

bot.start((ctx) => {
  const userName = ctx.from.first_name || '...
