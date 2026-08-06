/**
 * Команды знакомства и сервисные: /start, /help, /app, /lang, /status.
 */

import { peekSearchQuota, setUserLocale } from "@voolo/db"
import { Bot, InlineKeyboard } from "grammy"

import type { VooloContext } from "../bot"
import { b, footer, h, li, list, p } from "../rich/builders"

/**
 * Клавиатура с кнопкой Mini App.
 *
 * web_app требует https. Пока MINIAPP_URL не задан (локальная разработка) —
 * кнопку просто не показываем, а не падаем с ошибкой Bad Request.
 */
export function mainKeyboard(ctx: VooloContext): InlineKeyboard | undefined {
	const keyboard = new InlineKeyboard()
	let hasButton = false

	if (ctx.config.miniappUrl.startsWith("https://")) {
		keyboard.webApp(ctx.t("button.open"), ctx.config.miniappUrl)
		hasButton = true
	}

	if (!ctx.isPlus) {
		keyboard.row().text(`⭐ ${ctx.t("button.plus")}`, "plus:open")
		hasButton = true
	}

	return hasButton ? keyboard : undefined
}

export function registerStart(bot: Bot<VooloContext>): void {
	bot.command("start", async (ctx) => {
		await ctx.rich.sendBlocks(
			ctx.chat.id,
			[
				h(`✈️ ${ctx.t("start.title", { name: ctx.user.firstName ?? "" }).trim()}`),
				p(ctx.t("start.body")),
				list([
					li([b("Найти цену"), " — напишите «Москва — Стамбул»"]),
					li([b("Подобрать направление"), " — по бюджету, в приложении"]),
					li([b("Следить за ценой"), " — пришлю алерт, когда упадёт"]),
				]),
				footer(ctx.t("start.hint")),
			],
			{ reply_markup: mainKeyboard(ctx) },
		)
	})

	bot.command("help", async (ctx) => {
		await ctx.rich.sendBlocks(
			ctx.chat.id,
			[
				h(ctx.t("help.title")),
				p(ctx.t("help.body")),
				h(ctx.t("help.commands")),
				list([
					li([b("/app"), " — открыть приложение"]),
					li([b("/watch"), " — список отслеживаний"]),
					li([b("/plus"), " — подключить Voolo Plus"]),
					li([b("/status"), " — текущий план и лимиты"]),
					li([b("/lang"), " — переключить язык"]),
				]),
				footer(
					"Цены — из кэша Aviasales за последние дни, а не поиск в реальном времени. Мы всегда пишем, когда цена была найдена.",
				),
			],
			{ reply_markup: mainKeyboard(ctx) },
		)
	})

	bot.command("app", async (ctx) => {
		const keyboard = mainKeyboard(ctx)
		if (!keyboard) {
			await ctx.reply("Приложение ещё не опубликовано. Поиск в чате уже работает.")
			return
		}
		await ctx.reply(ctx.t("start.hint"), { reply_markup: keyboard })
	})

	bot.command("lang", async (ctx) => {
		const next = ctx.locale === "ru" ? "en" : "ru"
		await setUserLocale(ctx.db, ctx.user.id, next)
		// Отвечаем уже на новом языке — иначе подтверждение выглядит так, будто ничего не произошло.
		const { createTranslator } = await import("../i18n")
		await ctx.reply(createTranslator(next)("lang.changed"))
	})

	bot.command("status", async (ctx) => {
		if (ctx.isPlus) {
			await ctx.reply(ctx.t("status.plus", { date: "—" }))
			return
		}

		const used = await peekSearchQuota(ctx.db, ctx.user.id)
		const left = Math.max(0, ctx.config.freeSearchesPerDay - used)
		await ctx.reply(ctx.t("status.free", { left }), {
			reply_markup: mainKeyboard(ctx),
		})
	})
}
