import { useState } from "react"

import { useProfile } from "./hooks"
import CalendarScreen from "./screens/CalendarScreen"
import ExploreScreen from "./screens/ExploreScreen"
import PlusScreen from "./screens/PlusScreen"
import SearchScreen from "./screens/SearchScreen"
import WatchlistScreen from "./screens/WatchlistScreen"

type Tab = "search" | "explore" | "calendar" | "watch" | "plus"

const TABS: Array<{ id: Tab; label: string; icon: string }> = [
	{ id: "search", label: "Поиск", icon: "✈️" },
	{ id: "explore", label: "Куда", icon: "📍" },
	{ id: "calendar", label: "Календарь", icon: "🗓" },
	{ id: "watch", label: "Слежу", icon: "📉" },
	{ id: "plus", label: "Plus", icon: "⭐" },
]

export default function App() {
	const [tab, setTab] = useState<Tab>("search")
	const profile = useProfile()

	const isPlus = profile.data?.isPlus ?? false
	const quota = profile.data?.quota
	const left = quota ? Math.max(0, (quota.limit ?? 0) - quota.used) : null

	return (
		<>
			<div className="app">
				<header className="app__header">
					<span className="wordmark">
						<span aria-hidden="true">✈️</span> voolo
					</span>

					{isPlus ? (
						<span className="badge">⭐ Plus</span>
					) : left !== null ? (
						<span className="badge badge--muted">Осталось поисков: {left}</span>
					) : null}
				</header>

				<main>
					{tab === "search" ? <SearchScreen /> : null}
					{tab === "explore" ? <ExploreScreen /> : null}
					{tab === "calendar" ? <CalendarScreen /> : null}
					{tab === "watch" ? <WatchlistScreen /> : null}
					{tab === "plus" ? <PlusScreen /> : null}
				</main>
			</div>

			<nav className="tabbar" aria-label="Разделы">
				{TABS.map((item) => (
					<button
						key={item.id}
						type="button"
						className={`tabbar__item${tab === item.id ? " tabbar__item--active" : ""}`}
						aria-current={tab === item.id ? "page" : undefined}
						onClick={() => setTab(item.id)}
					>
						<span className="tabbar__icon" aria-hidden="true">
							{item.icon}
						</span>
						{item.label}
					</button>
				))}
			</nav>
		</>
	)
}
