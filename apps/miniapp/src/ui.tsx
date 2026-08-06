/**
 * Общие презентационные блоки и форматтеры.
 *
 * Цена никогда не показывается без отметки о свежести (ADR-001): у нас кэш
 * Data API возрастом до нескольких дней, и молчать об этом — обман.
 */

import type { FlightOffer } from "@voolo/shared"
import type { ReactNode } from "react"

import { ApiRequestError } from "./api"
import { useBuyPlus } from "./hooks"
import { haptic, openExternal } from "./telegram"

export function formatPrice(price: number, currency: string): string {
	try {
		return new Intl.NumberFormat("ru-RU", {
			style: "currency",
			currency,
			maximumFractionDigits: 0,
		}).format(price)
	} catch {
		return `${Math.round(price)} ${currency}`
	}
}

export function formatDay(iso: string): string {
	const date = new Date(iso)
	if (Number.isNaN(date.getTime())) return iso.slice(0, 10)

	return new Intl.DateTimeFormat("ru-RU", {
		day: "numeric",
		month: "short",
	}).format(date)
}

export function transfersLabel(transfers: number): string {
	if (transfers === 0) return "без пересадок"
	if (transfers === 1) return "1 пересадка"
	if (transfers < 5) return `${transfers} пересадки`
	return `${transfers} пересадок`
}

/** «Цена найдена N дней назад» — честность вместо иллюзии реалтайма. */
export function freshness(foundAt?: string): string | null {
	if (!foundAt) return null

	const found = new Date(foundAt)
	if (Number.isNaN(found.getTime())) return null

	const days = Math.floor((Date.now() - found.getTime()) / 86_400_000)
	if (days <= 0) return "цена найдена сегодня"
	if (days === 1) return "цена найдена вчера"
	return `цена найдена ${days} дн. назад`
}

export function OfferCard(props: {
	offer: FlightOffer
	title: string
	subtitle?: string
	action?: ReactNode
}) {
	const { offer } = props
	const note = freshness(offer.foundAt)

	return (
		<article className="card">
			<div className="card__row">
				<div>
					<div>
						<strong>{props.title}</strong>
					</div>
					<div className="muted">
						{formatDay(offer.departureAt)}
						{offer.returnAt ? ` — ${formatDay(offer.returnAt)}` : ""} ·{" "}
						{transfersLabel(offer.transfers)}
					</div>
					{props.subtitle ? <div className="muted">{props.subtitle}</div> : null}
				</div>

				<div className="price price--accent">
					{formatPrice(offer.price, offer.currency)}
				</div>
			</div>

			{note ? (
				<div className="muted" style-data="freshness">
					🕐 {note}
				</div>
			) : null}

			<div className="row">
				<button
					type="button"
					className="button button--ghost"
					onClick={() => {
						haptic("light")
						openExternal(offer.deepLink)
					}}
				>
					Посмотреть на Aviasales
				</button>
				{props.action}
			</div>
		</article>
	)
}

export function SkeletonList(props: { count?: number }) {
	return (
		<div className="stack" aria-busy="true" aria-live="polite">
			{Array.from({ length: props.count ?? 3 }).map((_, index) => (
				<div className="skeleton" key={index} />
			))}
		</div>
	)
}

export function EmptyState(props: { icon: string; title: string; hint?: string }) {
	return (
		<div className="empty">
			<div aria-hidden="true">{props.icon}</div>
			<p>
				<strong>{props.title}</strong>
			</p>
			{props.hint ? <p className="muted">{props.hint}</p> : null}
		</div>
	)
}

/**
 * Ошибка запроса. Упёршийся в лимит пользователь видит не красный текст,
 * а предложение: это единственный момент, когда Plus действительно нужен.
 */
export function ErrorNote(props: { error: unknown }) {
	const buy = useBuyPlus()
	const error = props.error

	if (error instanceof ApiRequestError && error.isPaywall) {
		return (
			<div className="card">
				<p>
					<strong>{error.message}</strong>
				</p>
				<p className="muted">
					Voolo Plus — безлимитный поиск, календарь цен и алерты о падении
					цены.
				</p>
				<button
					type="button"
					className="button button--primary"
					disabled={buy.isPending}
					onClick={() => buy.mutate()}
				>
					{buy.isPending ? "Открываем оплату…" : "Подключить Plus"}
				</button>
			</div>
		)
	}

	const message =
		error instanceof Error ? error.message : "Что-то пошло не так. Попробуйте ещё раз."

	return (
		<p className="error" role="alert">
			{message}
		</p>
	)
}

/** Список ближайших месяцев для выбора даты вылета. */
export function nextMonths(count = 6): Array<{ value: string; label: string }> {
	const now = new Date()
	const formatter = new Intl.DateTimeFormat("ru-RU", {
		month: "long",
		year: "numeric",
	})

	return Array.from({ length: count }).map((_, index) => {
		const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + index, 1))
		const month = String(date.getUTCMonth() + 1).padStart(2, "0")

		return {
			value: `${date.getUTCFullYear()}-${month}`,
			label: formatter.format(date).replace(" г.", ""),
		}
	})
}
