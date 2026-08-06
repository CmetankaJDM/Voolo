/**
 * Провайдер цен: Aviasales Data API через Travelpayouts.
 *
 * Главное, что надо понимать про этот источник (ADR-001): это НЕ поиск в
 * реальном времени. Это база цен, которые живые люди находили за последние
 * дни. Поэтому каждое предложение несёт foundAt, а UI обязан его показать.
 * Реальное время (Flight Search API) открывается от 50 000 MAU — нам недоступно.
 *
 * Кэш: Cloudflare Cache API, а не KV. У бесплатного KV около тысячи записей в
 * сутки, что заканчивается на первой же сотне пользователей.
 */

import {
	buildDirectionLink,
	buildSearchLink,
	type CalendarDay,
	type Direction,
	type FlightOffer,
} from "@voolo/shared"
import { z } from "zod"

const API_HOST = "https://api.travelpayouts.com"

/** Кэш источника обновляется раз в несколько дней — час на нашей стороне ничего не теряет. */
const DEFAULT_TTL_SECONDS = 3600

export class ProviderError extends Error {
	constructor(
		message: string,
		readonly status?: number,
	) {
		super(message)
		this.name = "ProviderError"
	}
}

// ── Сырые схемы ответов ────────────────────────────────────────────────
// passthrough повсюду: лишние поля от провайдера не должны ронять поиск.

const rawOfferSchema = z
	.object({
		price: z.number(),
		airline: z.string().optional().default(""),
		flight_number: z.union([z.string(), z.number()]).optional(),
		departure_at: z.string().optional(),
		return_at: z.string().optional(),
		expires_at: z.string().optional(),
		found_at: z.string().optional(),
		transfers: z.number().optional(),
		number_of_changes: z.number().optional(),
		destination: z.string().optional(),
		origin: z.string().optional(),
	})
	.passthrough()

type RawOffer = z.infer<typeof rawOfferSchema>

const cheapResponseSchema = z.object({
	success: z.boolean().optional(),
	data: z.record(z.record(rawOfferSchema)).default({}),
})

const flatResponseSchema = z.object({
	success: z.boolean().optional(),
	data: z.record(rawOfferSchema).default({}),
})

// ── Клиент ───────────────────────────────────────────────────────────

export type TravelpayoutsOptions = {
	token: string
	marker: string
	locale?: "ru" | "en"
}

export class Travelpayouts {
	constructor(private readonly options: TravelpayoutsOptions) {}

	/**
	 * Самые дешёвые билеты по маршруту. Основной запрос поиска.
	 */
	async cheapest(input: {
		origin: string
		destination: string
		departMonth?: string
		returnMonth?: string
		currency: string
	}): Promise<FlightOffer[]> {
		const url = this.buildUrl("/v1/prices/cheap", {
			origin: input.origin,
			destination: input.destination,
			depart_date: input.departMonth,
			return_date: input.returnMonth,
			currency: input.currency,
		})

		const parsed = cheapResponseSchema.parse(await this.request(url))
		const offers: FlightOffer[] = []

		for (const [destination, group] of Object.entries(parsed.data)) {
			for (const raw of Object.values(group)) {
				const offer = this.toOffer(raw, input.origin, destination, input.currency)
				if (offer) offers.push(offer)
			}
		}

		return offers.sort((left, right) => left.price - right.price)
	}

	/** Цены по дням месяца. */
	async calendar(input: {
		origin: string
		destination: string
		month: string
		currency: string
	}): Promise<CalendarDay[]> {
		const url = this.buildUrl("/v1/prices/calendar", {
			origin: input.origin,
			destination: input.destination,
			depart_date: input.month,
			calendar_type: "departure_date",
			currency: input.currency,
		})

		const parsed = flatResponseSchema.parse(await this.request(url))

		return Object.entries(parsed.data)
			.map(([date, raw]) => ({
				date,
				price: Math.round(raw.price),
				currency: input.currency,
			}))
			.filter((day) => day.price > 0 && /^\d{4}-\d{2}-\d{2}$/.test(day.date))
			.sort((left, right) => left.date.localeCompare(right.date))
	}

