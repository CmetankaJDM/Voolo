/**
 * HTTP-клиент Mini App.
 *
 * Единственное место, где приложение ходит в сеть. Заголовок Authorization
 * берётся на каждый запрос заново: клиент Telegram обновляет initData при
 * возврате в окно, а старая строка протухнет по auth_date.
 */

import type {
	CalendarDay,
	Direction,
	ProfileResponse,
	SearchResponse,
} from "@voolo/shared"

import { getInitDataRaw } from "./telegram"

/** Пусто — значит API живёт на том же оригине (прокси в dev). */
const API_BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/+$/, "")

export type FavoriteRow = {
	id: number
	origin: string
	destination: string
	createdAt: number
}

export type WatchRow = {
	id: number
	origin: string
	destination: string
	departMonth: string | null
	targetPrice: number | null
	lastPrice: number | null
	lastCheckedAt: number | null
	isActive: boolean
}

export class ApiRequestError extends Error {
	readonly code: string

	constructor(code: string, message: string) {
		super(message)
		this.name = "ApiRequestError"
		this.code = code
	}

	/** Квота и лимит отслеживаний — не ошибки, а повод показать пейвол. */
	get isPaywall(): boolean {
		return this.code === "quota_exceeded" || this.code === "watch_limit"
	}
}

async function request<T>(
	path: string,
	init: { method?: string; body?: unknown } = {},
): Promise<T> {
	const response = await fetch(`${API_BASE}/api${path}`, {
		method: init.method ?? "GET",
		headers: {
			authorization: `tma ${getInitDataRaw()}`,
			...(init.body ? { "content-type": "application/json" } : {}),
		},
		body: init.body ? JSON.stringify(init.body) : undefined,
	})

	if (!response.ok) {
		const payload = (await response.json().catch(() => null)) as {
			error?: { code?: string; message?: string }
		} | null

		throw new ApiRequestError(
			payload?.error?.code ?? "internal",
			payload?.error?.message ?? "Сеть недоступна. Попробуйте ещё раз.",
		)
	}

	return (await response.json()) as T
}

export const api = {
	profile: () => request<ProfileResponse>("/profile"),

	updateProfile: (body: {
		locale?: "ru" | "en"
		currency?: string
		homeIata?: string
	}) => request<{ ok: true }>("/profile", { method: "POST", body }),

	search: (body: {
		origin: string
		destination: string
		departMonth?: string
		returnMonth?: string
		oneWay?: boolean
		currency?: string
	}) => request<SearchResponse>("/search", { method: "POST", body }),

	calendar: (body: {
		origin: string
		destination: string
		month: string
		currency?: string
	}) =>
		request<{ month: string; days: CalendarDay[]; isPlus: boolean }>("/calendar", {
			method: "POST",
			body,
		}),

	explore: (body: {
		origin: string
		budget?: number
		currency?: string
		limit?: number
	}) =>
		request<{ directions: Direction[]; isPlus: boolean }>("/explore", {
			method: "POST",
			body,
		}),

	favorites: () => request<{ favorites: FavoriteRow[] }>("/favorites"),

	addFavorite: (body: { origin: string; destination: string }) =>
		request<{ favorites: FavoriteRow[] }>("/favorites", { method: "POST", body }),

	removeFavorite: (id: number) =>
		request<{ favorites: FavoriteRow[] }>(`/favorites/${id}`, { method: "DELETE" }),

	watches: () => request<{ watches: WatchRow[] }>("/watches"),

	addWatch: (body: {
		origin: string
		destination: string
		departMonth?: string | null
		targetPrice?: number | null
	}) => request<{ watches: WatchRow[] }>("/watches", { method: "POST", body }),

	removeWatch: (id: number) =>
		request<{ watches: WatchRow[] }>(`/watches/${id}`, { method: "DELETE" }),

	invoice: () =>
		request<{ invoiceLink: string; stars: number }>("/invoice", {
			method: "POST",
			body: { plan: "plus" },
		}),
}
