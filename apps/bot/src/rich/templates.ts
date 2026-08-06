/**
 * Шаблоны сообщений Voolo.
 *
 * Здесь и только здесь решается, как выглядит ответ бота. Хендлеры собирают
 * данные и зовут шаблон — никаких склеенных строк в бизнес-логике.
 *
 * Два правила тона:
 *  1. Не более двух эмодзи на сообщение.
 *  2. Цена из кэша всегда сопровождается честной датой находки (ADR-001).
 */

import {
	b,
	details,
	divider,
	footer,
	h,
	li,
	link,
	list,
	marked,
	p,
	table,
	td,
	th,
	thinking,
} from "./builders"
import type { InputRichBlock, RichText } from "./types"

// ── View-модели ──────────────────────────────────────────────────

export type FlightOffer = {
	origin: string
	destination: string
	price: number
	currency: string
	transfers: number
	airline: string
	flightNumber?: string
	departureAt: string
	returnAt?: string
	/** Когда цена была найдена в кэше Aviasales. */
	foundAt?: string
	/** Партнёрская ссылка с marker. */
	deepLink: string
}

export type CalendarDay = {
	date: string
	price: number
	currency: string
}

// ── Форматтеры ────────────────────────────────────────────────

export function formatPrice(value: number, currency: string): string {
	return new Intl.NumberFormat("ru-RU", {
		style: "currency",
		currency,
		maximumFractionDigits: 0,
	}).format(value)
}

export function formatDay(iso: string): string {
	return new Intl.DateTimeFormat("ru-RU", {
		day: "numeric",
		month: "short",
	}).format(new Date(iso))
}

export function formatTransfers(count: number): string {
	if (count === 0) return "прямой"
	if (count === 1) return "1 пересадка"
	if (count < 5) return `${count} пересадки`
	return `${count} пересадок`
}

/** Честная подпись о свежести цены. Обязательна по ADR-001. */
export function freshnessNote(foundAt?: string): string {
	if (!foundAt) return "Цена из кэша Aviasales, могла измениться."

	const days = Math.max(
		0,
		Math.round((Date.now() - new Date(foundAt).getTime()) / 86_400_000),
	)

	if (days === 0) return "Цена найдена сегодня. На сайте авиакомпании может отличаться."
	if (days === 1) return "Цена найдена вчера. Актуальную проверьте по кнопке."
	return `Цена найдена ${days} дн. назад. Актуальную проверьте по кнопке.`
}

// ── Шаблоны ───────────────────────────────────────────────────

/**
 * Главный экран выдачи. Бесплатному пользователю показываем топ-3,
 * остальное прячем под details.
 */
export function renderSearchResults(args: {
	originName: string
	destinationName: string
	offers: FlightOffer[]
	isPremium: boolean
	freeLimit?: number
}): InputRichBlock[] {
	const { originName, destinationName, offers, isPremium } = args
	const freeLimit = args.freeLimit ?? 3

	if (offers.length === 0) {
		return [
			h(`${originName} → ${destinationName}`),
			p("По этому маршруту в кэше пока нет цен."),
			list([
				li("Попробуйте соседние даты — разброс часто больше 30 %"),
				li("Или аэропорт рядом — иногда дешевле вдвое"),
			]),
			footer("Данные Aviasales. Кэш обновляется каждые несколько дней."),
		]
	}

	const sorted = [...offers].sort((left, right) => left.price - right.price)
	const visible = isPremium ? sorted : sorted.slice(0, freeLimit)
	const hidden = isPremium ? [] : sorted.slice(freeLimit)
	const best = sorted[0]!

	const rows = [
		[
			th("Дата"),
			th("Цена", { align: "right" }),
			th("Пересадки", { align: "center" }),
			th("Авиакомпания"),
		],
		...visible.map((offer) => {
			const priceText: RichText = formatPrice(offer.price, offer.currency)
			return [
				td(formatDay(offer.departureAt)),
				td(offer === best ? marked(b(priceText)) : priceText, {
					align: "right",
				}),
				td(formatTransfers(offer.transfers), { align: "center" }),
				td(link(offer.airline, offer.deepLink)),
			]
		}),
	]

	const blocks: InputRichBlock[] = [
		h(`✈️ ${originName} → ${destinationName}`),
		p(["Лучшая цена в кэше: ", b(formatPrice(best.price, best.currency))]),
		table(rows, { bordered: true, striped: true }),
	]

	if (hidden.length > 0) {
		blocks.push(
			divider(),
			p([
				b(`Ещё ${hidden.length} вариантов скрыто.`),
				" В Voolo Plus видны все найденные цены.",
			]),
		)
	}

	blocks.push(
		details("Как мы считаем", [
			p(
				"Мы не ищем билеты в реальном времени. Мы показываем цены, которые реальные люди уже находили в Aviasales за последние дни.",
			),
			list([
				li("Плюс: видно реальное дно цены, а не рекламная витрина"),
				li("Минус: к моменту покупки цена могла вырасти или упасть"),
				li("Кнопка ведёт на Aviasales — там видна цена на сейчас"),
			]),
		]),
		footer(freshnessNote(best.foundAt)),
	)

	return blocks
}

