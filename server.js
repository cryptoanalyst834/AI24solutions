// server.js — AI24SolutionsBot (PULSE v1.1)
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

const { Telegraf, Markup, Scenes, session } = require('telegraf');
const { OpenAI } = require('openai');
const { google } = require('googleapis');

dotenv.config();

// --------------------- Web server ---------------------
const app = express();
app.use(cors());
app.use(bodyParser.json());

// --------------------- Telegram bot -------------------
if (!process.env.TELEGRAM_BOT_TOKEN) {
    throw new Error('TELEGRAM_BOT_TOKEN is not set');
}
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// --------------------- OpenRouter (GPT-4o) ------------
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

// --------------------- Google Sheets ------------------
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
        cleanup = () => {
            try { fs.unlinkSync(tmp); } catch {}
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

// --------------------- Helpers ------------------------
function typing(ctx, ms = 600) {
    ctx.sendChatAction('typing');
    return new Promise((r) => setTimeout(r, ms));
}

async function answerAI(text) {
    const res = await openai.chat.completions.create({
        model: 'gpt-4o',
        max_tokens: 800,
        messages: [{ role: 'user', content: text }]
    });
    return res.choices[0]?.message?.content || 'Не удалось получить ответ.';
}

// Логирование лида: админ + Google Sheets
async function logLead(ctx, { niche = '—', contact = '—', note = '' } = {}) {
    const now = new Date().toLocaleString('ru-RU');
    const tgId = ctx.from?.id || '';
    const username = ctx.from?.username || '';
    const first = ctx.from?.first_name || '';
    const row = [now, niche, contact, tgId, username, first, note];

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
    }
}

// --------------------- Keyboards ----------------------
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

// --------------------- Scenes (PULSE) -----------------
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
    // step 1: выбор ниши → переход к согласию
    async (ctx) => {
        const niche = (ctx.message?.text || '').trim();
        ctx.wizard.state.niche = niche || '—';
        await typing(ctx);
        await ctx.reply(
            'Понимаю. Это можно автоматизировать. PULSE отвечает 24/7, задаёт правильные вопросы, обрабатывает возражения и доводит до оплаты — как живой менеджер.\n\nХочешь посмотреть, как PULSE будет работать с твоей аудиторией?',
            Markup.keyboard([['Да'], ['Интересно'], ['Назад в меню']]).resize()
        );
        return ctx.wizard.next();
    },
    // step 2: согласие или назад
    async (ctx) => {
        const agree = (ctx.message?.text || '').toLowerCase();
        if (agree.includes('назад')) {
            // даже при возврате в меню фиксируем лида
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
            'Супер. Подготовлю персональный план внедрения под твою нишу.\n' +
            'Оставь, пожалуйста, контакт, куда отправить результат:\n' +
            '• 📞 телефон (WhatsApp/Telegram)\n' +
            'или\n' +
            '• 🔗 @username'
        );
        return ctx.wizard.next();
    },
    // step 3: контакт или назад
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
            'Спасибо! Я зафиксировал данные.\n' +
            'Наш специалист AI24Solutions свяжется с тобой и пришлёт персональную схему внедрения PULSE.\n' +
            'Хочешь пока задать любой вопрос про AI?',
            Markup.keyboard([['🤖 Задать AI-вопрос'], ['Главное меню']]).resize()
        );
        return ctx.scene.leave();
    }
);

const stage = new Scenes.Stage([pulseWizard]);

// --------------------- Middlewares --------------------
bot.use(session());
bot.use(stage.middleware());

// --------------------- Handlers -----------------------
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

bot.hears('🤖 Задать AI-вопрос', async (ctx) => {
    ctx.session.awaitAI = true; // следующий текст — вопрос к AI
    await ctx.reply('Сформулируй вопрос про AI/внедрение — отвечу как эксперт.');
});

bot.on('text', async (ctx, next) => {
    const text = (ctx.message?.text || '').trim();
    const known = [
        '⚡ PULSE — увеличить продажи',
        '🤖 Задать AI-вопрос',
        '📩 Записаться на подключение',
        'Эксперт / онлайн-курс',
        'Салон / косметолог',
        'Фитнес / wellness',
        'Психолог / терапевт',
        'Фриланс / digital-услуги',
        'B2B сервисы',
        'E-commerce / товары',
        'Другая ниша',
        'Да',
        'Интересно',
        'Назад в меню',
        'Главное меню'
    ];

    // 1) Явный режим вопроса к AI после кнопки
    if (ctx.session?.awaitAI) {
        ctx.session.awaitAI = false;
        try {
            await typing(ctx);
            const ans = await answerAI(text);
            return ctx.reply(ans, mainMenu);
        } catch (e) {
            console.error('AI error:', e.message);
            return ctx.reply('⚠️ Ошибка при обращении к модели. Попробуй ещё раз.', mainMenu);
        }
    }

    // 2) Фоллбек: не в сцене и не кнопка → считаем вопросом к AI
    const inScene = !!(ctx.scene && ctx.scene.current);
    if (!known.includes(text) && !inScene) {
        try {
            await typing(ctx);
            const ans = await answerAI(text);
            return ctx.reply(ans, mainMenu);
        } catch (e) {
            console.error('AI error:', e.message);
            return ctx.reply('⚠️ Ошибка при обращении к модели. Попробуй ещё раз.', mainMenu);
        }
    }

    return next();
});

// --------------------- Webhook & Server ---------------
app.get('/', (_, res) => res.send('✅ AI24Solutions работает'));

app.use(bot.webhookCallback('/telegram'));
bot.telegram
    .setWebhook(`${process.env.DOMAIN}/telegram`)
    .then(() => console.log('📡 Webhook установлен'))
    .catch(console.error);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Сервер слушает порт ${PORT}`));
