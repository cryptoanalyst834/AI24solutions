// server.js — AI24SolutionsBot (v1.5 multi-service + hot-questions log)
require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const { Telegraf, Markup, Scenes, session } = require('telegraf');
const { OpenAI } = require('openai');
const { google } = require('googleapis');

/* -------------------- App -------------------- */
const app = express();
app.use(bodyParser.json());

/* --------- CORS (белый список доменов) ------- */
const allow = (process.env.ALLOW_ORIGINS || '')
  .split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allow.length === 0 || allow.includes(origin)) return cb(null, true);
    return cb(new Error('Not allowed by CORS'));
  }
}));

/* --------------- Telegram bot ---------------- */
if (!process.env.TELEGRAM_BOT_TOKEN) {
  throw new Error('TELEGRAM_BOT_TOKEN is not set');
}
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

/* ------------------ OpenRouter --------------- */
if (!process.env.OPENROUTER_API_KEY) {
  console.warn('OPENROUTER_API_KEY is not set – AI answers may fail');
}
const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
  defaultHeaders: {
    'HTTP-Referer': process.env.DOMAIN || 'https://ai24solutions.ru',
    'X-Title': 'AI24SolutionsBot'
  }
});

/* ----------------- Google Sheets ------------- */
const SPREADSHEET_ID = process.env.SPREADSHEET_ID || '1CajOn3ncsj8h21uxAk10XQWJTD40R6195oJKGSQPJaQ';
const SHEET_NAME     = process.env.SHEET_NAME || 'Лист2';

async function getSheetsClient() {
  let keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  let cleanup = null;

  if (process.env.GOOGLE_CREDENTIALS_BASE64 && !keyFile) {
    const buf = Buffer.from(process.env.GOOGLE_CREDENTIALS_BASE64, 'base64');
    const tmp = path.join(__dirname, 'gsa.tmp.json');
    fs.writeFileSync(tmp, buf);
    keyFile = tmp;
    cleanup = () => { try { fs.unlinkSync(tmp); } catch {} };
  }

  const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  const authClient = await auth.getClient();
  const sheets = google.sheets({ version: 'v4', auth: authClient });
  return { sheets, cleanup };
}

/* -------------------- Helpers ---------------- */
function typing(ctx, ms = 600) {
  if (ctx) ctx.sendChatAction('typing');
  return new Promise(r => setTimeout(r, ms));
}

const EXTERNAL_HINTS = [
  'upwork','freelancer','fiverr','kwork','manychat','chatfuel','tars',
  'dialogflow','botpress','microsoft bot framework','amazon lex','nocode',
  'low-code','самостоятельно','своими силами','конструктор ботов'
];
function enforceSales(answer) {
  const txt = (answer || '').toLowerCase();
  const hasExternal = EXTERNAL_HINTS.some(w => txt.includes(w));
  if (!hasExternal) return answer;
  return (
`Правильнее доверить задачу команде, которая делает решения под ключ.

Что делаем в AI24Solutions:
• Анализ ниши и цели → ТЗ и сценарии.  
• Разработка и интеграции (сайт/бот/CRM/платежи/аналитика).  
• Запуск 3–14 дней, метрики и поддержка.

Готов прислать персональный план внедрения. Оставь контакт (📞 телефон или @username).`
  );
}

// — «горячие вопросы»: триггеры
const HOT_TRIGGERS = [
  /бюджет|цена|стоимость|сколько/i,
  /срок/i,
  /интеграци/i,
  /окупаем/i,
  /договор|оплата|счет|счёт/i
];
const isHotQuestion = (t='') => HOT_TRIGGERS.some(rx => rx.test(t));

