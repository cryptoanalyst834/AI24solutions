// server.js — AI24SolutionsBot (PULSE v1)
// npm i express body-parser cors dotenv telegraf openai googleapis path

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const { Telegraf, Markup, Scenes, session } = require('telegraf');
const { OpenAI } = require('openai');
const { google } = require('googleapis');

dotenv.config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

// === Telegram ===
if (!process.env.TELEGRAM_BOT_TOKEN) {
  throw new Error('TELEGRAM_BOT_TOKEN is missing');
}
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// === OpenRouter / OpenAI ===
const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
  defaultHeaders: {
    'HTTP-Referer': process.env.DOMAIN || 'https://ai24solutions.ru',
    'X-Title': 'AI24SolutionsBot'
  }
});

// === Google Sheets (через сервис-аккаунт) ===
// РЕКОМЕНДАЦИЯ: хранить ключ в переменной GOOGLE_CREDENTIALS_BASE64
// и декодить во временный файл, чтобы не коммитить.
async function getSheetsClient() {
  let keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  let cleanup = null;

  // Если ключ пришёл как base64 строка
  if (process.env.GOOGLE_CREDENTIALS_BASE64 && !keyFile) {
    const buf = Buffer.from(process.env.GOOGLE_CREDENTIALS_BASE64, 'base64');
    const tmp = path.join(__dirname, 'gsa.tmp.json');
    require('fs').writeFileSync(tmp, buf);
    keyFile = tmp;
    cleanup = () => {
      try { require('fs').unlinkSync(tmp); } catch {}
    };
  }

  const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  const authClient = await auth.getClient();
  const sheets = google.sheets({ version: 'v4', auth: authClient });
  return { sheets, cleanup };
}

const SPREADSHEET_ID = process.env.SPREADSHEET_ID || 'REPLACE_ME';
const SHEET_NAME = process.env.SHEET_NAME || 'Лист2';

// === UI ===
const mainMenu = Markup.keyboard([
  ['⚡ PULSE — увеличить продажи', '🤖 Задать AI-вопрос'],
  ['📩 Записаться на подключение']
]).resize();

const nichesKB = Markup.keyboard([
  ['Эксперт / онлайн-курс', 'Салон / косметолог'],
  ['Фитнес / wellness', 'Психолог / терапевт'],
  ['Фриланс / digital-услуги', 'B2B сервисы'],
  ['E-commerce / товары', 'Другая ниша']
]).resize();

function typing(ctx, ms = 600) {
  ctx.sendChatAction('typing');
  return new Promise(r => setTimeout(r, ms));
}

