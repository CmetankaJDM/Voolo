import { fileURLToPath, URL } from "node:url"

import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

/**
 * Сборка Mini App.
 *
 * Алиас на исходники @voolo/shared, а не на сборку: пакет не компилируется
 * отдельным шагом. Контракты и бренд-токены попадают в бандл как обычный TS
 * и трясутся tree-shakingом.
 */
export default defineConfig({
	plugins: [react()],
	resolve: {
		alias: {
			"@voolo/shared": fileURLToPath(
				new URL("../../packages/shared/src/index.ts", import.meta.url),
			),
		},
	},
	server: {
		// Разработка идёт через туннель — слушаем все интерфейсы.
		host: true,
		port: 5173,
		strictPort: true,
	},
	build: {
		target: "es2022",
		outDir: "dist",
		sourcemap: true,
		// Мобильный интернет: крупный бандл — это секунды белого экрана.
		chunkSizeWarningLimit: 300,
	},
})