// — Каталог услуг и триггеры
const SERVICES = [
  {
    key: 'web_ai',
    title: 'Разработка сайта с ИИ (Tilda/Next/WordPress)',
    triggers: [/сайт|лендинг|tilda|вордпрес|wordpress|веб|landing/i],
    bullets: [
      'UX-прототип и дизайн в фирстиле',
      'Разработка (Tilda/Next/WordPress) + скорость + SEO-база',
      'AI-виджет/чат, формы, оплата, интеграции с CRM/таблицами',
      'Аналитика: события, конверсии, дашборд'
    ]
  },
  {
    key: 'crm_bitrix',
    title: 'Интеграции с CRM (Битрикс24/amoCRM)',
    triggers: [/битрикс|bitrix|amocrm|crm|воронки|сделк|сейлсбот/i],
    bullets: [
      'Аудит и настройка воронок, статусов, прав',
      'Интеграции сайта/бота, вебхуки, каталоги, оплаты',
      'Автоматизация: роботы, уведомления, отчёты',
      'Поддержка и техпод задачи on-going'
    ]
  },
  {
    key: 'tg_bots',
    title: 'Telegram-боты и мини-приложения',
    triggers: [/бот|telegram|телеграм|мини-прилож/i],
    bullets: [
      'Сценарии: лидогенерация, квизы, продажи, оплата',
      'LLM-ассистенты, память, RAG, аналитика',
      'Админка, подписки, интеграции (CRM/Sheets/Pay)',
      'Деплой (Railway/Render/VPS) и поддержка'
    ]
  },
  {
    key: 'ai_sales_pulse',
    title: 'AI-продавец PULSE (автопродажи 24/7)',
    triggers: [/pulse|продава|ai-продав/i],
    bullets: [
      'Пишет и прогревает, снимает возражения',
      'Ведёт к оплате, собирает контакты',
      'Интеграции с сайтом/CRM, аналитика',
      'Запуск 3–7 дней, метрики и A/B'
    ]
  },
  {
    key: 'analytics_seo_ads',
    title: 'Аналитика, SEO и контекстная реклама',
    triggers: [/seo|реклам|директ|ads|метрик|аналитик|utm/i],
    bullets: [
      'Тех-SEO, контент-план, кластеризация',
      'GA4/Метрика/UTM, сквозная аналитика',
      'Яндекс.Директ/Google Ads: стратегия и сетки',
      'Дашборды и отчёты по целям/ROAS'
    ]
  },
  {
    key: 'ai_training',
    title: 'Обучение и внедрение ИИ под задачи',
    triggers: [/обучен|тренинг|внедрен|ai|gpt|нейросет/i],
    bullets: [
      'Аудит процессов → карта автоматизации',
      'Скрипты/шаблоны, промт-инжиниринг',
      'Выбор стека (OpenRouter/Claude/локальные)',
      'Регламенты и обучение команды'
    ]
  },
  {
    key: 'integrations',
    title: 'Интеграции и бэкенд-автоматизация',
    triggers: [/интеграц|api|webhook|google sheets|notion|1c|оплат/i],
    bullets: [
      'Склейка сервисов: CRM, таблицы, 1С, почта',
      'Серверные функции, очереди, вебхуки',
      'Оплаты (Tinkoff/PayPal/Telegram Payments)',
      'Надёжность, логирование, мониторинг'
    ]
  }
];

// Детект намерения → подходящая услуга
function detectService(text='') {
  for (const s of SERVICES) {
    if (s.triggers.some(rx => rx.test(text))) return s;
  }
  // Если прямого совпадения нет: мягкая логика
  if (/сайт/i.test(text)) return SERVICES.find(s => s.key==='web_ai');
  if (/битрикс|crm/i.test(text)) return SERVICES.find(s => s.key==='crm_bitrix');
  if (/бот|telegram/i.test(text)) return SERVICES.find(s => s.key==='tg_bots');
  if (/seo|реклам|ads/i.test(text)) return SERVICES.find(s => s.key==='analytics_seo_ads');
  if (/обучен|внедрен|нейросет|ai|gpt/i.test(text)) return SERVICES.find(s => s.key==='ai_training');
  if (/интеграц|api|webhook/i.test(text)) return SERVICES.find(s => s.key==='integrations');
  // дефолт — PULSE
  return SERVICES.find(s => s.key==='ai_sales_pulse');
}

