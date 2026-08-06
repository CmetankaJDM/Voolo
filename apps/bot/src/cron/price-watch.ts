/**
 * Ежедневная проверка отслеживаемых маршрутов.
 *
 * Ценность алерта обратно пропорциональна их частоте. Поэтому пишем только
 * при реальном падении (порог пользователя или −7% к прошлой цене) и не чаще
 * раза в сутки на маршрут.
 *
 * Ограничение Worker: пачка за запуск. Остаток берёт следующий запуск —
 * listWatchesDue сортирует по давности проверки, так что голодания не будет.
 */

import {
	createDb,
	deactivateUser,
	listWatchesDue,
	markWatchChecked,
	pruneStaleRows,
	schema,
	type Watch,
} from "@voolo/db"
import { eq } from "drizzle-orm"

import { readConfig, type Env } from "../env"
import { cityName } from "../lib/iata"
import { createProvider, ProviderError } from "../providers/travelpayouts"
import { RichClient } from "../rich/client"
import { renderDealCard } from "../rich/templates"

/** Сколько маршрутов берём за один запуск. */
const BATCH_SIZE = 40

/** Не проверяем чаще раза в 20 часов — кэш источника всё равно медленнее. */
const STALE_SECONDS = 20 * 3600

/** Минимальное падение, ради которого стоит беспокоить человека. */
const DROP_RATIO = 0.93

export async function runPriceWatch(env: Env): Promise<void> {
	const db = createDb(env.DB)
	const config = readConfig(env)
	const provider = createProvider(env)
	const rich = new RichClient(env.BOT_TOKEN)

	const due = await listWatchesDue(db, STALE_SECONDS, BATCH_SIZE)
	console.log("price-watch start", { due: due.length })

	for (const watch of due) {
		try {
			await processWatch({ db, provider, rich, watch, defaultCurrency: config.defaultCurrency })
		} catch (error) {
			// Один упавший маршрут не должен ронять весь запуск.
			console.warn("watch failed", {
				watchId: watch.id,
				error: error instanceof Error ? error.message : String(error),
			})

			if (!(error instanceof ProviderError)) {
				await markWatchChecked(db, watch.id, watch.lastPrice, false)
			}
		}
	}

	await pruneStaleRows(db)
	console.log("price-watch done")
}

async function processWatch(input: {
	db: ReturnType<typeof createDb>
	provider: ReturnType<typeof createProvider>
	rich: RichClient
	watch: Watch
	defaultCurrency: string
}): Promise<void> {
	const { db, provider, rich, watch } = input

	const [user] = await db
		.select({
			currency: schema.users.currency,
			locale: schema.users.locale,
			isBlocked: schema.users.isBlocked,
		})
		.from(schema.users)
		.where(eq(schema.users.id, watch.userId))
		.limit(1)

	if (!user || user.isBlocked) {
		await markWatchChecked(db, watch.id, watch.lastPrice, false)
		return
	}

	const currency = user.currency || input.defaultCurrency
	const offers = await provider.cheapest({
		origin: watch.origin,
		destination: watch.destination,
		departMonth: watch.departMonth ?? undefined,
		currency,
	})

	const best = offers[0]
	if (!best) {
		await markWatchChecked(db, watch.id, watch.lastPrice, false)
		return
	}

	const nowSeconds = Math.floor(Date.now() / 1000)
	const notifiedRecently =
		watch.lastNotifiedAt !== null && nowSeconds - watch.lastNotifiedAt < STALE_SECONDS

	const hitTarget = watch.targetPrice !== null && best.price <= watch.targetPrice
	const dropped =
		watch.lastPrice !== null && best.price <= Math.floor(watch.lastPrice * DROP_RATIO)

	const shouldNotify = !notifiedRecently && (hitTarget || dropped)

	if (!shouldNotify) {
		await markWatchChecked(db, watch.id, best.price, false)
		return
	}

	const result = await rich.sendBlocks(
		watch.userId,
		renderDealCard({
			offer: best,
			originName: cityName(watch.origin, user.locale),
			destinationName: cityName(watch.destination, user.locale),
			previousPrice: watch.lastPrice ?? undefined,
		}),
		{
			reply_markup: {
				inline_keyboard: [
					[{ text: "Посмотреть на Aviasales", url: best.deepLink }],
					[{ text: "✖️ Отключить алерт", callback_data: `watch:del:${watch.id}` }],
				],
			},
		},
	)

	// Заблокированный бот — это навсегда. Продолжать стучаться бессмысленно.
	if (!result.ok && /blocked|deactivated|chat not found/i.test(result.error ?? "")) {
		await deactivateUser(db, watch.userId)
		return
	}

	await markWatchChecked(db, watch.id, best.price, result.ok)
}
