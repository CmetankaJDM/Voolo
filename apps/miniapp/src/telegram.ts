/**
 * Мост к window.Telegram.WebApp.
 *
 * Почему напрямую, а не через обёртку-SDK: нам нужны буквально восемь
 * методов, а лишняя зависимость в бандле Mini App оплачивается секундами
 * белого экрана на мобильном интернете.
 *
 * Все вызовы защищены: в обычном браузере (разработка) объекта просто нет,
 * и приложение обязано открываться, а не падать белым экраном.
 */

import { brand } from "@voolo/shared"

type HapticStyle = "light" | "medium" | "heavy" | "rigid" | "soft"
type InvoiceStatus = "paid" | "cancelled" | "failed" | "pending"

type WebApp = {
	initData: string
	version: string
	platform: string
	colorScheme: "light" | "dark"
	viewportStableHeight?: number
	isExpanded?: boolean
	ready: () => void
	expand: () => void
	close: () => void
	setHeaderColor: (color: string) => void
	setBackgroundColor: (color: string) => void
	disableVerticalSwipes?: () => void
	onEvent: (event: string, handler: () => void) => void
	offEvent: (event: string, handler: () => void) => void
	openLink: (url: string, options?: { try_instant_view?: boolean }) => void
	openTelegramLink: (url: string) => void
	openInvoice: (url: string, callback?: (status: InvoiceStatus) => void) => void
	BackButton: {
		show: () => void
		hide: () => void
		onClick: (handler: () => void) => void
		offClick: (handler: () => void) => void
	}
	HapticFeedback?: {
		impactOccurred: (style: HapticStyle) => void
		notificationOccurred: (type: "error" | "success" | "warning") => void
		selectionChanged: () => void
	}
}

declare global {
	interface Window {
		Telegram?: { WebApp?: WebApp }
	}
}

export function getWebApp(): WebApp | null {
	return window.Telegram?.WebApp ?? null
}

export function isInsideTelegram(): boolean {
	const app = getWebApp()
	return Boolean(app && app.initData.length > 0)
}

/**
 * Подготовить окно. Вызывается один раз до монтирования React.
 *
 * Цвета задаём свои (ADR-006): у Voolo фирменная тёмная тема, а не тема
 * клиента. Иначе лайм на белом фоне даёт контраст ниже допустимого.
 */
export function initTelegram(): void {
	const app = getWebApp()
	if (!app) return

	app.ready()
	app.expand()

	try {
		app.setHeaderColor(brand.bg)
		app.setBackgroundColor(brand.bg)
	} catch {
		// Старые клиенты кидают на неизвестных методах — это не повод ломать запуск.
	}

	// Свайп вниз закрывает окно и съедает прокрутку списков — отключаем.
	app.disableVerticalSwipes?.()
}

/** Сырая строка initData для заголовка Authorization. */
export function getInitDataRaw(): string {
	return getWebApp()?.initData ?? ""
}

export function haptic(style: HapticStyle = "light"): void {
	getWebApp()?.HapticFeedback?.impactOccurred(style)
}

export function hapticResult(type: "error" | "success" | "warning"): void {
	getWebApp()?.HapticFeedback?.notificationOccurred(type)
}

/** Кнопка «Назад» клиента. Возвращает функцию отписки для useEffect. */
export function showBackButton(handler: () => void): () => void {
	const app = getWebApp()
	if (!app) return () => {}

	app.BackButton.onClick(handler)
	app.BackButton.show()

	return () => {
		app.BackButton.offClick(handler)
		app.BackButton.hide()
	}
}

/** Внешняя ссылка (Aviasales). В Telegram нельзя полагаться на window.open. */
export function openExternal(url: string): void {
	const app = getWebApp()
	if (app) {
		app.openLink(url)
		return
	}

	window.open(url, "_blank", "noopener,noreferrer")
}

/** Оплата звёздами по ссылке из POST /api/invoice. */
export function openInvoice(url: string): Promise<InvoiceStatus> {
	const app = getWebApp()
	if (!app) return Promise.resolve("failed")

	return new Promise((resolve) => {
		try {
			app.openInvoice(url, (status) => resolve(status))
		} catch {
			resolve("failed")
		}
	})
}

/**
 * Высота окна без скачков при появлении клавиатуры.
 * Прокидывается в CSS-переменную --voolo-viewport.
 */
export function trackViewport(): () => void {
	const app = getWebApp()

	const apply = () => {
		const height = app?.viewportStableHeight ?? window.innerHeight
		document.documentElement.style.setProperty("--voolo-viewport", `${height}px`)
	}

	apply()

	if (!app) {
		window.addEventListener("resize", apply)
		return () => window.removeEventListener("resize", apply)
	}

	app.onEvent("viewportChanged", apply)
	return () => app.offEvent("viewportChanged", apply)
}
