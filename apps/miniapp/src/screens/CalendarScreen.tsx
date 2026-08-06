import { useEffect, useState } from "react"

import { useCalendar, useProfile } from "../hooks"
import { haptic } from "../telegram"
import { EmptyState, ErrorNote, formatDay, formatPrice, nextMonths, SkeletonList } from "../ui"

const IATA = /^[A-Za-z]{3}$/
const MONTHS = nextMonths()

/**
 * Календарь цен.
 *
 * Сознательно не сетка 7×5: на узком экране ячейка с ценой становится меньше
 * читаемого минимума в 14px. Список дёшевых дней отвечает на тот же вопрос
 * «когда дешевле всего», но читается с телефона.
 */
export default function CalendarScreen() {
	const profile = useProfile()
	const calendar = useCalendar()

	const [origin, setOrigin] = useState("")
	const [destination, setDestination] = useState("")
	const [month, setMonth] = useState(MONTHS[0]?.value ?? "")

	useEffect(() => {
		const home = profile.data?.homeIata
		if (home && !origin) setOrigin(home)
	}, [profile.data?.homeIata, origin])

	const canSearch =
		IATA.test(origin) && IATA.test(destination) && month !== "" && !calendar.isPending

	const days = [...(calendar.data?.days ?? [])].sort((left, right) =>
		left.date.localeCompare(right.date),
	)
	const cheapest = days.reduce<number | null>(
		(min, day) => (min === null || day.price < min ? day.price : min),
		null,
	)

	return (
		<div className="stack">
			<section className="card">
				<div className="row">
					<label className="field">
						<span className="field__label">Откуда</span>
						<input
							className="input"
							value={origin}
							onChange={(event) => setOrigin(event.target.value.toUpperCase())}
							placeholder="MOW"
							maxLength={3}
							autoCapitalize="characters"
							spellCheck={false}
						/>
					</label>

					<label className="field">
						<span className="field__label">Куда</span>
						<input
							className="input"
							value={destination}
							onChange={(event) => setDestination(event.target.value.toUpperCase())}
							placeholder="AER"
							maxLength={3}
							autoCapitalize="characters"
							spellCheck={false}
						/>
					</label>
				</div>

				<label className="field">
					<span className="field__label">Месяц</span>
					<select
						className="input"
						value={month}
						onChange={(event) => setMonth(event.target.value)}
					>
						{MONTHS.map((item) => (
							<option key={item.value} value={item.value}>
								{item.label}
							</option>
						))}
					</select>
				</label>

				<button
					type="button"
					className="button button--primary"
					disabled={!canSearch}
					onClick={() => {
						if (!canSearch) return
						haptic("medium")
						calendar.mutate({
							origin: origin.toUpperCase(),
							destination: destination.toUpperCase(),
							month,
							currency: profile.data?.currency,
						})
					}}
				>
					{calendar.isPending ? "Считаем…" : "Показать цены по дням"}
				</button>
			</section>

			{calendar.isPending ? <SkeletonList count={5} /> : null}
			{calendar.error ? <ErrorNote error={calendar.error} /> : null}

			{calendar.data && days.length === 0 ? (
				<EmptyState
					icon="🗓"
					title="На этот месяц цен нет"
					hint="Выберите соседний месяц — кэш заполнен неравномерно."
				/>
			) : null}

			{days.length > 0 ? (
				<section className="card">
					<p className="muted">
						Самый дешёвый день подсвечен лаймом.
					</p>

					<ul className="stack">
						{days.map((day) => (
							<li className="card__row" key={day.date}>
								<span>{formatDay(day.date)}</span>
								<span
									className={
										day.price === cheapest ? "price price--accent" : "price"
									}
								>
									{formatPrice(day.price, day.currency)}
								</span>
							</li>
						))}
					</ul>
				</section>
			) : null}
		</div>
	)
}
