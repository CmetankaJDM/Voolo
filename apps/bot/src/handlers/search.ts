/**
 * Поиск по маршруту из чата.
 *
 * Сценарий нарочно узкий: чат — это быстрый вопрос «сколько стоит туда-то».
 * Всё остальное — гибкие даты, подбор направлений, календарь — живёт в Mini App.
 */

import { InlineKeyboard, type Bot } from "grammy"

import type { VooloContext } from "../bot"
import { cityName, parseRoute } from "../lib/iata"
import { createProvider, ProviderError } from "../providers/travelpayouts"
import { renderPaywall, renderSearchResults } from "../rich/templates"
import { mainKeyboard } from "./start"

export function registerSearch(bot: Bot<VooloContext>): void {
	bot.on("message:text", async (ctx) => {
		const route = parseRoute(ctx.message.text)
		if (!route) {
			await ctx.reply(ctx.t("unknown"), { reply_markup: mainKeyboard(ctx) })
			return
		}

		const quota = await ctx.spendSearch()
		if (!quota.allowed) {
			await ctx.rich.sendBlocks(
				ctx.chat.id,
				renderPaywall({
					priceStars: ctx.config.plusPriceStars,
					days: ctx.config.plusDurationDays,
					searchesUsed: quota.limit,
					searchesLimit: quota.limit,
				}),
				{
					reply_markup: new InlineKeyboard().text(
						`⭐ ${ctx.config.plusPriceStars} — ${ctx.t("button.plus")}`,
						"plus:buy",
					),
				},
			)
			return
		}

		// Запрос к провайдеру идёт секунды — без этого чат выглядит зависшим.
		await ctx.replyWithChatAction("typing")

		ctx.session.lastOrigin = route.origin
		ctx.session.lastDestination = route.destination

		const provider = createProvider(ctx.env)

		try {
			const offers = await provider.cheapest({
				origin: route.origin,
				destination: route.destination,
				currency: ctx.user.currency,
			})

			const keyboard = new InlineKeyboard()
			if (offers[0]) {
				keyboard.url(ctx.t("button.aviasales"), offers[0].deepLink).row()
			}
			keyboard.text(
				"📉 Следить за ценой",
				`watch:add:${route.origin}:${route.destination}`,
			)
			if (ctx.config.miniappUrl.startsWith("https://")) {
				keyboard.row().webApp(ctx.t("button.open"), ctx.config.miniappUrl)
			}

			await ctx.rich.sendBlocks(
				ctx.chat.id,
				renderSearchResults({
					originName: cityName(route.origin, ctx.locale),
					destinationName: cityName(route.destination, ctx.locale),
					offers,
					isPremium: ctx.isPlus,
					freeLimit: ctx.config.freeResultsLimit,
				}),
				{ reply_markup: keyboard },
			)
		} catch (error) {
			if (error instanceof ProviderError) {
				console.warn("provider failed", error.status, error.message)
				await ctx.reply(ctx.t("error.provider"))
				return
			}
			throw error
		}
	})
}