	/** Куда можно улететь из города. Сердце сценария «ещё не решил, куда». */
	async directions(input: {
		origin: string
		currency: string
		budget?: number
		limit?: number
	}): Promise<Direction[]> {
		const url = this.buildUrl("/v1/city-directions", {
			origin: input.origin,
			currency: input.currency,
		})

		const parsed = flatResponseSchema.parse(await this.request(url))
		const directions: Direction[] = []

		for (const [destination, raw] of Object.entries(parsed.data)) {
			const offer = this.toOffer(raw, input.origin, destination, input.currency)
			if (!offer) continue
			if (input.budget !== undefined && offer.price > input.budget) continue
			directions.push(offer)
		}

		return directions
			.sort((left, right) => left.price - right.price)
			.slice(0, input.limit ?? 20)
	}

	/** Минимальная цена по месяцам — используется кроном отслеживания. */
	async monthly(input: {
		origin: string
		destination: string
		currency: string
	}): Promise<FlightOffer[]> {
		const url = this.buildUrl("/v1/prices/monthly", {
			origin: input.origin,
			destination: input.destination,
			currency: input.currency,
		})

		const parsed = flatResponseSchema.parse(await this.request(url))

		return Object.values(parsed.data)
			.map((raw) =>
				this.toOffer(raw, input.origin, input.destination, input.currency),
			)
			.filter((offer): offer is FlightOffer => offer !== null)
			.sort((left, right) => left.price - right.price)
	}

	// ── Внутреннее ─────────────────────────────────────────────────

	private buildUrl(
		path: string,
		params: Record<string, string | number | undefined>,
	): URL {
		const url = new URL(API_HOST + path)
		for (const [key, value] of Object.entries(params)) {
			if (value !== undefined && value !== "") url.searchParams.set(key, String(value))
		}
		return url
	}

	/**
	 * Запрос с кэшем. Токен уезжает в заголовок, а не в URL: иначе он оседает
	 * в ключе кэша и в логах.
	 */
	private async request(url: URL): Promise<unknown> {
		const cache = caches.default
		const cacheKey = new Request(url.toString(), { method: "GET" })

		const cached = await cache.match(cacheKey)
		if (cached) return cached.json()

		const response = await fetch(url.toString(), {
			headers: {
				"x-access-token": this.options.token,
				accept: "application/json",
			},
		})

		if (!response.ok) {
			throw new ProviderError(
				`Travelpayouts ответил ${response.status}`,
				response.status,
			)
		}

		const body = await response.text()

		await cache.put(
			cacheKey,
			new Response(body, {
				headers: {
					"content-type": "application/json",
					"cache-control": `max-age=${DEFAULT_TTL_SECONDS}`,
				},
			}),
		)

		try {
			return JSON.parse(body)
		} catch {
			throw new ProviderError("Travelpayouts вернул не JSON")
		}
	}

	private toOffer(
		raw: RawOffer,
		origin: string,
		destination: string,
		currency: string,
	): FlightOffer | null {
		const price = Math.round(raw.price)
		if (!Number.isFinite(price) || price <= 0) return null

		const resolvedOrigin = (raw.origin ?? origin).toUpperCase()
		const resolvedDestination = (raw.destination ?? destination).toUpperCase()
		const departureAt = raw.departure_at

		const deepLink = departureAt
			? buildSearchLink({
					origin: resolvedOrigin,
					destination: resolvedDestination,
					departureAt,
					returnAt: raw.return_at,
					marker: this.options.marker,
					currency,
					locale: this.options.locale,
				})
			: buildDirectionLink({
					origin: resolvedOrigin,
					destination: resolvedDestination,
					marker: this.options.marker,
					locale: this.options.locale,
				})

		return {
			origin: resolvedOrigin,
			destination: resolvedDestination,
			price,
			currency,
			transfers: raw.transfers ?? raw.number_of_changes ?? 0,
			airline: raw.airline || "—",
			flightNumber:
				raw.flight_number === undefined ? undefined : String(raw.flight_number),
			departureAt: departureAt ?? "",
			returnAt: raw.return_at,
			foundAt: raw.found_at,
			deepLink,
		}
	}
}

export function createProvider(env: {
	TP_TOKEN: string
	TP_MARKER: string
	DEFAULT_LOCALE: string
}): Travelpayouts {
	return new Travelpayouts({
		token: env.TP_TOKEN,
		marker: env.TP_MARKER,
		locale: env.DEFAULT_LOCALE === "en" ? "en" : "ru",
	})
}
