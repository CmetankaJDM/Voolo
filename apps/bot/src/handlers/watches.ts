/**
 * Отслеживание цены из чата.
 *
 * Самая важная функция удержания: поиск человек делает раз, а алерты
 * возвращают его в бота каждую неделю без единого пуша «просто так».
 */

import { countWatches, createWatch, deleteWatch, listWatches } from "@voolo/db"
import { InlineKeyboard, type Bot } from "grammy"

import type { VooloContext } from "../bot"
import { cityName } from "../lib/iata"
import { b, footer, h, li, list, p } from "../rich/builders"
import { formatPrice } from "../rich/templates"
import { mainKeyboard } from "./start"

/**
 * Бесплатно — один маршрут. Этого хватает, чтобы почувствовать пользу от
 * алертов, и мало, чтобы закрыть потребность целиком.
 */
const FREE_MAX_WATCHES = 1

function routeLabel(
	watch: { origin: string; destination: string; departMonth: string | null },
	locale: "ru" | "en",
): string {
	const route = `${cityName(watch.origin, locale)} → ${cityName(watch.destination, locale)}`
	return watch.departMonth ? `${route}, ${watch.departMonth}` : route
}

export function registerWatches(bot: Bot<VooloContext>): void {
	bot.command(["watch", "watches"], async (ctx) => {
		const watches = await listWatches(ctx.db, ctx.user.id)

		if (watches.length === 0) {
			await ctx.reply(ctx.t("watch.empty"), { reply_markup: mainKeyboard(ctx) })
			return
		}

		const keyboard = new InlineKeyboard()
		for (const watch of watches) {
			keyboard
				.text(`✖️ ${routeLabel(watch, ctx.locale)}`, `watch:del:${watch.id}`)
				.row()
		}

		await ctx.rich.sendBlocks(
			ctx.chat.id,
			[
				h("📉 Отслеживание цен"),
				list(
					watches.map((watch) =>
						li([
							b(routeLabel(watch, ctx.locale)),
							watch.lastPrice
								? ` — сейчас ${formatPrice(watch.lastPrice, ctx.user.currency)}`
								: " — цена ещё не проверялась",
							watch.targetPrice
								? `, цель ${formatPrice(watch.targetPrice, ctx.user.currency)}`
								: "",
						]),
					),
				),
				footer("Проверяю раз в сутки. Пишу только когда цена реально упала."),
			],
			{ reply_markup: keyboard },
		)
	})

	bot.callbackQuery(/^watch:add:([A-Z]{3}):([A-Z]{3})$/, async (ctx) => {
		const [, origin, destination] = ctx.match as RegExpMatchArray

		const limit = ctx.isPlus ? ctx.config.plusMaxWatches : FREE_MAX_WATCHES
		const current = await countWatches(ctx.db, ctx.user.id)

		if (current >= limit) {
			await ctx.answerCallbackQuery({
				text: ctx.t("watch.limit", { limit }),
				show_alert: true,
			})
			if (!ctx.isPlus) {
				await ctx.reply(ctx.t("watch.limit", { limit }), {
					reply_markup: new InlineKeyboard().text(
						`⭐ ${ctx.config.plusPriceStars} — ${ctx.t("button.plus")}`,
						"plus:buy",
					),
				})
			}
			return
		}

		await createWatch(ctx.db, {
			userId: ctx.user.id,
			origin: origin!,
			destination: destination!,
			departMonth: ctx.session.lastDepartMonth ?? null,
		})

		await ctx.answerCallbackQuery({ text: ctx.t("watch.saved") })
		await ctx.rich.sendBlocks(ctx.chat!.id, [
			p([
				"📉 ",
				b(routeLabel(
					{ origin: origin!, destination: destination!, departMonth: null },
					ctx.locale,
				)),
				" — слежу. Напишу, когда цена упадёт.",
			]),
		])
	})

	bot.callbackQuery(/^watch:del:(\d+)$/, async (ctx) => {
		const id = Number((ctx.match as RegExpMatchArray)[1])
		const removed = await deleteWatch(ctx.db, ctx.user.id, id)

		await ctx.answerCallbackQuery({
			text: removed ? ctx.t("watch.removed") : ctx.t("error.generic"),
		})

		if (removed) {
			// Клавиатура устарела — убираем её, чтобы не жали повторно.
			await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {})
		}
	})
}
