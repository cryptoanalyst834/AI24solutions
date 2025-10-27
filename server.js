const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Telegraf, Markup, session } = require('telegraf');
const dotenv = require('dotenv');
const { OpenAI } = require('openai');
const { google } = require('googleapis');

dotenv.config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

/* ================== TELEGRAM ================== */
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
bot.use(session());

/* ================== OPENROUTER ================== */
const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
  defaultHeaders: {
    'HTTP-Referer': process.env.DOMAIN,
    'X-Title': 'AI24SolutionsBot'
  }
});

/* ================== GOOGLE SHEETS (без файла) ================== */
function getGoogleAuth() {
  const b64 = process.env.SERVICE_ACCOUNT_JSON_B64;
  if (!b64) throw new Error('SERVICE_ACCOUNT_JSON_B64 is missing');
  const json = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
  return new google.auth.GoogleAuth({
    credentials: json,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
}
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SHEET_NAME = process.env.SHEET_NAME || 'Лист2';

/* ================== UI ================== */
const mainMenu = Markup.keyboard([
  ['💡 Консультант AI24', '🤖 Задать AI-вопрос'],
  ['📩 Записаться на подключение']
]).resize();

const segmentMenu = Markup.keyboard([
  ['Эксперт/онлайн-курс', 'Салон/косметолог'],
  ['Фитнес/тренер', 'Психолог/терапевт'],
  ['Фриланс/digital', 'B2B-услуги', 'E-commerce'],
  ['«Назад»']
]).resize();

/* ================== HELPERS ================== */
const respondSafe = async (ctx, text, extra) => {
  try { return await ctx.reply(text, extra); } catch (e) { console.error(e); }
};

const nowRu = () => new Date().toLocaleString('ru-RU');

/* ================== STATE KEYS ================== */
// ctx.session = { mode, lead: { segment, niche, contact, name }, awaitingAI }
const resetLead = () => ({ segment: null, niche: null, contact: null, name: null });

/* ================== COPY: PULSE funnel ================== */
const introText =
  'Привет! Я цифровой консультант AI24Solutions.\n' +
  'Помогаю предпринимателям и экспертам внедрять AI-продавца, который общается с клиентами вместо вас — в Direct, Telegram и на сайте.\n\n' +
  'Расскажи, в какой нише ты работаешь — покажу, как AI начнёт приносить клиентов уже сегодня.';

const painBySegment = {
  'Эксперт/онлайн-курс':
    'У экспертов часто: пишут в Direct, задают вопросы и «думают», но не доходят до оплаты.',
  'Салон/косметолог':
    'В beauty-нише теряется до 70% клиентов после первого визита из-за отсутствия персонального сопровождения.',
  'Фитнес/тренер':
    'Люди хотят начать «с понедельника», откладывают и не доходят до записи.',
  'Психолог/терапевт':
    'Клиенты сомневаются и тревожатся — им важно безопасное пространство и мягкий первый шаг.',
  'Фриланс/digital':
    'Часто просят скидку и пропадают. Нужны кейсы и уверенная аргументация ценности.',
  'B2B-услуги':
    'Долгие согласования без решения. Нужен язык выгоды и следующий шаг.',
  'E-commerce':
    'Брошенные корзины, вопросы без ответа — нужен довод до покупки.'
};

const valueText =
  'Это решает наш AI-продавец PULSE:\n' +
  '• отвечает мгновенно 24/7\n' +
  '• задаёт правильные вопросы и выявляет мотивацию\n' +
  '• обрабатывает возражения\n' +
  '• доводит до записи или оплаты\n\n' +
  'Средний рост продаж у клиентов: +30–45% без найма сотрудников.';

const askPriority =
  'Что приоритетно сейчас?\n' +
  '1) Увеличить продажи\n' +
  '2) Автоматизировать переписку\n' +
  '3) Вернуть «пропавших» клиентов\n' +
  '4) Делать продажи без вашего участия';

const contactCTA =
  'Чтобы подготовить персональный план внедрения под вашу нишу, укажите контакт, куда удобно отправить результат:\n' +
  '📞 телефон (WhatsApp/Telegram) или 🔗 @username';

/* ================== BOT FLOW ================== */
bot.start(async (ctx) => {
  ctx.session ??= {};
  ctx.session.mode = null;
  ctx.session.lead = resetLead();
  await respondSafe(ctx, `Привет, ${ctx.from.first_name || 'друг'}!`, mainMenu);
  await respondSafe(ctx, introText, mainMenu);
});

bot.hears('«Назад»', async (ctx) => {
  ctx.session.mode = null;
  ctx.session.lead = resetLead();
  await respondSafe(ctx, 'Главное меню:', mainMenu);
});

bot.hears('💡 Консультант AI24', async (ctx) =>
