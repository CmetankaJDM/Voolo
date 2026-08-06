import { useEffect, useState } from "react"

import { useAddWatch, useProfile, useSearch } from "../hooks"
import { haptic } from "../telegram"
import { EmptyState, ErrorNote, nextMonths, OfferCard, SkeletonList } from "../ui"

const IATA = /^[A-Za-z]{3}$/
const MONTHS = nextMonths()

export default function SearchScreen() {
	const profile = useProfile()
	const search = useSearch()
	const addWatch = useAddWatch()

	const [origin, setOrigin] = useState("")
	const [destination, setDestination] = useState("")
	const [month, setMonth] = useState("")

	// Город вылета из профиля: вводить его каждый раз — главное трение поиска.
	useEffect(() => {
		const home = profile.data?.homeIata
		if (home && !origin) setOrigin(home)
	}, [profile.data?.homeIata, origin])

	const canSearch = IATA.test(origin) && IATA.test(destination) && !search.isPending
	const result = search.data

	const submit = () => {
		if (!canSearch) return
		haptic("medium")
		search.mutate({
			origin: origin.toUpperCase(),
			destination: destination.toUpperCase(),
			departMonth: month || undefined,
			currency: profile.data?.currency,
		})
	}

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
							autoCorrect="off"
							spellCheck={false}
							inputMode="text"
						/>
					</label>

					<label className="field">
						<span className="field__label">Куда</span>
						<input
							className="input"
							value={destination}
							onChange={(event) => setDestination(event.target.value.toUpperCase())}
							placeholder="IST"
							maxLength={3}
							autoCapitalize="characters"
							autoCorrect="off"
							spellCheck={false}
						/>
					</label>
				</div>

				<label className="field">
					<span className="field__label">Месяц вылета</span>
					<select
						className="input"
						value={month}
						onChange={(event) => setMonth(event.target.value)}
					>
						<option value="">Любой месяц</option>
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
					onClick={submit}
				>
					{search.isPending ? "Ищем…" : "Найти билеты"}
				</button>
			</section>

			{search.isPending ? <SkeletonList /> : null}
			{search.error ? <ErrorNote error={search.error} /> : null}

			{result && result.offers.length === 0 ? (
				<EmptyState
					icon="🔍"
					title="По этому маршруту цен пока нет"
					hint="Попробуйте другой месяц или соседний аэропорт."
				/>
			) : null}

			{result && result.offers.length > 0 ? (
				<div className="stack">
					{result.offers.map((offer, index) => (
						<OfferCard
							key={`${offer.departureAt}-${offer.price}-${index}`}
							offer={offer}
							title={`${offer.origin} → ${offer.destination}`}
							subtitle={offer.airline}
						/>
					))}

					{result.hidden > 0 ? (
						<div className="card">
							<p>
								<strong>Скрыто ещё {result.hidden} вариантов</strong>
							</p>
							<p className="muted">
								На бесплатном тарифе видны только самые дешёвые. Plus откроет
								весь список.
							</p>
						</div>
					) : null}

					<button
						type="button"
						className="button"
						disabled={addWatch.isPending}
						onClick={() =>
							addWatch.mutate({
								origin: result.origin,
								destination: result.destination,
								departMonth: month || null,
							})
						}
					>
						📉 Следить за ценой
					</button>

					{addWatch.error ? <ErrorNote error={addWatch.error} /> : null}
					{addWatch.isSuccess ? (
						<p className="muted">Готово. Пришлём алерт, когда цена упадёт.</p>
					) : null}
				</div>
			) : null}

			{!result && !search.isPending && !search.error ? (
				<EmptyState
					icon="✈️"
					title="Куда летим?"
					hint="Введите коды городов — например, MOW и IST."
				/>
			) : null}
		</div>
	)
}
