/**
 * Точка входа Worker.
 *
 * Три маршрута:
 *   POST /telegram/webhook — апдейты от Telegram
 *   GET  /health           — проверка живости
 *   *    /api/*            — API для Mini App
 *
 * Плюс scheduled — ежедневная проверка отслеживаемых цен.
 */

import { claimUpdate, createDb } from "@voolo/db"
import type { Update } from "grammy/types"

import { handleApiRequest } from "./api/router"
import { createBot } from "./bot"
import { runPriceWatch } from "./cron/price-watch"
import { assertRequiredSecrets, type Env } from "./env"
import { safeCompare } from "./lib/crypto"

const WEBHOOK_PATH = "/telegram/webhook"

export default {
	async fetch(
		request: Request,
		env: Env,
		ctx: ExecutionContext,
	): Promise<Response> {
		const url = new URL(request.url)

		if (url.pathname === "/health") {
			return new Response("ok", { headers: { "content-type": "text/plain" } })
		}

		if (url.pathname.startsWith("/api/")) {
			return handleApiRequest(request, env, ctx)
		}

		if (url.pathname !== WEBHOOK_PATH) {
			return new Response("not found", { status: 404 })
		}

		if (request.method !== "POST") {
			return new Response("method not allowed", { status: 405 })
		}

		assertRequiredSecrets(env)

		/**
		 * Секрет из setWebhook. Без этой проверки любой желающий может прислать
		 * нам выдуманный апдейт от имени чужого user_id — URL вебхука публичен.
		 * Сравнение только за постоянное время.
		 */
		const presented = request.headers.get("x-telegram-bot-api-secret-token") ?? ""
		if (!safeCompare(presented, env.TELEGRAM_WEBHOOK_SECRET)) {
			return new Response("unauthorized", { status: 401 })
		}

		let update: Update
		try {
			update = (await request.json()) as Update
		} catch {
			// Битый JSON ретраить бессмысленно — отвечаем 200 и забываем.
			return new Response("ok")
		}

		/**
		 * Дедуп. Telegram повторяет доставку, если не получил 200 вовремя.
		 * Без защиты это двойное списание квоты и двойной ответ в чат.
		 */
		if (typeof update.update_id === "number") {
			const db = createDb(env.DB)
			const claimed = await claimUpdate(db, update.update_id)
			if (!claimed) return new Response("ok")
		}

		const bot = createBot(env)
		await bot.init()

		try {
			await bot.handleUpdate(update)
		} catch (error) {
			// bot.catch уже отработал. Сюда попадают только сбои самого grammY.
			console.error("handleUpdate failed", error)
		}

		// Всегда 200: любой другой код заставит Telegram ретраить тот же апдейт.
		return new Response("ok")
	},

	async scheduled(
		_event: ScheduledController,
		env: Env,
		ctx: ExecutionContext,
	): Promise<void> {
		ctx.waitUntil(runPriceWatch(env))
	},
} satisfies ExportedHandler<Env>
