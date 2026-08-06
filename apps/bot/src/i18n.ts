/**
 * Локализация. Два языка, плоский словарь, без внешних зависимостей.
 *
 * Почему не @grammyjs/i18n: он читает .ftl с диска, а на Workers диска нет.
 * Словарь в коде попадает в бандл и проверяется типами: забытый ключ в en
 * не соберётся, а не выстрелит в продакшене.
 *
 * Подстановка: {name} в строке, vars в вызове.
 */

export type Locale = "ru" | "en"

const ru = {
	"start.title": "Привет, {name}",
	"start.body":
		"Я помогаю найти дешёвые авиабилеты и придумать, куда вообще лететь.",
	"start.hint":
		"Вся работа — в приложении. В чат я пришлю результаты и предупрежу о падении цены.",
	"button.open": "Открыть Voolo",
	"button.plus": "Voolo Plus",
	"button.aviasales": "Открыть на Aviasales",
	"help.title": "Что я умею",
	"help.body":
		"Найти цену по маршруту, показать календарь цен на месяц, подобрать направление по бюджету и следить за ценой.",
	"help.commands": "Команды",
	"quota.title": "Бесплатные поиски на сегодня закончились",
	"quota.body":
		"Сегодня вы сделали {limit} из {limit} поисков. Новые появятся завтра — или сразу с Voolo Plus.",
	"search.thinking": "Смотрю цены по маршруту",
	"watch.saved": "Слежу за маршрутом {route}. Напишу, когда цена упадёт.",
	"watch.removed": "Больше не слежу за {route}.",
	"watch.limit":
		"Достигнут лимит в {limit} отслеживаний. Удалите лишнее или подключите Plus.",
	"watch.empty": "Вы пока ни за чем не следите.",
	"pay.title": "Оплата принята",
	"pay.body": "Voolo Plus активен до {date}.",
	"pay.invoice.title": "Voolo Plus на {days} дней",
	"pay.invoice.description":
		"Безлимитный поиск, все найденные варианты, календарь цен на три месяца и до {watches} отслеживаний с алертами.",
	"pay.already": "Voolo Plus уже активен до {date}.",
	"pay.refunded": "Возврат выполнен. Звёзды вернулись на баланс.",
	"status.free": "Текущий план: бесплатный. Осталось поисков сегодня: {left}.",
	"status.plus": "Текущий план: Voolo Plus до {date}.",
	"lang.changed": "Язык переключён на русский.",
	"error.generic": "Что-то сломалось на нашей стороне. Попробуйте ещё раз.",
	"error.provider":
		"Источник цен сейчас не отвечает. Это обычно ненадолго — попробуйте через пару минут.",
	"error.badRoute": "Не разобрал маршрут. Пример: Москва — Стамбул.",
	"unknown": "Не понял. Откройте приложение или наберите /help.",
} as const

type Dictionary = Record<keyof typeof ru, string>

const en: Dictionary = {
	"start.title": "Hi, {name}",
	"start.body": "I help you find cheap flights and decide where to go at all.",
	"start.hint":
		"Everything happens in the app. I send results here and warn you when a price drops.",
	"button.open": "Open Voolo",
	"button.plus": "Voolo Plus",
	"button.aviasales": "Open on Aviasales",
	"help.title": "What I can do",
	"help.body":
		"Find a price for a route, show a price calendar for the month, suggest a destination within your budget and watch prices for you.",
	"help.commands": "Commands",
	"quota.title": "No free searches left today",
	"quota.body":
		"You used {limit} of {limit} searches today. They reset tomorrow, or right now with Voolo Plus.",
	"search.thinking": "Checking prices for this route",
	"watch.saved": "Watching {route}. I will write when the price drops.",
	"watch.removed": "Stopped watching {route}.",
	"watch.limit": "You reached the limit of {limit} watches. Remove one or get Plus.",
	"watch.empty": "You are not watching anything yet.",
	"pay.title": "Payment received",
	"pay.body": "Voolo Plus is active until {date}.",
	"pay.invoice.title": "Voolo Plus for {days} days",
	"pay.invoice.description":
		"Unlimited search, every result we find, a three-month price calendar and up to {watches} price alerts.",
	"pay.already": "Voolo Plus is already active until {date}.",
	"pay.refunded": "Refunded. The stars are back on your balance.",
	"status.free": "Current plan: free. Searches left today: {left}.",
	"status.plus": "Current plan: Voolo Plus until {date}.",
	"lang.changed": "Language switched to English.",
	"error.generic": "Something broke on our side. Please try again.",
	"error.provider":
		"The price source is not responding right now. This is usually brief — try again in a couple of minutes.",
	"error.badRoute": "I could not parse the route. Example: Moscow - Istanbul.",
	"unknown": "I did not get that. Open the app or type /help.",
}

const dictionaries: Record<Locale, Dictionary> = { ru, en }

export type TranslationKey = keyof typeof ru
export type Translator = (
	key: TranslationKey,
	vars?: Record<string, string | number>,
) => string

export function createTranslator(locale: Locale): Translator {
	const dictionary = dictionaries[locale] ?? dictionaries.ru

	return (key, vars) => {
		const template = dictionary[key] ?? ru[key] ?? key
		if (!vars) return template

		return template.replace(/\{(\w+)\}/g, (match, name: string) =>
			name in vars ? String(vars[name]) : match,
		)
	}
}
