// server.js (фрагмент с полной реализацией подписки)
const fs = require('fs');
const path = require('path');

// Путь к JSON-файлу с платными пользователями
const PAID_USERS_PATH = path.join(__dirname, 'paid_users.json');

// Загружаем платных пользователей из файла
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

// Сохраняем платных пользователей в файл
function savePaidUsers() {
  fs.writeFileSync(PAID_USERS_PATH, JSON.stringify([...paidUsers], null, 2));
}

// /addpaid @username
bot.command('addpaid', async (ctx) => {
  const adminId = parseInt(process.env.ADMIN_ID);
  if (ctx.from.id !== adminId) return ctx.reply("❌ Нет прав доступа.");

  const args = ctx.message.text.split(" ");
  if (args.length < 2 || !args[1].startsWith("@")) {
    return ctx.reply("⚠️ Использование: /addpaid @username");
  }

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

// /listpaid
bot.command('listpaid', async (ctx) => {
  const adminId = parseInt(process.env.ADMIN_ID);
  if (ctx.from.id !== adminId) return ctx.reply("❌ Нет прав доступа.");

  const list = [...paidUsers];
  if (list.length === 0) return ctx.reply("⚠️ Список подписчиков пуст.");
  ctx.reply(`👥 Подписчики (${list.length}):\n` + list.map(id => `• ${id}`).join("\n"));
});

// /remove @username
bot.command('remove', async (ctx) => {
  const adminId = parseInt(process.env.ADMIN_ID);
  if (ctx.from.id !== adminId) return ctx.reply("❌ Нет прав доступа.");

  const args = ctx.message.text.split(" ");
  if (args.length < 2 || !args[1].startsWith("@")) {
    return ctx.reply("⚠️ Использование: /remove @username");
  }

  const username = args[1].substring(1);
  try {
    const chat = await bot.telegram.getChat(`@${username}`);
    if (!paidUsers.has(chat.id)) {
      return ctx.reply(`⚠️ @${username} не найден в подписке.`);
    }
    paidUsers.delete(chat.id);
    savePaidUsers();
    ctx.reply(`✅ @${username} удалён из подписчиков.`);
  } catch (err) {
    console.error("❌ Ошибка удаления:", err);
    ctx.reply("❌ Не удалось найти пользователя.");
  }
});
