/**
 * Живая проверка rich-блоков против реального Bot API.
 *
 * Зачем: часть полей в types.ts помечена UNVERIFIED — имена выведены
 * по аналогии, а не взяты из документации. Единственный честный способ
 * узнать правду — отправить блок и посмотреть на ответ сервера.
 *
 * Запуск:
 *   BOT_TOKEN=... VERIFY_CHAT_ID=... pnpm tsx scripts/verify-rich-blocks.ts
 *
 * VERIFY_CHAT_ID — ваш личный chat_id. Скрипт реально пришлёт туда
 * по сообщению на каждый успешный блок. Не запускайте на чате с людьми.
 */

const API_BASE = "https://api.telegram.org"

const token = process.env.BOT_TOKEN
const chatId = process.env.VERIFY_CHAT_ID

if (!token || !chatId) {
	console.error("Нужны переменные BOT_TOKEN и VERIFY_CHAT_ID.")
	process.exit(1)
}

type Probe = {
	name: string
	status: "VERIFIED" | "UNVERIFIED"
	block: Record<string, unknown>
}

const probes: Probe[] = [
	{ name: "paragraph", status: "VERIFIED", block: { type: "paragraph", text: "probe" } },
	{ name: "heading", status: "VERIFIED", block: { type: "heading", text: "probe", size: 3 } },
	{ name: "footer", status: "VERIFIED", block: { type: "footer", text: "probe" } },
	{ name: "divider", status: "VERIFIED", block: { type: "divider" } },
	{ name: "pre", status: "VERIFIED", block: { type: "pre", text: "probe", language: "txt" } },
	{
		name: "list + checkbox",
		status: "VERIFIED",
		block: {
			type: "list",
			items: [
				{ blocks: [{ type: "paragraph", text: "обычный" }] },
				{
					blocks: [{ type: "paragraph", text: "отмеченный" }],
					has_checkbox: true,
					is_checked: true,
				},
			],
		},
	},
	{
		name: "table",
		status: "VERIFIED",
		block: {
			type: "table",
			is_bordered: true,
			is_striped: true,
			caption: "probe",
			cells: [
				[
					{ text: "Дата", is_header: true, align: "left", valign: "middle" },
					{ text: "Цена", is_header: true, align: "right", valign: "middle" },
				],
				[
					{ text: "12 авг", align: "left", valign: "middle" },
					{ text: "18 400 ₽", align: "right", valign: "middle" },
				],
			],
		},
	},
	{
		name: "table с colspan и пустой ячейкой",
		status: "VERIFIED",
		block: {
			type: "table",
			cells: [
				[
					{ text: "шапка", colspan: 2, align: "center", valign: "middle" },
					{ align: "left", valign: "middle" },
				],
				[
					{ text: "a", align: "left", valign: "middle" },
					{ text: "b", align: "left", valign: "middle" },
				],
			],
		},
	},
	{
		name: "details",
		status: "VERIFIED",
		block: {
			type: "details",
			summary: "Подробности",
			blocks: [{ type: "paragraph", text: "скрытый текст" }],
		},
	},
	{
		name: "blockquote + credit",
		status: "VERIFIED",
		block: {
			type: "blockquote",
			blocks: [{ type: "paragraph", text: "цитата" }],
			credit: "источник",
		},
	},
	{ name: "thinking", status: "VERIFIED", block: { type: "thinking", text: "ищу билеты" } },
	{
		name: "marked (inline)",
		status: "VERIFIED",
		block: {
			type: "paragraph",
			text: ["обычный ", { type: "marked", text: "подсвеченный" }],
		},
	},
	// ── Ниже — то, ради чего скрипт и написан ─────────────────────────
	{
		name: "custom_emoji (имя поля custom_emoji_id)",
		status: "UNVERIFIED",
		block: {
			type: "paragraph",
			text: {
				type: "custom_emoji",
				text: "✈️",
				custom_emoji_id: "5368324170671202286",
			},
		},
	},
	{
		name: "mathematical_expression (inline)",
		status: "UNVERIFIED",
		block: {
			type: "paragraph",
			text: { type: "mathematical_expression", expression: "E = mc^2" },
		},
	},
	{
		name: "pullquote",
		status: "UNVERIFIED",
		block: { type: "pullquote", text: "врезка", credit: "Voolo" },
	},
	{
		name: "anchor + anchor_link",
		status: "UNVERIFIED",
		block: {
			type: "paragraph",
			text: { type: "anchor_link", text: "к разделу", anchor_name: "top" },
		},
	},
]

async function send(block: Record<string, unknown>) {
	const res = await fetch(`${API_BASE}/bot${token}/sendRichMessage`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			chat_id: chatId,
			rich_message: { blocks: [block] },
			disable_notification: true,
		}),
	})
	return (await res.json()) as { ok: boolean; description?: string }
}

async function main() {
	console.log(`Проверяю ${probes.length} блоков...\n`)

	const failures: string[] = []

	for (const probe of probes) {
		let ok = false
		let description = ""

		try {
			const res = await send(probe.block)
			ok = res.ok
			description = res.description ?? ""
		} catch (error) {
			description = error instanceof Error ? error.message : String(error)
		}

		const mark = ok ? "✓" : "✗"
		console.log(
			`${mark}  ${probe.status.padEnd(10)}  ${probe.name}${description ? ` — ${description}` : ""}`,
		)

		if (!ok) failures.push(`${probe.name}: ${description}`)

		// Лимит Telegram — 30 сообщений в секунду, но спешить некуда.
		await new Promise((resolve) => setTimeout(resolve, 350))
	}

	console.log("")

	if (failures.length === 0) {
		console.log("Все блоки приняты сервером. UNVERIFIED можно переводить в VERIFIED.")
		return
	}

	console.log(`Не прошли: ${failures.length}`)
	for (const failure of failures) console.log(`  • ${failure}`)
	console.log("\nИсправьте имена полей в apps/bot/src/rich/types.ts и повторите.")
	process.exitCode = 1
}

void main()
