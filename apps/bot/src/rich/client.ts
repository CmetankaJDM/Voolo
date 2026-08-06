/**
 * Клиент Rich Messages с автоматическим фолбэком.
 *
 * Почему собственный клиент, а не grammY — см. ADR-004.
 *
 * Правило проекта: ни одно сообщение не имеет права пропасть из-за того,
 * что клиент пользователя или сервер не знают rich-блоков. Если sendRichMessage
 * недоступен — те же блоки уплощаются в HTML и уходят обычным sendMessage.
 * Потеря только в красоте, не в смысле.
 */

import {
	RICH_MESSAGE_MAX_LENGTH,
	type InputRichBlock,
	type RichBlockTableCell,
	type RichText,
	type SendRichMessageParams,
} from "./types"

const API_BASE = "https://api.telegram.org"

export type RichSendResult = {
	ok: boolean
	transport: "rich" | "html_fallback"
	messageId?: number
	error?: string
}

type SendExtra = {
	reply_markup?: Record<string, unknown>
	disable_notification?: boolean
	protect_content?: boolean
	direct_messages_topic_id?: number
}

export class RichClient {
	private readonly token: string

	/**
	 * null — ещё не знаем; false — метода нет, больше не дёргаем его вообще.
	 * Кэш живёт в памяти изолята — этого достаточно.
	 */
	private richSupported: boolean | null = null

	constructor(token: string) {
		this.token = token
	}

	private async call(
		method: string,
		payload: Record<string, unknown>,
	): Promise<{ ok: boolean; result?: any; description?: string }> {
		const res = await fetch(`${API_BASE}/bot${this.token}/${method}`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(payload),
		})
		return (await res.json()) as {
			ok: boolean
			result?: any
			description?: string
		}
	}

	/**
	 * Отправить набор блоков. Сначала rich, при неудаче — HTML.
	 */
	async sendBlocks(
		chatId: number | string,
		blocks: InputRichBlock[],
		extra: SendExtra = {},
	): Promise<RichSendResult> {
		if (this.richSupported !== false) {
			const params: SendRichMessageParams = {
				chat_id: chatId,
				rich_message: { blocks },
				...extra,
			}

			try {
				const res = await this.call("sendRichMessage", params)
				if (res.ok) {
					this.richSupported = true
					return {
						ok: true,
						transport: "rich",
						messageId: res.result?.message_id,
					}
				}

				// Метода нет на сервере — помечаем и больше не пробуем.
				if ((res.description ?? "").toLowerCase().includes("method not found")) {
					this.richSupported = false
				}
			} catch {
				// Сетевая ошибка — не повод отключать rich навсегда, просто идём в фолбэк.
			}
		}

		const html = truncate(flattenToHtml(blocks), RICH_MESSAGE_MAX_LENGTH)
		const res = await this.call("sendMessage", {
			chat_id: chatId,
			text: html,
			parse_mode: "HTML",
			link_preview_options: { is_disabled: true },
			...extra,
		})

		return {
			ok: res.ok,
			transport: "html_fallback",
			messageId: res.result?.message_id,
			error: res.ok ? undefined : res.description,
		}
	}
}

// ── Уплощение блоков в HTML ────────────────────────────────────────

export function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
}