/* ----------------- Sales AI ------------------ */
function salesSystemPrompt(service) {
  const title = service?.title || 'AI-продавец PULSE';
  const bullets = (service?.bullets || []).map(b => `• ${b}`).join('\n');
  return {
    role: 'system',
    content:
      "Ты — Консультант продаж AI24Solutions. Отвечай кратко и по делу, на русском. " +
      "Запрещено советовать фриланс-биржи/конструкторы/«сделайте сами». " +
      `Предлагай релевантную услугу: ${title}. Дай конкретику (шаги/результат), затем мягкий CTA оставить контакт.` +
      `\nКороткая памятка по услуге:\n${bullets}`
  };
}

async function answerSalesAI(userText) {
  const service = detectService(userText);
  const res = await openai.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 650,
    messages: [
      salesSystemPrompt(service),
      { role: 'user', content: userText }
    ]
  });
  const out = res.choices?.[0]?.message?.content?.trim() || 'Не удалось получить ответ.';
  return { text: enforceSales(out), service };
}

/* --------------- Leads & Hot log -------------- */
async function logLeadRow(row) {
  const { sheets, cleanup } = await getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [row] }
  });
  if (cleanup) cleanup();
}

async function logLead(ctx, { niche = '—', contact = '—', note = '' } = {}) {
  const now = new Date().toLocaleString('ru-RU');
  const tgId = ctx?.from?.id || '';
  const username = ctx?.from?.username || '';
  const first = ctx?.from?.first_name || '';
  const uuid = (crypto.randomUUID && crypto.randomUUID()) || Math.random().toString(36).slice(2);
  const row = [now, niche, contact, tgId, username, first, note, uuid];

  if (process.env.ADMIN_ID && ctx?.telegram) {
    try {
      await ctx.telegram.sendMessage(
        process.env.ADMIN_ID,
        `📩 Заявка\nНиша/услуга: ${niche}\nКонтакт: ${contact}\nTG: @${username || '—'}\nID: ${tgId}\n${note ? 'Примечание: ' + note : ''}`
      );
    } catch {}
  }
  try { await logLeadRow(row); } catch(e) {
    if (process.env.ADMIN_ID && ctx?.telegram) {
      try { await ctx.telegram.sendMessage(process.env.ADMIN_ID, `⚠️ Sheets error: ${e.message}`); } catch {}
    }
  }
}

async function logHotQuestion({ source = 'web', text, service, ctx }) {
  const now = new Date().toLocaleString('ru-RU');
  const tgId = ctx?.from?.id || '';
  const username = ctx?.from?.username || '';
  const first = ctx?.from?.first_name || '';
  const uuid = (crypto.randomUUID && crypto.randomUUID()) || Math.random().toString(36).slice(2);
  const svc = service?.title || '—';
  const row = [now, svc, `hot:${source}`, tgId, username, first, text, uuid];
  try { await logLeadRow(row); } catch {}
}

/* --------------- Web endpoint ---------------- */
app.post('/webchat', async (req, res) => {
  try {
    const msg = (req.body?.message || '').trim();
    if (!msg) return res.status(400).json({ ok: false, error: 'message required' });

    const { text: answer, service } = await answerSalesAI(msg);

    if (isHotQuestion(msg)) {
      await logHotQuestion({ source: 'web', text: msg, service, ctx: null });
    }

    return res.json({ ok: true, answer, service: service?.key });
  } catch (e) {
    console.error('webchat error:', e);
    return res.status(500).json({ ok: false, error: 'ai_failed' });
  }
});

/* ----------------- Telegram flow -------------- */
const mainMenu = Markup.keyboard([
  ['🛠 Услуги AI24', '🤖 Задать AI-вопрос'],
  ['📩 Оставить контакт']
]).resize();

const servicesKeyboard = Markup.keyboard([
  ['🌐 Сайт с ИИ'], ['🤖 Telegram-бот / мини-апп'],
  ['🔗 Интеграции CRM (Битрикс/amoCRM)'], ['⚡ AI-продавец PULSE'],
  ['📈 Аналитика / SEO / Ads'], ['🎓 Обучение ИИ / внедрение'],
  ['Другой запрос'], ['Главное меню']
]).resize();

