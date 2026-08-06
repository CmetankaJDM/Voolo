/**
 * Voolo — фирменные токены оформления.
 *
 * Единственный источник правды по цвету для Mini App и генерации OG-карточек.
 * Палитра снята с логотипа: кислотный лайм на почти чёрном.
 *
 * См. ADR-006: мы намеренно НЕ берём палитру из themeParams Telegram.
 * Отклонение касается только цвета — safe area, BackButton, MainButton и
 * haptics используются штатно.
 */

export const brand = {
	/** Основной лайм с логотипа. Акценты, цены, активные состояния. */
	lime: "#A8E82C",
	/** Ховер и фокус. */
	limeBright: "#C2FF4D",
	/** Прижатое состояние, прогресс-бары. */
	limeDim: "#7FB01F",
	/** Лайм на 12% — подложка бейджей со скидкой. */
	limeSoft: "rgba(168, 232, 44, 0.12)",

	/** Фон приложения. Синхронизируется с setBackgroundColor. */
	bg: "#141414",
	/** Карточки, листы. */
	surface: "#1E1E1E",
	/** Вложенные элементы, инпуты. */
	surfaceRaised: "#262626",
	/** Границы и разделители. */
	border: "#2E2E2E",

	/** Основной текст. */
	text: "#F5F5F5",
	/** Подписи, метаданные, дисклеймер о возрасте цены. */
	textMuted: "#8A8A8A",
	/** Текст на лаймовой заливке — всегда тёмный, не белый. */
	textOnLime: "#141414",

	/** Цена выросла, срок кэша истекает. */
	warning: "#FFB020",
	/** Ошибка, маршрут недоступен. */
	danger: "#FF5C5C",
	/** Цена упала. */
	success: "#A8E82C",
} as const

/** Радиусы. Логотип построен на скруглённой геометрике. */
export const radius = {
	sm: "8px",
	md: "14px",
	lg: "20px",
	pill: "999px",
} as const

export const spacing = {
	xs: "4px",
	sm: "8px",
	md: "12px",
	lg: "16px",
	xl: "24px",
	xxl: "32px",
} as const

/**
 * Эмодзи-словарь бота. Держим в одном месте, чтобы тон сообщений был единым.
 * Правило: не более двух эмодзи на сообщение.
 */
export const glyph = {
	plane: "✈️",
	priceDown: "📉",
	priceUp: "📈",
	calendar: "🗓",
	star: "⭐",
	pin: "📍",
	clock: "🕐",
	warning: "⚠️",
	direct: "⚡",
} as const

/** CSS-переменные для Mini App. Инжектится один раз в :root. */
export function brandCssVariables(): string {
	const pairs: Array<[string, string]> = [
		["--voolo-lime", brand.lime],
		["--voolo-lime-bright", brand.limeBright],
		["--voolo-lime-dim", brand.limeDim],
		["--voolo-lime-soft", brand.limeSoft],
		["--voolo-bg", brand.bg],
		["--voolo-surface", brand.surface],
		["--voolo-surface-raised", brand.surfaceRaised],
		["--voolo-border", brand.border],
		["--voolo-text", brand.text],
		["--voolo-text-muted", brand.textMuted],
		["--voolo-text-on-lime", brand.textOnLime],
		["--voolo-warning", brand.warning],
		["--voolo-danger", brand.danger],
		["--voolo-radius-sm", radius.sm],
		["--voolo-radius-md", radius.md],
		["--voolo-radius-lg", radius.lg],
		["--voolo-radius-pill", radius.pill],
	]

	return pairs.map(([key, value]) => key + ": " + value + ";").join("\n\t")
}
