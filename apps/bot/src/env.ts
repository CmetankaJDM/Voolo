/// <reference types="@cloudflare/workers-types" />

/**
 * Привязки Worker и конфигурация.
 *
 * Всё, что приходит из wrangler.toml как [vars], — строки. Разбор и валидация
 * в одном месте, чтобы в хендлерах не встречалось parseInt по месту.
 */

export type Env = {
	// Привязки
	DB: D1Database

	// Секреты — только через wrangler secret put
	BOT_TOKEN: string
	TELEGRAM_WEBHOOK_SECRET: string
	TP_TOKEN: string

	// Переменные
	TP_MARKER: string
	MINIAPP_URL: string
	DEFAULT_LOCALE: string
	DEFAULT_CURRENCY: string
	FREE_SEARCHES_PER_DAY: string
	FREE_RESULTS_LIMIT: string
	PLUS_PRICE_STARS: string
	PLUS_DURATION_DAYS: string
	PLUS_MAX_WATCHES: string
	ENVIRONMENT: string
	ADMIN_USER_IDS?: string
}

export type Config = {
	defaultLocale: "ru" | "en"
	defaultCurrency: string
	freeSearchesPerDay: number
	freeResultsLimit: number
	plusPriceStars: number
	plusDurationDays: number
	plusMaxWatches: number
	isProduction: boolean
	adminUserIds: number[]
	miniappUrl: string
	marker: string
}

function toInt(value: string | undefined, fallback: number): number {
	const parsed = Number.parseInt(value ?? "", 10)
	return Number.isFinite(parsed) ? parsed : fallback
}

export function readConfig(env: Env): Config {
	return {
		defaultLocale: env.DEFAULT_LOCALE === "en" ? "en" : "ru",
		defaultCurrency: env.DEFAULT_CURRENCY || "RUB",
		freeSearchesPerDay: toInt(env.FREE_SEARCHES_PER_DAY, 3),
		freeResultsLimit: toInt(env.FREE_RESULTS_LIMIT, 3),
		plusPriceStars: toInt(env.PLUS_PRICE_STARS, 150),
		plusDurationDays: toInt(env.PLUS_DURATION_DAYS, 30),
		plusMaxWatches: toInt(env.PLUS_MAX_WATCHES, 10),
		isProduction: env.ENVIRONMENT === "production",
		adminUserIds: (env.ADMIN_USER_IDS ?? "")
			.split(",")
			.map((value) => Number.parseInt(value.trim(), 10))
			.filter((value) => Number.isFinite(value)),
		miniappUrl: env.MINIAPP_URL || "",
		marker: env.TP_MARKER || "",
	}
}

/**
 * Падать на старте, а не в середине диалога с пользователем.
 * Вызывается один раз на входящий запрос — проверки дешёвые.
 */
export function assertRequiredSecrets(env: Env): void {
	const missing: string[] = []

	if (!env.BOT_TOKEN) missing.push("BOT_TOKEN")
	if (!env.TELEGRAM_WEBHOOK_SECRET) missing.push("TELEGRAM_WEBHOOK_SECRET")
	if (!env.TP_TOKEN) missing.push("TP_TOKEN")

	if (missing.length > 0) {
		throw new Error(`Не заданы секреты: ${missing.join(", ")}`)
	}
}
