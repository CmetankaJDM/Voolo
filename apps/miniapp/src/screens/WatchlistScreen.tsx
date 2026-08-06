import { useFavorites, useProfile, useRemoveWatch, useToggleFavorite, useWatches } from "../hooks"
import { EmptyState, ErrorNote, formatPrice, SkeletonList } from "../ui"

/** «Проверено N дн. назад» — без этого непонятно, живо ли отслеживание. */
function checkedLabel(lastCheckedAt: number | null): string {
	if (!lastCheckedAt) return "ещё не проверяли"

	const days = Math.floor((Date.now() / 1000 - lastCheckedAt) / 86_400)
	if (days <= 0) return "проверено сегодня"
	if (days === 1) return "проверено вчера"
	return `проверено ${days} дн. назад`
}

function monthLabel(departMonth: string | null): string {
	if (!departMonth) return "любой месяц"

	const [year, month] = departMonth.split("-")
	const date = new Date(Date.UTC(Number(year), Number(month) - 1, 1))
	if (Number.isNaN(date.getTime())) return departMonth

	return new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" })
		.format(date)
		.replace(" г.", "")
}

/**
 * Слежу и избранное на одном экране.
 *
 * Разница для пользователя: избранное — это закладка, отслеживание — это
 * обещание разбудить уведомлением. Поэтому отслеживания идут первыми.
 */
export default function WatchlistScreen() {
	const profile = useProfile()
	const watches = useWatches()
	const favorites = useFavorites()
	const removeWatch = useRemoveWatch()
	const toggleFavorite = useToggleFavorite()

	const currency = profile.data?.currency ?? "RUB"
	const maxWatches = profile.data?.limits.maxWatches
	const watchRows = watches.data?.watches ?? []
	const favoriteRows = favorites.data?.favorites ?? []

	return (
		<div className="stack">
			<section>
				<div className="app__header">
					<strong>📉 Отслеживания</strong>
					{maxWatches ? (
						<span className="badge badge--muted">
							{watchRows.length} из {maxWatches}
						</span>
					) : null}
				</div>

				{watches.isPending ? <SkeletonList count={2} /> : null}
				{watches.error ? <ErrorNote error={watches.error} /> : null}

				{!watches.isPending && watchRows.length === 0 ? (
					<EmptyState
						icon="📉"
						title="Пока ни за чем не следим"
						hint="Найдите маршрут и нажмите «Следить за ценой» — пришлём алерт при падении."
					/>
				) : null}

				{watchRows.map((watch) => (
					<article className="card" key={watch.id}>
						<div className="card__row">
							<div>
								<strong>
									{watch.origin} → {watch.destination}
								</strong>
								<div className="muted">{monthLabel(watch.departMonth)}</div>
								<div className="muted">
									{watch.targetPrice
										? `цель: до ${formatPrice(watch.targetPrice, currency)}`
										: "алерт при падении от 7%"}
								</div>
								<div className="muted">{checkedLabel(watch.lastCheckedAt)}</div>
							</div>

							{watch.lastPrice ? (
								<div className="price price--accent">
									{formatPrice(watch.lastPrice, currency)}
								</div>
							) : null}
						</div>

						<button
							type="button"
							className="button button--ghost"
							disabled={removeWatch.isPending}
							onClick={() => removeWatch.mutate(watch.id)}
						>
							Перестать следить
						</button>
					</article>
				))}
			</section>

			<section>
				<div className="app__header">
					<strong>⭐ Избранные маршруты</strong>
				</div>

				{favorites.isPending ? <SkeletonList count={1} /> : null}
				{favorites.error ? <ErrorNote error={favorites.error} /> : null}

				{!favorites.isPending && favoriteRows.length === 0 ? (
					<EmptyState
						icon="⭐"
						title="Избранного пока нет"
						hint="Сюда попадают маршруты, к которым вы возвращаетесь."
					/>
				) : null}

				{favoriteRows.map((favorite) => (
					<article className="card" key={favorite.id}>
						<div className="card__row">
							<strong>
								{favorite.origin} → {favorite.destination}
							</strong>
							<button
								type="button"
								className="button button--ghost"
								disabled={toggleFavorite.isPending}
								onClick={() =>
									toggleFavorite.mutate({
										origin: favorite.origin,
										destination: favorite.destination,
										existingId: favorite.id,
									})
								}
							>
								Убрать
							</button>
						</div>
					</article>
				))}
			</section>
		</div>
	)
}
