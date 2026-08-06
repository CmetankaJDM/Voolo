import { useEffect, useState } from "react"

import { useExplore, useProfile } from "../hooks"
import { haptic } from "../telegram"
import { EmptyState, ErrorNote, OfferCard, SkeletonList } from "../ui"

const IATA = /^[A-Za-z]{3}$/

/**
 * «Куда улететь из X за Y» — главный сценарий для тех, кто ещё не выбрал
 * направление. Именно он отличает Voolo от обычного поисковика билетов.
 */
export default function ExploreScreen() {
	const profile = useProfile()
	const explore = useExplore()

	const [origin, setOrigin] = useState("")
	const [budget, setBudget] = useState("")

	useEffect(() => {
		const home = profile.data?.homeIata
		if (home && !origin) setOrigin(home)
	}, [profile.data?.homeIata, origin])

	const canSearch = IATA.test(origin) && !explore.isPending
	const directions = explore.data?.directions ?? []

	const submit = () => {
		if (!canSearch) return
		haptic("medium")

		const parsed = Number.parseInt(budget, 10)
		explore.mutate({
			origin: origin.toUpperCase(),
			budget: Number.isFinite(parsed) && parsed > 0 ? parsed : undefined,
			currency: profile.data?.currency,
			limit: 20,
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
						/>
					</label>

					<label className="field">
						<span className="field__label">Бюджет, до</span>
						<input
							className="input"
							value={budget}
							onChange={(event) =>
								setBudget(event.target.value.replace(/[^0-9]/g, ""))
							}
							placeholder="30000"
							inputMode="numeric"
							maxLength={7}
						/>
					</label>
				</div>

				<button
					type="button"
					className="button button--primary"
					disabled={!canSearch}
					onClick={submit}
				>
					{explore.isPending ? "Подбираем…" : "Показать направления"}
				</button>
			</section>

			{explore.isPending ? <SkeletonList count={4} /> : null}
			{explore.error ? <ErrorNote error={explore.error} /> : null}

			{explore.data && directions.length === 0 ? (
				<EmptyState
					icon="📍"
					title="Ничего не нашлось"
					hint="Попробуйте увеличить бюджет или убрать его совсем."
				/>
			) : null}

			{directions.map((direction, index) => (
				<OfferCard
					key={`${direction.destination}-${index}`}
					offer={direction}
					title={direction.destinationName ?? direction.destination}
					subtitle={`${direction.origin} → ${direction.destination} · ${direction.airline}`}
				/>
			))}

			{!explore.data && !explore.isPending && !explore.error ? (
				<EmptyState
					icon="🌍"
					title="Ещё не решили, куда?"
					hint="Укажите город вылета и бюджет — покажем, куда хватит."
				/>
			) : null}
		</div>
	)
}
