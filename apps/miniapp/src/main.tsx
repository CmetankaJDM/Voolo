import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import App from "./App"
import { initTelegram, trackViewport } from "./telegram"
import "./theme.css"

/**
 * Точка входа.
 *
 * initTelegram вызывается ДО монтирования: если сообщить клиенту ready() после
 * первого рендера, на части клиентов виден белый проблеск и скачок высоты.
 */
initTelegram()
trackViewport()

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			// Мобильная сеть рвётся часто — один повтор полезен, три раздражают.
			retry: 1,
			refetchOnWindowFocus: false,
		},
		mutations: { retry: 0 },
	},
})

const container = document.getElementById("root")
if (!container) throw new Error("Не найден #root")

createRoot(container).render(
	<StrictMode>
		<QueryClientProvider client={queryClient}>
			<App />
		</QueryClientProvider>
	</StrictMode>,
)
