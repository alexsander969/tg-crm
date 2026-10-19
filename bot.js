import { Bot, GrammyError, HttpError } from "grammy";
import http from "http";
import "dotenv/config";
import fetch from "node-fetch";

const WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbxITvMCf89I-hb5AvOjH7XqySRMlzOWFigHjAiFJAW-KXhRf3bZei1hL4QXtxbDhk-bHg/exec";

// Хранилище сессий пользователей в памяти (для MVP и портфолио идеально)
const userSessions = {};

function registerHandlers(bot) {
bot.command("start", async (ctx) => {
  await ctx.reply(
    "Привет! 👋 Я CRM-бот для сбора заявок.\n\nНажмите /new, чтобы оставить новую заявку."
  );
});

bot.command("new", async (ctx) => {
  const userId = ctx.from.id;
  userSessions[userId] = { step: "name" };
  await ctx.reply("Пожалуйста, введите ваше <b>Имя</b>:", { parse_mode: "HTML" });
});

bot.on("message:text", async (ctx) => {
  const userId = ctx.from.id;
  const text = ctx.message.text;

  if (!userSessions[userId]) return;

  const session = userSessions[userId];

  if (session.step === "name") {
    session.name = text;
    session.step = "phone";
    await ctx.reply("Отлично! Теперь укажите ваш <b>Номер телефона</b>:", { parse_mode: "HTML" });
  } else if (session.step === "phone") {
    session.phone = text;
    session.step = "service";
    await ctx.reply("Какая <b>услуга</b> вас интересует?", { parse_mode: "HTML" });
  } else if (session.step === "service") {
    session.service = text;
    session.username = ctx.from.username ? `@${ctx.from.username}` : "нет username";

    const leadData = {
      name: session.name,
      phone: session.phone,
      service: session.service,
      username: session.username,
    };

    try {
      // Отправляем данные на вебхук Google Таблицы
      const response = await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(leadData),
      });

      const result = await response.json();
      console.log("Ответ от Google Таблицы:", result);

      await ctx.reply(
        "✅ <b>Спасибо! Ваша заявка успешно принята.</b>\nМенеджер свяжется с вами в ближайшее время.",
        { parse_mode: "HTML" }
      );
    } catch (error) {
      console.error("Ошибка отправки в таблицу:", error);
      await ctx.reply("❌ Произошла ошибка при сохранении заявки. Попробуйте позже через /new.");
    }

    // Очищаем сессию
    delete userSessions[userId];
  }
});
}

async function main() {
  const token = process.env.BOT_TOKEN?.trim();
  if (!token) {
    throw new Error("BOT_TOKEN не задан. Проверьте переменную в файле .env.");
  }

  const bot = new Bot(token);
  registerHandlers(bot);
  bot.catch((err) => {
    console.error(
      `Ошибка обработки обновления ${err.ctx.update.update_id}:`,
      err.error,
    );
  });

  console.log("Подключаюсь к Telegram...");
  await bot.start({
    onStart: () => console.log("🚀 CRM-бот запущен и подключён к Telegram."),
  });
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  const safeMessage = process.env.BOT_TOKEN
    ? message.split(process.env.BOT_TOKEN).join("[REDACTED]")
    : message;

  if (error instanceof GrammyError && error.error_code === 401) {
    console.error(
      "Telegram отклонил BOT_TOKEN (401 Unauthorized). "
      + "Создайте новый токен через @BotFather, обновите BOT_TOKEN в .env и перезапустите бота.",
    );
  } else if (error instanceof GrammyError) {
    console.error(`Telegram API: ${error.description}`);
  } else if (error instanceof HttpError) {
    console.error(
      "Не удалось подключиться к Telegram API. Проверьте интернет-соединение.",
      safeMessage,
    );
  } else {
    console.error("Не удалось запустить бота:", safeMessage);
  }
  process.exitCode = 1;
});

const port = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200);
  res.end("CRM Bot is alive");
}).listen(port, () => console.log(`Server listening on port ${port}`));
