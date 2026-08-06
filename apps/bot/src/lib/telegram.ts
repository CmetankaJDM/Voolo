/**
 * Тонкий клиент Bot API для мест, где grammY недоступен.
 *
 * Где именно: HTTP-роуты Mini App и крон. Там нет ни Context, ни апдейта,
 * а поднимать ради одного вызова целый Bot — лишние миллисекунды CPU,
 * которых у Worker и так мало.
 *
 * Базовый адрес вынесен в отдельную константу осознанно: собирать адрес
 * по кускам по месту вызова — верный способ однажды получить битый URL.
 */

const API_BASE = "https://api.telegram.org"

export type TelegramResult<T> = {
	ok: boolean
	result?: T
	description?: string
	error_code?: number
}

export async function callTelegram<T>(
	token: string,
	method: string,
	payload: Record<string, unknown>,
): Promise<TelegramResult<T>> {
	const response = await fetch(`${API_BASE}/bot${token}/${method}`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(payload),
	})

	return (await response.json()) as TelegramResult<T>
}

/**
 * Ссылка на оплату звёздами для Mini App.
 *
 * Для XTR: provider_token не передаётся, в prices ровно одна позиция, amount —
 * целое число звёзд без множителя в сотню.
 */
export async function createInvoiceLink(
	token: string,
	input: {
		title: string
		description: string
		payload: string
		stars: number
		label?: string
	},
): Promise<string | null> {
	const result = await callTelegram<string>(token, "createInvoiceLink", {
		title: input.title.slice(0, 32),
		description: input.description.slice(0, 255),
		payload: input.payload,
		currency: "XTR",
		prices: [{ label: input.label ?? input.title.slice(0, 32), amount: input.stars }],
	})

	if (!result.ok || !result.result) {
		console.warn("createInvoiceLink failed", result.description)
		return null
	}

	return result.result
}
