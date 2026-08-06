import { defineConfig } from "drizzle-kit"

/**
 * Генерация миграций:
 *   pnpm --filter @voolo/db generate
 *
 * Применение (из apps/bot, там живёт wrangler.toml с биндингом):
 *   wrangler d1 migrations apply voolo-db --local
 *   wrangler d1 migrations apply voolo-db --remote
 */
export default defineConfig({
	schema: "./src/schema.ts",
	out: "./migrations",
	dialect: "sqlite",
	driver: "d1-http",
	verbose: true,
	strict: true,
})
