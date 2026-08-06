/**
 * Сборка бота.
 *
 * Worker создаёт экземпляр на каждый входящий запрос. Это нормально:
 * изолят переиспользуется, а создание Bot — это сборка объекта, а не сеть.
 */

import {
	consumeSearchQuota,
	createD1SessionStorage,
	createDb,
	isPremium,
	upsertUser,
	type Db,
	type User,
} from "@voolo/db"
import { Bot, session, type Context, type SessionFlavor } from "grammy"

import { readConfig, type Config, type Env } from "./env"
import { createTranslator, type Locale, type Translator } from "./i18n"
import { registerHandlers } from "./handlers"
import { RichClient } from "./rich/client"

export type SessionData = {
	/** Последний маршрут — чтобы «ещё раз» работало без повторного ввода. */
	lastOrigin?: string
	lastDestination?: string
	lastDepartMonth?: string
}

export type VooloContext = Context &
	SessionFlavor<SessionData> & {
		env: Env
		config: Config
		db: Db
		rich: RichClient
		user: User
		locale: Locale
		t: Translator
		isPlus: boolean
		/** Списать поиск. Для Plus всегда allowed. */
		spendSearch: () => Promise<{ used: number; limit: number; allowed: boolean }>
	}

export function createBot(env: Env): Bot<VooloContext> {
	const config = readConfig(env)
	const db = createDb(env.DB)
	const rich = new RichClient(env.BOT_TOKEN)

	const bot = new Bot<VooloContext>(env.BOT_TOKEN)

	// Контекст — единственный способ для хендлеров добраться до базы и конфига.
	bot.use(async (ctx, next) => {
		ctx.env = env
		ctx.config = config
		ctx.db = db
		ctx.rich = rich
		await next()
	})

	bot.use(
		session({
			initial: (): SessionData => ({}),
			storage: createD1SessionStorage(db),
			getSessionKey: (ctx) =>
				ctx.from?.id === undefined ? undefined : `u${ctx.from.id}`,
		}),
	)

	// Пользователь, язык, статус подписки.
	bot.use(async (ctx, next) => {
		if (!ctx.from || ctx.from.is_bot) return

		const startPayload =
			typeof ctx.message?.text === "string" &&
			ctx.message.text.startsWith("/start ")
				? ctx.message.text.slice(7).trim().slice(0, 64)
				: undefined

		ctx.user = await upsertUser(ctx.db, {
			id: ctx.from.id,
			username: ctx.from.username,
			firstName: ctx.from.first_name,
			languageCode: ctx.from.language_code,
			referralSource: startPayload,
		})

		ctx.locale = ctx.user.locale
		ctx.t = createTranslator(ctx.locale)
		ctx.isPlus = await isPremium(ctx.db, ctx.user.id)

		ctx.spendSearch = async () => {
			if (ctx.isPlus) {
				return { used: 0, limit: Number.POSITIVE_INFINITY, allowed: true }
			}
			return consumeSearchQuota(ctx.db, ctx.user.id, config.freeSearchesPerDay)
		}

		await next()
	})

	registerHandlers(bot)

	/**
	 * Последний рубеж. Без него любая ошибка в хендлере превращается в 500,
	 * Telegram ретраит апдейт, и пользователь видит тишину вместо ответа.
	 */
	bot.catch(async (error) => {
		console.error("bot error", {
			updateId: error.ctx.update.update_id,
			userId: error.ctx.from?.id,
			error: error.error instanceof Error ? error.error.message : error.error,
		})

		try {
			const translate = error.ctx.t ?? createTranslator(config.defaultLocale)
			await error.ctx.reply(translate("error.generic"))
		} catch {
			// Если даже извиниться не вышло — пусть апдейт уйдёт тихо.
		}
	})

	return bot
}
