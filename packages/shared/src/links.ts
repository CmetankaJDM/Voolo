/**
 * Партнёрские ссылки Aviasales.
 *
 * Без marker ссылка работает, но комиссии нет. Это весь доход проекта помимо
 * звёзд, поэтому сборка ссылок живёт в одном месте и покрыта тестами.
 *
 * Формат поискового пути: /search/{ORIGIN}{DDMM}{DEST}{DDMM}{PAX}
 *   MOW1508AER1      — Москва → Сочи 15 августа, один взрослый, в одну сторону
 *   MOW1508AER22081  — туда 15.08, обратно 22.08
 */

export const AVIASALES_HOST = "https://www.aviasales.com"

/** ISO или YYYY-MM-DD → DDMM. */
export function toDdmm(iso: string): string {
	const date = new Date(iso)
	if (Number.isNaN(date.getTime())) return ""

	const day = String(date.getUTCDate()).padStart(2, "0")
	const month = String(date.getUTCMonth() + 1).padStart(2, "0")
	return `${day}${month}`
}

export type SearchLinkInput = {
	origin: string
	destination: string
	departureAt: string
	returnAt?: string
	passengers?: number
	marker?: string
	currency?: string
	locale?: "ru" | "en"
}

export function buildSearchLink(input: SearchLinkInput): string {
	const passengers = Math.min(Math.max(input.passengers ?? 1, 1), 9)
	const origin = input.origin.toUpperCase()
	const destination = input.destination.toUpperCase()

	const segment =
		`${origin}${toDdmm(input.departureAt)}${destination}` +
		`${input.returnAt ? toDdmm(input.returnAt) : ""}${passengers}`

	const url = new URL(`${AVIASALES_HOST}/search/${segment}`)
	if (input.marker) url.searchParams.set("marker", input.marker)
	if (input.currency) url.searchParams.set("currency", input.currency.toLowerCase())
	if (input.locale) url.searchParams.set("locale", input.locale)

	return url.toString()
}

/** Ссылка на город без конкретных дат — для подборки направлений. */
export function buildDirectionLink(input: {
	origin: string
	destination: string
	marker?: string
	locale?: "ru" | "en"
}): string {
	const url = new URL(
		`${AVIASALES_HOST}/search/${input.origin.toUpperCase()}0000${input.destination.toUpperCase()}1`,
	)
	if (input.marker) url.searchParams.set("marker", input.marker)
	if (input.locale) url.searchParams.set("locale", input.locale)
	return url.toString()
}

/** Глубокая ссылка в Mini App: t.me/{bot}/{short}?startapp={payload} */
export function buildMiniAppLink(input: {
	botUsername: string
	shortName: string
	payload?: string
}): string {
	const base = `https://t.me/${input.botUsername}/${input.shortName}`
	return input.payload ? `${base}?startapp=${encodeURIComponent(input.payload)}` : base
}
