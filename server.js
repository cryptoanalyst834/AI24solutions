// server.js — AI24SolutionsBot (PULSE v1.3-sales-hard)
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const { Telegraf, Markup, Scenes, session } = require('telegraf');
const { OpenAI } = require('openai');
const { google } = require('googleapis');

dotenv.config();

/* -------------------- Web server -------------------- */
const cors = require('cors');

app.use(cors({
  origin: [
    /(^https?:\/\/.*\.tilda\.ws$)/,
    /(^https?:\/\/.*\.tilda\.cc$)/,
    /(^https?:\/\/ai24solutions\.ru$)/,
    /(^https?:\/\/www\.ai24solutions\.ru$)/,
    /(^https?:\/\/ai24solutions\.onrender\.com$)/,
  ],
  methods: ['POST','OPTIONS'],
  allowedHeaders: ['Content-Type'],
  maxAge: 86400
}));

/* -------------------- Telegram bot ------------------ */
if (!process.env.TELEGRAM_BOT_TOKEN) {
  throw new Error('TELEGRAM_BOT_TOKEN is not set');
}
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

/* --------------- OpenRouter (GPT-4o) ---------------- */
if (!process.env.OPENROUTER_API_KEY) {
  console.warn('OPENROUTER_API_KEY is not set – AI answers will fail');
}
const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
  defaultHeaders: {
    'HTTP-Referer': process.env.DOMAIN || 'https://ai24solutions.ru',
    'X-Title': 'AI24SolutionsBot'
  }
});

/* ----------------- Google Sheets -------------------- */
const SPREADSHEET_ID =
  process.env.SPREADSHEET_ID || '1CajOn3ncsj8h21uxAk10XQWJTD40R6195oJKGSQPJaQ';
const SHEET_NAME = process.env.SHEET_NAME || 'Лист2';

async function getSheetsClient() {
  let keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  let cleanup = null;

  // Предпочтительно — передавать JSON сервис-аккаунта через base64
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

/* -------------------- Helpers ----------------------- */
function typing(ctx, ms = 600) {
  ctx.sendChatAction('typing');
  return new Promise((r) => setTimeout(r, ms));
}

// Анти-внешние сервисы: если модель сболтнёт про биржи/конструкторы — перепишем
const EXTERNAL_HINTS = [
  'upwork','freelancer','fiverr','kwork','manychat','chatfuel','tars',
  'dialogflow','botpress','microsoft bot framework','amazon lex','nocode',
  'low-code','самостоятельно','своими силами','конструктор ботов'
];

function enforceSales(answer) {
  const txt = (answer || '').toLowerCase();
  const hasExternal = EXTERNAL_HINTS.some(w => txt.includes(w));
  if (!hasExternal) return answer;

  // Мягко, но жёстко переписываем в пользу агентства
  return (
`Правильнее доверить задачу команде, которая уже строит продающих ботов под ключ.

Что мы сделаем в AI24Solutions:
• Разберём нишу и воронку → сформируем продающие сценарии PULSE.  
• Подключим LLM, память и интеграции (сайт/CRM/таблица).  
• Настроим захват лидов, анти-спам и аналитику.  
• Запустим за 3–7 дней и дадим понятные метрики («заявок/день», CPL).

Хочешь — пришлю персональный план внедрения под твой кейс? Оставь контакт (📞 телефон или @username).`
  );
}

// Sales-промпт: всегда про AI24Solutions, без сторонних рекомендаций
async function answerAI(userText) {
  const systemMsg = {
    role: 'system',
    content:
      "Ты — Консультант продаж AI24Solutions. Отвечай кратко и по делу, на русском. " +
      "Всегда веди к продаже услуги агентства AI24Solutions (внедрение AI-продавца PULSE). " +
      "Запрещено советовать фриланс-биржи, конструкторы, «сделайте сами», сторонние компании. " +
      "Стратегия ответа: 1) дай чёткую пользу по вопросу, 2) покажи, как это решит AI-продавец PULSE, " +
      "3) призови оставить контакт (телефон/@username) для персонального плана. " +
      "Тон дружелюбный, уверенный, без воды. Максимум 6–8 предложений."
  };
  const userMsg = { role: 'user', content: userText };
  const res = await openai.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 550,
    messages: [systemMsg, userMsg]
  });
  const raw = res.choices[0]?.message?.content || 'Не удалось получить ответ.';
  return enforceSales(raw);
}
// === AI24 · WebChat (sales) ===================================
function salesSystemPrompt() {
  return {
    role: 'system',
    content:
      "You are AI24Solutions Sales Consultant. Speak Russian concisely and helpfully. " +
      "Audience: owners and managers (experts, salons/cosmetology, fitness/wellness, therapists, freelancers, B2B services, e-commerce). " +
      "Goal: give real value AND convert to a lead for AI24Solutions. " +
      "Rules: 1) Answer to the point (bullets, short steps). 2) Always end with 1-2 CTAs to try PULSE (AI-seller) " +
      "and leave contact (@username or phone). 3) Stay supportive, avoid arguing. 4) If user shares contact — that’s a lead."
  };
}

