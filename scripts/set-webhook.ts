/**
 * Регистрация вебхука.
 *
 * Запуск:
 *   BOT_TOKEN=... TELEGRAM_WEBHOOK_SECRET=... WEBHOOK_URL=https://voolo-bot.workers.dev \
 *     pnpm tsx scripts/set-webhook.ts
 *
 * Снять вебхук: тот же вызов с флагом --delete.
 *
 * allowed_updates задаётся явно. Значение по умолчанию отличается от «всё», и
 * молчаливо не приходящий тип апдейта ищется часами.
 */

const API_BASE = "https://api.telegram.org"

const WEBHOOK_PATH = "/telegram/webhook"

const ALLOWED_UPDATES = [
	"message",
	"edited_message",
	"callback_query",
	"pre_checkout_query",
	"my_chat_member",
]

async function main(): Promise<void> {
	const token = process.env.BOT_TOKEN
	if (!token) throw new Error("BOT_TOKEN не задан")

	if (process.argv.includes("--delete")) {
		console.log(
			"deleteWebhook:",
			await call(token, "deleteWebhook", { drop_pending_updates: false }),
		)
		return
	}

	const base = process.env.WEBHOOK_URL
	if (!base) throw new Error("WEBHOOK_URL не задан")

	const secret = process.env.TELEGRAM_WEBHOOK_SECRET
	if (!secret || secret.length < 16) {
		throw new Error("TELEGRAM_WEBHOOK_SECRET не задан или короче 16 символов")
	}

	const url = new URL(WEBHOOK_PATH, base).toString()

	const result = await call(token, "setWebhook", {
		url,
		secret_token: secret,
		allowed_updates: ALLOWED_UPDATES,
		// Не сбрасываем очередь: оплаты и pre_checkout терять нельзя.
		drop_pending_updates: false,
		max_connections: 40,
	})

	console.log("setWebhook:", result)
	console.log("getWebhookInfo:", await call(token, "getWebhookInfo", {}))
}

async function call(
	token: string,
	method: string,
	payload: Record<string, unknown>,
): Promise<unknown> {
	const endpoint = `${API_BASE}/bot${token}/${method}`

	const response = await fetch(endpoint, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(payload),
	})

	const body = (await response.json()) as { ok: boolean; description?: string }
	if (!body.ok) throw new Error(`${method} упал: ${body.description ?? response.status}`)

	return body
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error)
	process.exit(1)
})
