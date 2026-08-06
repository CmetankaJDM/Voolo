/**
 * Оплата Telegram Stars.
 *
 * Жёсткие правила платёжного контура (ADR-005):
 *  1. Заказ создаётся в базе ДО инвойса. Иначе на pre_checkout нечего проверять.
 *  2. answerPreCheckoutQuery обязан уложиться в 10 секунд. Никаких сетевых
 *     вызовов там — только один быстрый селект.
 *  3. Начисление привязано к telegram_payment_charge_id с уникальным индексом —
 *     это единственная надёжная защита от двойного начисления.
 *
 * Методы Bot API зовём через api.raw: там один объект-аргумент ровно той же
 * формы, что в документации Telegram — нечего перепутать в порядке аргументов.
 */

import { grantAccess, payments as paymentsTable } from "@voolo/db"
import { and, desc, eq } from "drizzle-orm"
import { InlineKeyboard, type Bot } from "grammy"

import type { VooloContext } from "../bot"
import { renderPaywall } from "../rich/templates"

const PAYLOAD_PREFIX = "plus"

function buildPayload(userId: number): string {
	// До 128 байт. Коротко и без ПДн.
	return `${PAYLOAD_PREFIX}:${userId}:${Date.now().toString(36)}`
}

async function sendPaywall(ctx: VooloContext): Promise<void> {
	await ctx.rich.sendBlocks(
		ctx.chat!.id,
		renderPaywall({
			priceStars: ctx.config.plusPriceStars,
			days: ctx.config.plusDurationDays,
			searchesUsed: ctx.config.freeSearchesPerDay,
			searchesLimit: ctx.config.freeSearchesPerDay,
		}),
		{
			reply_markup: new InlineKeyboard().text(
				`⭐ ${ctx.config.plusPriceStars} — ${ctx.t("button.plus")}`,
				"plus:buy",
			),
		},
	)
}

async function sendInvoice(ctx: VooloContext): Promise<void> {
	const payload = buildPayload(ctx.user.id)

	await ctx.db.insert(paymentsTable).values({
		userId: ctx.user.id,
		payload,
		stars: ctx.config.plusPriceStars,
		plan: "plus",
		durationDays: ctx.config.plusDurationDays,
		status: "pending",
	})

	await ctx.api.raw.sendInvoice({
		chat_id: ctx.chat!.id,
		title: ctx.t("pay.invoice.title", { days: ctx.config.plusDurationDays }),
		description: ctx.t("pay.invoice.description", {
			watches: ctx.config.plusMaxWatches,
		}),
		payload,
		// Звёзды: валюта XTR, пустой provider_token, целое число без умножения на 100.
		provider_token: "",
		currency: "XTR",
		prices: [
			{
				label: ctx.t("button.plus"),
				amount: ctx.config.plusPriceStars,
			},
		],
	})
}

export function registerPayments(bot: Bot<VooloContext>): void {
	bot.command("plus", async (ctx) => {
		if (ctx.isPlus) {
			await ctx.reply(ctx.t("pay.already", { date: "—" }))
			return
		}
		await sendPaywall(ctx)
	})

	bot.callbackQuery("plus:open", async (ctx) => {
		await ctx.answerCallbackQuery()
		if (ctx.isPlus) {
			await ctx.reply(ctx.t("pay.already", { date: "—" }))
			return
		}
		await sendPaywall(ctx)
	})

	bot.callbackQuery("plus:buy", async (ctx) => {
		await ctx.answerCallbackQuery()
		if (ctx.isPlus) {
			await ctx.reply(ctx.t("pay.already", { date: "—" }))
			return
		}
		await sendInvoice(ctx)
	})

	/**
	 * Десять секунд на ответ. Не успели — Telegram сам отменяет платёж,
	 * и пользователь видит ошибку без объяснений.
	 */
	bot.on("pre_checkout_query", async (ctx) => {
		const payload = ctx.preCheckoutQuery.invoice_payload

		const [order] = await ctx.db
			.select({ status: paymentsTable.status, userId: paymentsTable.userId })
			.from(paymentsTable)
			.where(eq(paymentsTable.payload, payload))
			.limit(1)

		const valid =
			order !== undefined &&
			order.status === "pending" &&
			order.userId === ctx.preCheckoutQuery.from.id

		await ctx.api.raw.answerPreCheckoutQuery({
			pre_checkout_query_id: ctx.preCheckoutQuery.id,
			ok: valid,
			error_message: valid
				? undefined
				: "Заказ устарел. Откройте /plus и попробуйте ещё раз.",
		})
	})

	bot.on("message:successful_payment", async (ctx) => {
		const payment = ctx.message.successful_payment

		const updated = await ctx.db
			.update(paymentsTable)
			.set({
				status: "paid",
				telegramPaymentChargeId: payment.telegram_payment_charge_id,
				paidAt: Math.floor(Date.now() / 1000),
			})
			.where(
				and(
					eq(paymentsTable.payload, payment.invoice_payload),
					eq(paymentsTable.status, "pending"),
				),
			)
			.returning({ durationDays: paymentsTable.durationDays })

		// Пустой результат — этот апдейт уже обработан. Повторно не начисляем.
		const order = updated[0]
		if (!order) return

		const expiresAt = await grantAccess(
			ctx.db,
			ctx.user.id,
			order.durationDays,
			"payment",
		)

		const date = new Date(expiresAt * 1000).toLocaleDateString(
			ctx.locale === "ru" ? "ru-RU" : "en-GB",
			{ day: "numeric", month: "long" },
		)

		await ctx.reply(`${ctx.t("pay.title")}\n${ctx.t("pay.body", { date })}`)
	})

	/**
	 * Возврат с первого релиза. Без него любой спор уходит в поддержку Telegram,
	 * и там разбираются уже не в нашу пользу.
	 */
	bot.command("refund", async (ctx) => {
		const [last] = await ctx.db
			.select({
				id: paymentsTable.id,
				chargeId: paymentsTable.telegramPaymentChargeId,
				paidAt: paymentsTable.paidAt,
			})
			.from(paymentsTable)
			.where(
				and(
					eq(paymentsTable.userId, ctx.user.id),
					eq(paymentsTable.status, "paid"),
				),
			)
			.orderBy(desc(paymentsTable.paidAt))
			.limit(1)

		if (!last?.chargeId) {
			await ctx.reply("Оплаченных заказов не нашлось.")
			return
		}

		await ctx.api.raw.refundStarPayment({
			user_id: ctx.user.id,
			telegram_payment_charge_id: last.chargeId,
		})

		await ctx.db
			.update(paymentsTable)
			.set({ status: "refunded", refundedAt: Math.floor(Date.now() / 1000) })
			.where(eq(paymentsTable.id, last.id))

		await ctx.reply(ctx.t("pay.refunded"))
	})
}