async function answerSalesAI(userText) {
  const res = await openai.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 600,
    messages: [salesSystemPrompt(), { role: 'user', content: userText }]
  });
  return res.choices?.[0]?.message?.content?.trim() || 'Не удалось получить ответ.';
}

// CORS открыт (у тебя уже app.use(cors())); при необходимости — сузим под домен
app.post('/webchat', express.json(), async (req, res) => {
  try {
    const msg = (req.body?.message || '').trim();
    if (!msg) return res.status(400).json({ ok: false, error: 'message required' });
    const answer = await answerSalesAI(msg);
    return res.json({ ok: true, answer });
  } catch (e) {
    console.error('webchat error:', e.message || e);
    return res.status(500).json({ ok: false, error: 'ai_failed' });
  }
});

// Извлекаем контакт из свободного текста
function extractContact(text) {
  if (!text) return null;
  const at = text.match(/@([a-zA-Z0-9_]{3,})/);
  if (at) return `@${at[1]}`;
  const phone = text.replace(/[^\d+]/g, '').match(/(\+?\d{10,15})/);
  if (phone) return phone[1];
  return null;
}

// Логирование лида: админ + Google Sheets (с UUID)
async function logLead(ctx, { niche = '—', contact = '—', note = '' } = {}) {
  const now = new Date().toLocaleString('ru-RU');
  const tgId = ctx.from?.id || '';
  const username = ctx.from?.username || '';
  const first = ctx.from?.first_name || '';
  const uuid = (crypto.randomUUID && crypto.randomUUID()) || Math.random().toString(36).slice(2);

  // Столбцы: Дата | Ниша | Контакт | TG_ID | Username | Имя | Примечание | UUID
  const row = [now, niche, contact, tgId, username, first, note, uuid];

  // Уведомление админу
  if (process.env.ADMIN_ID) {
    try {
      await ctx.telegram.sendMessage(
        process.env.ADMIN_ID,
        `📩 Заявка PULSE\nНиша: ${niche}\nКонтакт: ${contact}\nTG: @${username || '—'}\nID: ${tgId}\n${note ? 'Примечание: ' + note : ''}`
      );
    } catch (e) {
      console.error('Admin notify error:', e.message);
    }
  }

  // Запись в таблицу
  try {
    const { sheets, cleanup } = await getSheetsClient();
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [row] }
    });
    if (cleanup) cleanup();
  } catch (e) {
    console.error('Sheets error:', e.message);
    if (process.env.ADMIN_ID) {
      try { await ctx.telegram.sendMessage(process.env.ADMIN_ID, `⚠️ Sheets error: ${e.message}`); } catch {}
    }
  }
}

/* ------------------- Keyboards ---------------------- */
const mainMenu = Markup.keyboard([
  ['⚡ PULSE — увеличить продажи', '🤖 Задать AI-вопрос'],
  ['📩 Записаться на подключение']
]).resize();