bot.start((ctx) => {
  const name = ctx.from.first_name || 'друг';
  ctx.reply(
    `Привет, ${name}! Я — Консультант AI24 🤖\n` +
    `Помогу: сайт с ИИ, Telegram-боты, интеграции с Битрикс/amoCRM, PULSE, аналитика/SEO/Ads, обучение ИИ.`,
    mainMenu
  );
});

bot.hears('Главное меню', (ctx) => ctx.reply('Выбери действие:', mainMenu));
bot.hears('🛠 Услуги AI24', (ctx) => ctx.reply('Какая задача сейчас актуальна?', servicesKeyboard));
bot.hears('📩 Оставить контакт', async (ctx) => {
  await ctx.reply('Пришли телефон или @username — зафиксирую и подключу специалиста.');
});

function extractContact(text) {
  if (!text) return null;
  const at = text.match(/@([a-zA-Z0-9_]{3,})/);
  if (at) return `@${at[1]}`;
  const phone = text.replace(/[^\d+]/g, '').match(/(\+?\d{10,15})/);
  if (phone) return phone[1];
  return null;
}

bot.hears([
  '🌐 Сайт с ИИ','🤖 Telegram-бот / мини-апп','🔗 Интеграции CRM (Битрикс/amoCRM)',
  '⚡ AI-продавец PULSE','📈 Аналитика / SEO / Ads','🎓 Обучение ИИ / внедрение','Другой запрос'
], async (ctx) => {
  const map = {
    '🌐 Сайт с ИИ': 'Хочу сайт/лендинг',
    '🤖 Telegram-бот / мини-апп': 'Нужен Telegram-бот',
    '🔗 Интеграции CRM (Битрикс/amoCRM)': 'Нужны интеграции с CRM',
    '⚡ AI-продавец PULSE': 'Хочу AI-продавца PULSE',
    '📈 Аналитика / SEO / Ads': 'Нужна аналитика/SEO/реклама',
    '🎓 Обучение ИИ / внедрение': 'Нужно обучение/внедрение ИИ',
    'Другой запрос': 'Другая задача'
  };
  const userText = map[ctx.message.text] || ctx.message.text;
  await typing(ctx);
  const { text, service } = await answerSalesAI(userText);
  await ctx.reply(text, Markup.keyboard([['📩 Оставить контакт'], ['Главное меню']]).resize());
  // Подсветим «горячие» по триггерам
  if (isHotQuestion(userText)) {
    try { await logHotQuestion({ source: 'tg', text: userText, service, ctx }); } catch {}
  }
});

bot.hears('🤖 Задать AI-вопрос', async (ctx) => {
  ctx.session.awaitAI = true;
  await ctx.reply('Опиши цель/вопрос — отвечу и подскажу следующий шаг.');
});

bot.on('text', async (ctx, next) => {
  const text = (ctx.message?.text || '').trim();

  // контакт → лид
  const contact = extractContact(text);
  if (contact) {
    try {
      await logLead(ctx, { niche: 'Контакт из свободного текста', contact, note: '(captured)' });
      await ctx.reply('Спасибо! Зафиксировал. Подключим специалиста и вернёмся с планом.');
      return;
    } catch {}
  }

  // режим вопроса
  if (ctx.session?.awaitAI) {
    ctx.session.awaitAI = false;
    try {
      await typing(ctx);
      const { text: ans, service } = await answerSalesAI(text);
      await ctx.reply(ans, Markup.keyboard([['📩 Оставить контакт'], ['🛠 Услуги AI24'], ['Главное меню']]).resize());
      if (isHotQuestion(text)) {
        try { await logHotQuestion({ source: 'tg', text, service, ctx }); } catch {}
      }
      return;
    } catch (e) {
      console.error('AI error:', e.message);
      return ctx.reply('⚠️ Ошибка модели. Сформулируй короче или попробуй ещё раз.', mainMenu);
    }
  }

  return next();
});

/* --------------- Webhook & HTTP ---------------- */
app.get('/', (_, res) => res.send('✅ AI24Solutions работает'));

app.use(bot.webhookCallback('/telegram'));
bot.telegram
  .setWebhook(`${process.env.DOMAIN}/telegram`)
  .then(() => console.log('📡 Webhook установлен'))
  .catch(console.error);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Сервер слушает порт ${PORT}`));