/** Карточка одного предложения — для алертов и избранного. */
export function renderDealCard(args: {
	offer: FlightOffer
	originName: string
	destinationName: string
	previousPrice?: number
}): InputRichBlock[] {
	const { offer, originName, destinationName, previousPrice } = args
	const dropped = previousPrice !== undefined && previousPrice > offer.price
	const delta = dropped ? previousPrice - offer.price : 0
	const percent = dropped ? Math.round((delta / previousPrice) * 100) : 0

	const blocks: InputRichBlock[] = [
		h(dropped ? `📉 ${originName} → ${destinationName}` : `${originName} → ${destinationName}`),
	]

	if (dropped) {
		blocks.push(
			p([
				"Цена упала на ",
				b(`${formatPrice(delta, offer.currency)} (−${percent} %)`),
			]),
		)
	}

	blocks.push(
		table(
			[
				[th("Цена"), td(marked(b(formatPrice(offer.price, offer.currency))))],
				[th("Вылет"), td(formatDay(offer.departureAt))],
				...(offer.returnAt ? [[th("Обратно"), td(formatDay(offer.returnAt))]] : []),
				[th("Пересадки"), td(formatTransfers(offer.transfers))],
				[th("Авиакомпания"), td(offer.airline)],
			],
			{ bordered: true },
		),
		p(link(b("Открыть на Aviasales"), offer.deepLink)),
		footer(freshnessNote(offer.foundAt)),
	)

	return blocks
}

/** Календарь цен: самые дешёвые дни месяца. */
export function renderPriceCalendar(args: {
	originName: string
	destinationName: string
	monthLabel: string
	days: CalendarDay[]
	limit?: number
}): InputRichBlock[] {
	const { originName, destinationName, monthLabel, days } = args
	const limit = args.limit ?? 7
	const cheapest = [...days].sort((left, right) => left.price - right.price).slice(0, limit)

	if (cheapest.length === 0) {
		return [
			h(`🗓 ${originName} → ${destinationName}`),
			p(`За ${monthLabel} цен в кэше не нашлось. Попробуйте соседний месяц.`),
		]
	}

	const best = cheapest[0]!

	return [
		h(`🗓 ${originName} → ${destinationName}, ${monthLabel}`),
		table(
			[
				[th("День"), th("Цена", { align: "right" })],
				...cheapest.map((day) => [
					td(formatDay(day.date)),
					td(
						day === best
							? marked(b(formatPrice(day.price, day.currency)))
							: formatPrice(day.price, day.currency),
						{ align: "right" },
					),
				]),
			],
			{ bordered: true, striped: true, caption: `Самые дешёвые дни месяца` },
		),
		footer("Полный календарь на три месяца вперёд — в Voolo Plus."),
	]
}

/** Экран перед оплатой звёздами. */
export function renderPaywall(args: {
	priceStars: number
	days: number
	searchesUsed: number
	searchesLimit: number
}): InputRichBlock[] {
	const { priceStars, days, searchesUsed, searchesLimit } = args

	return [
		h("⭐ Voolo Plus"),
		p([
			"Сегодня использовано ",
			b(`${searchesUsed} из ${searchesLimit}`),
			" бесплатных поисков.",
		]),
		list([
			li([b("Безлимитный поиск"), " и все найденные варианты, а не только топ-3"]),
			li([b("Календарь цен"), " на три месяца вперёд"]),
			li([b("До 10 отслеживаний"), " с алертом при падении цены"]),
			li([b("Подбор направлений"), " по бюджету без ограничений"]),
		]),
		divider(),
		p([b(`${priceStars} звёзд`), ` — доступ на ${days} дней.`]),
		footer(
			"Оплата через Telegram Stars. Автопродления нет — доступ просто закончится. Возврат по запросу в течение 14 дней.",
		),
	]
}

/** Промежуточный статус для sendRichMessageDraft. */
export function renderThinking(stage: string): InputRichBlock[] {
	return [thinking(stage)]
}