// === Scenes (PULSE funnel) ===
const pulseWizard = new Scenes.WizardScene(
  'pulse',
  // step 1: вступление
  async (ctx) => {
    await ctx.reply(
      'Я — Консультант AI24. Помогу внедрить AI-продавца PULSE, который общается с клиентами и мягко доводит до оплаты.\n\n' +
      'Чтобы подсказать точнее — выбери нишу:', nichesKB
    );
    return ctx.wizard.next();
  },
  // step 2: выбор ниши
  async (ctx) => {
    ctx.wizard.state.niche = (ctx.message?.text || '').trim();

    // Ветка боли по нишам
    const n = ctx.wizard.state.niche.toLowerCase();
    let pain = 'Клиенты пишут, но не доходят до оплаты; переписка отнимает время; сложно удерживать внимание.';
    if (n.includes('эксперт') || n.includes('курс')) {
      pain = 'Ученики спрашивают в Direct и «думают», не доходя до оплаты — теряются.';
    } else if (n.includes('салон') || n.includes('космет')) {
      pain = 'До 70% клиентов не возвращаются после 1-го визита. Нет автоматического возврата/записи.';
    } else if (n.includes('фитнес') || n.includes('wellness') || n.includes('фитн')) {
      pain = 'Люди хотят начать «с понедельника», но откладывают и не приходят.';
    } else if (n.includes('психолог') || n.includes('терап')) {
      pain = 'Клиенты сомневаются и стесняются. Нужна мягкая, эмпатичная коммуникация до первой записи.';
    } else if (n.includes('фриланс') || n.includes('digital')) {
      pain = 'Просят скидку и пропадают. Нужна защита ценности и доведение до оплаты.';
    } else if (n.includes('b2b') || n.includes('сервис')) {
      pain = 'Долгие согласования, нет движения к решению. Нужен язык выгоды для собственника.';
    } else if (n.includes('e-') || n.includes('e-') || n.includes('ecom') || n.includes('товар') || n.includes('магаз')) {
      pain = 'Брошенные корзины и «посмотрю потом». Нужен доводящий диалог.';
    }

    await typing(ctx);
    await ctx.reply(
      `Понимаю. В вашей сфере часто такое:\n• ${pain}\n\n` +
      'Это можно автоматизировать. PULSE отвечает 24/7, задаёт правильные вопросы, ' +
      'обрабатывает возражения и доводит до оплаты — как живой менеджер по продажам.'
    );

    await typing(ctx);
    await ctx.reply('Хочешь посмотреть, как PULSE будет работать с твоей аудиторией?', Markup.keyboard([['Да'], ['Интересно'], ['Назад в меню']]).resize());
    return ctx.wizard.next();
  },
  // step 3: согласие на демонстрацию
  async (ctx) => {
    const agree = (ctx.message?.text || '').toLowerCase();
    if (agree.includes('назад')) {
      await ctx.reply('Главное меню:', mainMenu);
      return ctx.scene.leave();
    }
    await typing(ctx);
    await ctx.reply(
      'Супер. Подготовлю персональный план внедрения под твою нишу.\n' +
      'Оставь, пожалуйста, контакт, куда отправить результат:\n' +
      '• 📞 телефон (WhatsApp/Telegram)\n' +
      'или\n' +
      '• 🔗 @username'
    );
    return ctx.wizard.next();
  },
  // step 4: сбор контакта и запись
  async (ctx) => {
    const contact = (ctx.message?.text || '').trim();
    ctx.wizard.state.contact = contact;

    const niche = ctx.wizard.state.niche || '—';
    const now = new Date().toLocaleString('ru-RU');
    const row = [now, niche, contact, ctx.from?.id, ctx.from?.username || '', ctx.from?.first_name || ''];

    // Уведомление админу
    if (process.env.ADMIN_ID) {
      try {
        await ctx.telegram.sendMessage(
          process.env.ADMIN_ID,
          `📩 Заявка PULSE\nНиша: ${niche}\nКонтакт: ${contact}\nTG: @${ctx.from?.username || '—'}\nID: ${ctx.from?.id}`
        );
      } catch (e) { console.error('Admin notify error:', e.message); }
    }

    // Запись в Sheets
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
    }

    await typing(ctx, 400);
    await ctx.reply(
      'Спасибо! Я зафиксировал данные.\n' +
      'Наш специалист AI24Solutions свяжется с тобой и пришлёт персональную схему внедрения PULSE.\n' +
      'Хочешь пока задать любой вопрос про AI?', Markup.keyboard([['🤖 Задать AI-вопрос'], ['Главное меню']]).resize()
    );
    return ctx.scene.leave();
  }
);

// === AI Q&A (OpenRouter GPT-4o) ===
async function answerAI(text) {
  const res = await openai.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 800,
    messages: [{ role: 'user', content: text }]
  });
  return res.choices[0]?.message?.content || 'Не удалось получить ответ.';
}

// === Stage / Scenes ===
const stage = new Scenes.Stage([pulseWizard]);
bot.use(session());
bot.use(stage.middleware());

// === Handlers ===
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
  await ctx.session?.__scenes && (ctx.session.__scenes = null);
  await ctx.reply('Диалог сброшен. Что делаем дальше?', mainMenu);
});

bot.hears('🤖 Задать AI-вопрос', async (ctx) => {
  await ctx.reply('Сформулируй вопрос про AI/внедрение — отвечу как эксперт.');
});

bot.on('text', async (ctx, next) => {
  // Если это свободный вопрос — отвечаем ИИ
  const text = (ctx.message?.text || '').trim();
  // простейший фильтр: если это не кнопка из меню/сцен — пробуем AI
  const knownButtons = [
    '⚡ PULSE — увеличить продажи', '🤖 Задать AI-вопрос', '📩 Записаться на подключение',
    'Эксперт / онлайн-курс','Салон / косметолог','Фитнес / wellness','Психолог / терапевт',
    'Фриланс / digital-услуги','B2B сервисы','E-commerce / товары','Другая ниша',
    'Да','Интересно','Назад в меню','Главное меню'
  ];
  if (!knownButtons.includes(text) && !ctx.session?.__scenes) {
    try {
      await typing(ctx);
      const reply = await answerAI(text);
      return ctx.reply(reply, mainMenu);
    } catch (e) {
      console.error('AI error:', e.message);
      return ctx.reply('⚠️ Ошибка при обращении к модели. Попробуй ещё раз.', mainMenu);
    }
  }
  return next();
});

// === Webhook ===
app.use(bot.webhookCallback('/telegram'));
bot.telegram.setWebhook(`${process.env.DOMAIN}/telegram`)
  .then(() => console.log('📡 Webhook установлен'))
  .catch(console.error);

app.get('/', (_, res) => res.send('✅ AI24Solutions Bot online'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server on ${PORT}`));