const nicheKeyboard = Markup.keyboard([
  ['Эксперт / онлайн-курс'],
  ['Салон / косметолог'],
  ['Фитнес / wellness'],
  ['Психолог / терапевт'],
  ['Фриланс / digital-услуги'],
  ['B2B сервисы'],
  ['E-commerce / товары'],
  ['Другая ниша']
]).resize();

/* -------------------- Scenes (PULSE) ---------------- */
const pulseWizard = new Scenes.WizardScene(
  'pulse',
  // step 0: привет и выбор ниши
  async (ctx) => {
    await typing(ctx);
    await ctx.reply(
      'Я — Консультант AI24. Помогу внедрить AI-продавца PULSE, который общается с клиентами и мягко доводит до оплаты.\n\nВыбери нишу:',
      nicheKeyboard
    );
    ctx.wizard.state.niche = null;
    return ctx.wizard.next();
  },
  // step 1: выбор ниши → согласие
  async (ctx) => {
    const niche = (ctx.message?.text || '').trim();
    ctx.wizard.state.niche = niche || '—';
    await typing(ctx);
    await ctx.reply(
      'В твоей нише PULSE снимает возражения и доводит до оплаты 24/7. Показать, как это будет работать у тебя?',
      Markup.keyboard([['Да'], ['Интересно'], ['Назад в меню']]).resize()
    );
    return ctx.wizard.next();
  },
  // step 2: согласие/назад (в любом случае фиксируем контакт при «Назад»)
  async (ctx) => {
    const agree = (ctx.message?.text || '').toLowerCase();
    if (agree.includes('назад')) {
      await logLead(ctx, {
        niche: ctx.wizard.state.niche || '—',
        contact: `@${ctx.from?.username || '—'}`,
        note: '(back-to-menu at agree step)'
      });
      await ctx.reply('Главное меню:', mainMenu);
      return ctx.scene.leave();
    }
    await typing(ctx);
    await ctx.reply(
      'Супер! Отправлю персональный план внедрения под твою нишу.\n' +
      'Оставь контакт, куда прислать результат:\n' +
      '• 📞 телефон (WhatsApp/Telegram)\n' +
      'или\n' +
      '• 🔗 @username'
    );
    return ctx.wizard.next();
  },
  // step 3: контакт или «Назад в меню» (тоже логируем лида)
  async (ctx) => {
    const txt = (ctx.message?.text || '').trim();
    const niche = ctx.wizard.state.niche || '—';

    if (txt.toLowerCase().includes('назад')) {
      await logLead(ctx, {
        niche,
        contact: `@${ctx.from?.username || '—'}`,
        note: '(back-to-menu at contact step)'
      });
      await typing(ctx, 400);
      await ctx.reply('Спасибо! Данные зафиксировал. Возвращаю в меню.', mainMenu);
      return ctx.scene.leave();
    }

    await logLead(ctx, { niche, contact: txt, note: '(lead with contact)' });

    await typing(ctx, 400);
    await ctx.reply(
      'Спасибо! Зафиксировал данные.\n' +
      'Специалист AI24Solutions свяжется с тобой и пришлёт схему внедрения PULSE.\n' +
      'Пока можем обсудить любой вопрос про AI/внедрение.',
      Markup.keyboard([['🤖 Задать AI-вопрос'], ['Главное меню']]).resize()
    );
    return ctx.scene.leave();
  }
);

const stage = new Scenes.Stage([pulseWizard]);

/* ------------------- Middlewares -------------------- */
bot.use(session());
bot.use(stage.middleware());

/* -------------------- Handlers ---------------------- */
bot.start((ctx) => {
  const name = ctx.from.first_name || 'друг';
  ctx.reply(
    `Привет, ${name}! Я — Консультант AI24 🤖\n` +
    `Помогу увеличить продажи через AI-продавца PULSE и отвечу на вопросы про внедрение AI.`,
    mainMenu
  );
});
bot.hears('⚡ PULSE — увеличить продажи', (ctx) => ctx.scene.enter('pulse'));
bot.hears('📩 Записаться на подключение', (ctx) => ctx.scene.enter('pulse'));
bot.hears('Главное меню', (ctx) => ctx.reply('Выбери действие:', mainMenu));