export function richTextToHtml(text: RichText): string {
	if (typeof text === "string") return escapeHtml(text)
	if (Array.isArray(text)) return text.map(richTextToHtml).join("")

	switch (text.type) {
		case "bold":
			return `<b>${richTextToHtml(text.text)}</b>`
		case "italic":
		case "marked": // подсветки в HTML нет — ближайший аналог курсив
			return `<i>${richTextToHtml(text.text)}</i>`
		case "underline":
			return `<u>${richTextToHtml(text.text)}</u>`
		case "strikethrough":
			return `<s>${richTextToHtml(text.text)}</s>`
		case "spoiler":
			return `<tg-spoiler>${richTextToHtml(text.text)}</tg-spoiler>`
		case "code":
			return `<code>${richTextToHtml(text.text)}</code>`
		case "url":
			return `<a href="${escapeHtml(text.url)}">${richTextToHtml(text.text)}</a>`
		case "email_address":
			return `<a href="mailto:${escapeHtml(text.email_address)}">${richTextToHtml(text.text)}</a>`
		case "mention":
			return escapeHtml(`@${text.username}`)
		case "mathematical_expression":
			return `<code>${escapeHtml(text.expression)}</code>`
		case "anchor":
			return "" // якорь невидим и без rich-режима бесполезен
		default:
			return "text" in text ? richTextToHtml(text.text) : ""
	}
}

export function richTextToPlain(text: RichText): string {
	if (typeof text === "string") return text
	if (Array.isArray(text)) return text.map(richTextToPlain).join("")
	if (text.type === "mathematical_expression") return text.expression
	if (text.type === "anchor") return ""
	return "text" in text ? richTextToPlain(text.text) : ""
}

/** Таблица без rich-режима — это моноширинная сетка в <pre>. */
export function tableToPre(cells: RichBlockTableCell[][]): string {
	const grid = cells.map((row) => row.map((cell) => richTextToPlain(cell.text ?? "")))
	const columnCount = Math.max(0, ...grid.map((row) => row.length))

	const widths: number[] = []
	for (let column = 0; column < columnCount; column += 1) {
		widths[column] = Math.max(
			...grid.map((row) => (row[column] ?? "").length),
			1,
		)
	}

	const lines = grid.map((row) =>
		row
			.map((value, column) => value.padEnd(widths[column] ?? 0, " "))
			.join("  ")
			.trimEnd(),
	)

	return `<pre>${escapeHtml(lines.join("\n"))}</pre>`
}

/** Превращает дерево блоков в одну HTML-строку для sendMessage. */
export function flattenToHtml(blocks: InputRichBlock[]): string {
	const parts: string[] = []

	for (const block of blocks) {
		switch (block.type) {
			case "paragraph":
				parts.push(richTextToHtml(block.text))
				break
			case "heading":
				parts.push(`<b>${richTextToHtml(block.text)}</b>`)
				break
			case "footer":
				parts.push(`<i>${richTextToHtml(block.text)}</i>`)
				break
			case "divider":
				parts.push("──────────")
				break
			case "pre":
				parts.push(`<pre>${richTextToHtml(block.text)}</pre>`)
				break
			case "table":
				parts.push(tableToPre(block.cells))
				break
			case "list":
				parts.push(
					block.items
						.map((item) => {
							const marker = item.has_checkbox
								? item.is_checked
									? "☑️"
									: "☐"
								: "•"
							return `${marker} ${flattenToHtml(item.blocks)}`
						})
						.join("\n"),
				)
				break
			case "blockquote":
				parts.push(`<blockquote>${flattenToHtml(block.blocks)}</blockquote>`)
				break
			case "pullquote":
				parts.push(`<blockquote>${richTextToHtml(block.text)}</blockquote>`)
				break
			case "details":
				// Сворачиваемого блока нет, но expandable-цитата близка по смыслу.
				parts.push(
					`<b>${richTextToHtml(block.summary)}</b>\n<blockquote expandable>${flattenToHtml(block.blocks)}</blockquote>`,
				)
				break
			case "thinking":
				parts.push(`<i>${richTextToHtml(block.text)}</i>`)
				break
			case "anchor":
				break // невидимый служебный блок
			default:
				// Медиа-блоки в текстовом фолбэке осознанно опускаем:
				// отправлять их надо отдельными методами, а не внутри текста.
				break
		}
	}

	return parts.filter(Boolean).join("\n\n")
}

export function truncate(value: string, limit: number): string {
	if (value.length <= limit) return value
	return `${value.slice(0, Math.max(0, limit - 1))}\u2026`
}
