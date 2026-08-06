/**
 * Мини-справочник городов.
 *
 * Полный справочник Travelpayouts — это мегабайты JSON, и в бандл Worker он не
 * поедет. Здесь только то, что реально нужно для быстрого ввода текстом в чате.
 * Полный поиск городов живёт в Mini App, где есть место под нормальный автокомплит.
 *
 * MOW / LED / и пр. — это коды городов, а не аэропортов. Для поиска это лучше:
 * MOW накрывает все три московские аэропорта сразу.
 */

export type City = {
	code: string
	ru: string
	en: string
	/** Дополнительные написания в нижнем регистре. */
	aliases?: string[]
}

export const cities: City[] = [
	{ code: "MOW", ru: "Москва", en: "Moscow", aliases: ["мск", "msk", "москвы"] },
	{ code: "LED", ru: "Санкт-Петербург", en: "Saint Petersburg", aliases: ["спб", "питер", "spb"] },
	{ code: "AER", ru: "Сочи", en: "Sochi", aliases: ["адлер"] },
	{ code: "KZN", ru: "Казань", en: "Kazan" },
	{ code: "SVX", ru: "Екатеринбург", en: "Yekaterinburg", aliases: ["екб"] },
	{ code: "OVB", ru: "Новосибирск", en: "Novosibirsk" },
	{ code: "KJA", ru: "Красноярск", en: "Krasnoyarsk" },
	{ code: "VVO", ru: "Владивосток", en: "Vladivostok" },
	{ code: "KGD", ru: "Калининград", en: "Kaliningrad" },
	{ code: "MMK", ru: "Мурманск", en: "Murmansk" },
	{ code: "MRV", ru: "Минеральные Воды", en: "Mineralnye Vody", aliases: ["минводы"] },
	{ code: "IST", ru: "Стамбул", en: "Istanbul" },
	{ code: "AYT", ru: "Анталья", en: "Antalya" },
	{ code: "DXB", ru: "Дубай", en: "Dubai" },
	{ code: "AUH", ru: "Абу-Даби", en: "Abu Dhabi" },
	{ code: "TBS", ru: "Тбилиси", en: "Tbilisi" },
	{ code: "EVN", ru: "Ереван", en: "Yerevan" },
	{ code: "GYD", ru: "Баку", en: "Baku" },
	{ code: "ALA", ru: "Алматы", en: "Almaty" },
	{ code: "TAS", ru: "Ташкент", en: "Tashkent" },
	{ code: "BKK", ru: "Бангкок", en: "Bangkok" },
	{ code: "HKT", ru: "Пхукет", en: "Phuket" },
	{ code: "DPS", ru: "Бали", en: "Bali", aliases: ["денпасар"] },
	{ code: "CAI", ru: "Каир", en: "Cairo" },
	{ code: "HRG", ru: "Хургада", en: "Hurghada" },
	{ code: "SSH", ru: "Шарм-эль-Шейх", en: "Sharm El Sheikh", aliases: ["шарм"] },
	{ code: "MLE", ru: "Мальдивы", en: "Maldives", aliases: ["мале"] },
	{ code: "BEG", ru: "Белград", en: "Belgrade" },
	{ code: "BUD", ru: "Будапешт", en: "Budapest" },
	{ code: "PRG", ru: "Прага", en: "Prague" },
	{ code: "LON", ru: "Лондон", en: "London" },
	{ code: "PAR", ru: "Париж", en: "Paris" },
	{ code: "ROM", ru: "Рим", en: "Rome" },
	{ code: "BCN", ru: "Барселона", en: "Barcelona" },
	{ code: "MAD", ru: "Мадрид", en: "Madrid" },
	{ code: "BER", ru: "Берлин", en: "Berlin" },
	{ code: "AMS", ru: "Амстердам", en: "Amsterdam" },
	{ code: "NYC", ru: "Нью-Йорк", en: "New York" },
	{ code: "PEK", ru: "Пекин", en: "Beijing" },
	{ code: "HKG", ru: "Гонконг", en: "Hong Kong" },
	{ code: "NHA", ru: "Нячанг", en: "Nha Trang" },
	{ code: "SGN", ru: "Хошимин", en: "Ho Chi Minh City" },
	{ code: "TLV", ru: "Тель-Авив", en: "Tel Aviv" },
	{ code: "DEL", ru: "Дели", en: "Delhi" },
	{ code: "GOI", ru: "Гоа", en: "Goa" },
]

const byCode = new Map(cities.map((city) => [city.code, city]))

const byName = new Map<string, City>()
for (const city of cities) {
	byName.set(city.ru.toLowerCase(), city)
	byName.set(city.en.toLowerCase(), city)
	for (const alias of city.aliases ?? []) byName.set(alias.toLowerCase(), city)
}

/** Название для показа. Неизвестный код показываем как есть — это честнее прочерка. */
export function cityName(code: string, locale: "ru" | "en" = "ru"): string {
	const city = byCode.get(code.toUpperCase())
	return city ? city[locale] : code.toUpperCase()
}

/** Строка → код города. Понимает и готовый IATA, и название. */
export function resolveCity(input: string): string | null {
	const value = input.trim().toLowerCase()
	if (!value) return null

	if (/^[a-z]{3}$/.test(value)) {
		const upper = value.toUpperCase()
		// Неизвестный нам код тоже пропускаем: справочник неполный, а API шире.
		return upper
	}

	return byName.get(value)?.code ?? null
}

const SEPARATORS = /\s*(?:[-–—>]+|в|to)\s*/i

/**
 * Разбор свободного ввода: «Москва — Стамбул», «mow ist», «мск в сочи».
 * Намеренно простой: всё сложное делается в Mini App с автокомплитом.
 */
export function parseRoute(
	text: string,
): { origin: string; destination: string } | null {
	const cleaned = text.trim().replace(/\s+/g, " ")
	if (!cleaned || cleaned.startsWith("/")) return null

	let parts = cleaned.split(SEPARATORS).filter(Boolean)
	if (parts.length < 2) parts = cleaned.split(" ")
	if (parts.length < 2) return null

	const origin = resolveCity(parts[0]!)
	const destination = resolveCity(parts.slice(1).join(" "))
	if (!origin || !destination || origin === destination) return null

	return { origin, destination }
}
