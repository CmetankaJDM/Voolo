import { useState } from "react"

import { useProfile } from "./hooks"
import CalendarScreen from "./screens/CalendarScreen"
import ExploreScreen from "./screens/ExploreScreen"
import PlusScreen from "./screens/PlusScreen"
import SearchScreen from "./screens/SearchScreen"

type Tab = "search" | "explore" | "calendar" | "plus"

const TABS: Array<{ id: Tab; label: string; icon: string }> = [
	{ id: "search", label: "Поиск", icon: "✈️" },
	{ id: "explore", label: "Куда", icon: "📍" },
	{ id: "calendar", label: "Календарь", icon: "🗓" },
	{ id: "plus", label: "Plus", icon: "⭐" },
]

export default function App() {
	const [tab, setTab] = useState<Tab>("search")
	const profile = useProfile()

	const isPlus = profile.data?.isPlus ?? false
	const quota = profile.data?.quota

	return (
		<>
			<div className="app">
				<header className="app__header">
					<span className="wordmark">
						<span aria-hidden="true">✈️</span> voolo
					</span>

					{isPlus ? (
						<span className="badge">⭐ Plus</span>
					) : quota ? (
						<span className="badge badge--muted">
							{Math.max(0, (quota.limit ?? 0) - quota.used)} поиска сегодня
						</span>
					) : null}
				</header>

				<main>
					{tab === "search" ? <SearchScreen /> : null}
					{tab === "explore" ? <ExploreScreen /> : null}
					{tab === "calendar" ? <CalendarScreen /> : null}
					{tab === "plus" ? <PlusScreen /> : null}
				</main>
			</div>

			<nav className="tabbar">
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
