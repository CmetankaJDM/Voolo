import { useBuyPlus, useProfile } from "../hooks"
import { EmptyState, ErrorNote, SkeletonList } from "../ui"

/** Сервер — источник правды по цене; здесь только витрина до нажатия. */
const PRICE_STARS = import.meta.env.VITE_PLUS_PRICE_STARS ?? "150"

const BENEFITS = [
	{ icon: "♾️", text: "Безлимитные поиски вместо трёх в день" },
	{ icon: "📋", text: "Все найденные варианты, а не только топ-3" },
	{ icon: "🗓", text: "Календарь цен на весь месяц" },
	{ icon: "📉", text: "До 10 отслеживаний с алертами о падении цены" },
]

export default function PlusScreen() {
	const profile = useProfile()
	const buy = useBuyPlus()

	if (profile.isPending) return <SkeletonList count={2} />
	if (profile.error) return <ErrorNote error={profile.error} />
	if (!profile.data) return <EmptyState icon="⭐" title="Профиль недоступен" />

	const { isPlus, plusUntil, quota, limits } = profile.data

	const until = plusUntil
		? new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(
				new Date(plusUntil * 1000),
			)
		: null

	return (
		<div className="stack">
			<section className="card">
				<div className="card__row">
					<div>
						<strong>Voolo Plus</strong>
						<div className="muted">
							{isPlus
								? `Активен до ${until}`
								: `Сегодня использовано поисков: ${quota.used} из ${quota.limit ?? "∞"}`}
						</div>
					</div>
					<span className={isPlus ? "badge" : "badge badge--muted"}>
						{isPlus ? "⭐ активен" : `${PRICE_STARS} ⭐`}
					</span>
				</div>
			</section>

			<section className="card">
				<ul className="stack">
					{BENEFITS.map((benefit) => (
						<li key={benefit.text}>
							<span aria-hidden="true">{benefit.icon}</span> {benefit.text}
						</li>
					))}
				</ul>

				<p className="muted">
					Разовый доступ на 30 дней, без автопродления. Оплата звёздами
					Telegram. Сейчас доступно отслеживаний: {limits.maxWatches}.
				</p>

				{!isPlus ? (
					<button
						type="button"
						className="button button--primary"
						disabled={buy.isPending}
						onClick={() => buy.mutate()}
					>
						{buy.isPending
							? "Открываем оплату…"
							: `Подключить за ${PRICE_STARS} ⭐`}
					</button>
				) : null}

				{buy.error ? <ErrorNote error={buy.error} /> : null}
				{buy.data === "cancelled" ? (
					<p className="muted">Оплата отменена. Можно вернуться к ней позже.</p>
				) : null}
				{buy.data === "paid" ? (
					<p className="muted">Спасибо! Доступ активируется за пару секунд.</p>
				) : null}
			</section>
		</div>
	)
}
