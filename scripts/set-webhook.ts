/**
 * Регистрация вебхука.
 *
 * Запуск:
 *   BOT_TOKEN=... TELEGRAM_WEBHOOK_SECRET=... WEBHOOK_URL=https://voolo-bot.workers.dev \
 *     pnpm tsx scripts/set-webhook.ts
 *
 * Снять вебхук: тот же вызов с флагом --delete.
 *
 * allowed_updates задаётся явно. По умолчанию Telegram не шлёт часть типов
 * (например message_reaction), а молчаливо отсутствующие апдейты ищутся часами.
 */

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

	const shouldDelete = process.argv.includes("--delete")

	if (shouldDelete) {
		const result = await call(token, "deleteWebhook", { drop_pending_updates: false })
		console.log("deleteWebhook:", result)
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
	const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
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
