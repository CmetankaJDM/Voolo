/**
 * Контракты на границе «Mini App ↔ Worker» и нормализованные доменные типы.
 *
 * Правило: ни один внешний ввод не попадает в логику без parse(). Касается и
 * запросов от Mini App, и ответов Travelpayouts — чужой API может молча сменить
 * формат, и лучше узнать об этом в одной точке, а не через undefined в UI.
 *
 * FlightOffer и CalendarDay структурно совпадают с view-моделями rich-шаблонов.
 */

import { z } from "zod"

// ── Примитивы ──────────────────────────────────────────────────────────

export const iataSchema = z
	.string()
	.trim()
	.toUpperCase()
	.regex(/^[A-Z]{3}$/, "Код IATA — три латинские буквы")

export const monthSchema = z
	.string()
	.regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Месяц в формате YYYY-MM")

export const dateSchema = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/, "Дата в формате YYYY-MM-DD")

export const currencySchema = z.string().trim().toUpperCase().length(3)

export const localeSchema = z.enum(["ru", "en"])
export type Locale = z.infer<typeof localeSchema>

// ── Домен ─────────────────────────────────────────────────────────────

export const flightOfferSchema = z.object({
	origin: iataSchema,
	destination: iataSchema,
	price: z.number().int().positive(),
	currency: currencySchema,
	transfers: z.number().int().min(0),
	airline: z.string(),
	flightNumber: z.string().optional(),
	/** ISO. Приходит из кэша Aviasales. */
	departureAt: z.string(),
	returnAt: z.string().optional(),
	/** Когда цена была найдена. Без этого поля UI обязан сказать «цена из кэша». */
	foundAt: z.string().optional(),
	deepLink: z.string().url(),
})
export type FlightOffer = z.infer<typeof flightOfferSchema>

export const calendarDaySchema = z.object({
	date: dateSchema,
	price: z.number().int().positive(),
	currency: currencySchema,
})
export type CalendarDay = z.infer<typeof calendarDaySchema>

/** Куда можно улететь из города — главный сценарий «ещё не решил, куда». */
export const directionSchema = flightOfferSchema.extend({
	destinationName: z.string().optional(),
	countryCode: z.string().optional(),
})
export type Direction = z.infer<typeof directionSchema>

export const watchSchema = z.object({
	id: z.number().int(),
	origin: iataSchema,
	destination: iataSchema,
	departMonth: monthSchema.nullable(),
	targetPrice: z.number().int().positive().nullable(),
	lastPrice: z.number().int().positive().nullable(),
	lastCheckedAt: z.number().int().nullable(),
	isActive: z.boolean(),
})
export type Watch = z.infer<typeof watchSchema>

// ── Запросы Mini App ───────────────────────────────────────────────────

export const searchRequestSchema = z.object({
	origin: iataSchema,
	destination: iataSchema,
	/** Нет месяца — смотрим ближайшие даты с любой ценой. */
	departMonth: monthSchema.optional(),
	returnMonth: monthSchema.optional(),
	oneWay: z.boolean().default(true),
	currency: currencySchema.default("RUB"),
})
export type SearchRequest = z.infer<typeof searchRequestSchema>

export const calendarRequestSchema = z.object({
	origin: iataSchema,
	destination: iataSchema,
	month: monthSchema,
	currency: currencySchema.default("RUB"),
})
export type CalendarRequest = z.infer<typeof calendarRequestSchema>

export const exploreRequestSchema = z.object({
	origin: iataSchema,
	/** Потолок бюджета в валюте запроса. */
	budget: z.number().int().positive().optional(),
	month: monthSchema.optional(),
	currency: currencySchema.default("RUB"),
	limit: z.number().int().min(1).max(50).default(20),
})
export type ExploreRequest = z.infer<typeof exploreRequestSchema>

export const watchCreateSchema = z.object({
	origin: iataSchema,
	destination: iataSchema,
	departMonth: monthSchema.nullish(),
	targetPrice: z.number().int().positive().nullish(),
})
export type WatchCreate = z.infer<typeof watchCreateSchema>

export const favoriteCreateSchema = z.object({
	origin: iataSchema,
	destination: iataSchema,
})

export const invoiceRequestSchema = z.object({
	plan: z.literal("plus"),
})

export const profileUpdateSchema = z.object({
	locale: localeSchema.optional(),
	currency: currencySchema.optional(),
	homeIata: iataSchema.optional(),
})

// ── Ответы API ──────────────────────────────────────────────────────

export const apiErrorCodes = [
	"unauthorized",
	"forbidden",
	"invalid_request",
	"quota_exceeded",
	"watch_limit",
	"provider_unavailable",
	"not_found",
	"internal",
] as const
export type ApiErrorCode = (typeof apiErrorCodes)[number]

export type ApiError = {
	error: { code: ApiErrorCode; message: string }
}

export type SearchResponse = {
	origin: string
	destination: string
	offers: FlightOffer[]
	/** Сколько вариантов скрыто пейволом. У Plus всегда 0. */
	hidden: number
	quota: { used: number; limit: number | null }
	isPlus: boolean
}

export type ProfileResponse = {
	id: number
	firstName: string | null
	locale: Locale
	currency: string
	homeIata: string | null
	isPlus: boolean
	plusUntil: number | null
	quota: { used: number; limit: number | null }
	limits: { maxWatches: number; freeResults: number }
}