bot.command('demo', (ctx) => ctx.scene.enter('pulse'));
bot.command('reset', async (ctx) => {
  if (ctx.session?.__scenes) ctx.session.__scenes = null;
  await ctx.reply('Диалог сброшен. Что делаем дальше?', mainMenu);
});
bot.command('testlead', async (ctx) => {
  try {
    await logLead(ctx, {
      niche: 'test',
      contact: `@${ctx.from?.username || '—'}`,
      note: '(manual /testlead)'
    });
    await ctx.reply('✅ Тестовая запись отправлена в таблицу.');
  } catch {
    await ctx.reply('⚠️ Не удалось записать в таблицу.');
  }
});

bot.hears('🤖 Задать AI-вопрос', async (ctx) => {
  ctx.session.awaitAI = true; // следующий текст — вопрос к AI
  await ctx.reply('Сформулируй вопрос про AI/внедрение — отвечу как эксперт.');
});

// Универсальный обработчик
bot.on('text', async (ctx, next) => {
  const text = (ctx.message?.text || '').trim();
  const known = [
    '⚡ PULSE — увеличить продажи', '🤖 Задать AI-вопрос', '📩 Записаться на подключение',
    'Эксперт / онлайн-курс', 'Салон / косметолог', 'Фитнес / wellness', 'Психолог / терапевт',
    'Фриланс / digital-услуги', 'B2B сервисы', 'E-commerce / товары', 'Другая ниша',
    'Да', 'Интересно', 'Назад в меню', 'Главное меню'
  ];

  // 1) Явный режим вопроса к AI после кнопки
  if (ctx.session?.awaitAI) {
    ctx.session.awaitAI = false;
    try {
      await typing(ctx);
      const ans = await answerAI(text);
      await ctx.reply(ans);
      return ctx.reply(
        'Готов(а) посмотреть, как внедрить это у тебя? Выбери шаг:',
        Markup.keyboard([
          ['📩 Записаться на подключение'],
          ['⚡ PULSE — увеличить продажи'], ['Главное меню']
        ]).resize()
      );
    } catch (e) {
      console.error('AI error:', e.message);
      return ctx.reply('⚠️ Ошибка при обращении к модели. Попробуй ещё раз.', mainMenu);
    }
  }

  // 1.5) Если прислали @username/телефон — фиксируем лид
  const contact = extractContact(text);
  if (contact) {
    try {
      const niche =
        (ctx.session?.lastNiche) ||
        (ctx.wizard && ctx.wizard.state && ctx.wizard.state.niche) || '—';
      await logLead(ctx, { niche, contact, note: '(captured from free text)' });
      await ctx.reply(
        'Спасибо! Зафиксировал контакт. Прислать персональный план внедрения PULSE?',
        Markup.keyboard([['📩 Записаться на подключение'], ['⚡ PULSE — увеличить продажи']]).resize()
      );
      return;
    } catch { /* продолжаем */ }
  }

  // 2) Фоллбек: не в сцене и не кнопка → считаем вопросом к AI
  const inScene = !!(ctx.scene && ctx.scene.current);
  if (!known.includes(text) && !inScene) {
    try {
      await typing(ctx);
      const ans = await answerAI(text);
      await ctx.reply(ans);
      return ctx.reply(
        'Готов(а) к следующему шагу?',
        Markup.keyboard([
          ['📩 Записаться на подключение'],
          ['⚡ PULSE — увеличить продажи'], ['Главное меню']
        ]).resize()
      );
    } catch (e) {
      console.error('AI error:', e.message);
      return ctx.reply('⚠️ Ошибка при обращении к модели. Попробуй ещё раз.', mainMenu);
    }
  }

  return next();
});

/* --------------- Webhook & HTTP server -------------- */
app.get('/', (_, res) => res.send('✅ AI24Solutions работает'));

app.use(bot.webhookCallback('/telegram'));
bot.telegram
  .setWebhook(`${process.env.DOMAIN}/telegram`)
  .then(() => console.log('📡 Webhook установлен'))
  .catch(console.error);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Сервер слушает порт ${PORT}`));
