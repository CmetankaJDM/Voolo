/**
 * Криптографические примитивы поверх WebCrypto.
 *
 * Используются в двух местах, и оба — на границе доверия:
 *  • проверка заголовка X-Telegram-Bot-Api-Secret-Token на вебхуке;
 *  • проверка подписи initData из Mini App.
 *
 * Сравнение секретов только через safeCompare. Обычный === выходит из цикла
 * на первом несовпавшем байте, и по времени ответа подпись подбирается
 * побайтово. На публичном эндпоинте это не теория.
 */

const encoder = new TextEncoder()

/**
 * Сравнение строк за постоянное время.
 *
 * Длина сравниваемых строк утекает — это неизбежно и неопасно: длина подписи
 * известна публично. Утечь не должно её содержимое.
 */
export function safeCompare(left: string, right: string): boolean {
	const a = encoder.encode(left)
	const b = encoder.encode(right)

	if (a.length !== b.length) {
		// Всё равно прогоняем цикл, чтобы не отвечать мгновенно на неверную длину.
		let sink = 0
		for (let index = 0; index < a.length; index += 1) sink |= a[index]!
		return false
	}

	let diff = 0
	for (let index = 0; index < a.length; index += 1) {
		diff |= a[index]! ^ b[index]!
	}

	return diff === 0
}

/** HMAC-SHA256. Ключ — сырые байты, чтобы можно было цеплять вызовы. */
export async function hmacSha256(
	key: ArrayBuffer | Uint8Array,
	data: string,
): Promise<ArrayBuffer> {
	const cryptoKey = await crypto.subtle.importKey(
		"raw",
		key as BufferSource,
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	)

	return crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(data))
}

export function toHex(buffer: ArrayBuffer): string {
	return Array.from(new Uint8Array(buffer))
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("")
}

/** Короткий детерминированный ключ кэша из произвольной строки. */
export async function shortHash(value: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value))
	return toHex(digest).slice(0, 16)
}
