/**
 * Проверка initData из Mini App.
 *
 * Это единственная граница доверия между браузером и базой. Всё, что
 * пришло из Mini App, по умолчанию враждебно: строку initData тривиально
 * подделать в DevTools. Правила:
 *
 *  1. user.id берётся ТОЛЬКО из проверенной подписи. Никогда — из тела запроса.
 *  2. Сравнение подписи — только safeCompare.
 *  3. auth_date проверяется всегда. Без этого однажды утекшая строка годится
 *     вечно. Для денежных действий окно уже — час вместо суток.
 *
 * Алгоритм: secret = HMAC_SHA256(key="WebAppData", data=BOT_TOKEN),
 * затем hash = HMAC_SHA256(key=secret, data=data_check_string).
 */

import { hmacSha256, safeCompare, toHex } from "../lib/crypto"

export const READ_MAX_AGE_SECONDS = 24 * 3600
export const WRITE_MAX_AGE_SECONDS = 3600

export type InitDataUser = {
	id: number
	firstName?: string
	username?: string
	languageCode?: string
	isPremium?: boolean
}

export type AuthResult =
	| { ok: true; user: InitDataUser; authDate: number; startParam?: string }
	| { ok: false; reason: "missing" | "malformed" | "bad_signature" | "expired" }

/** Заголовок по соглашению Telegram: `Authorization: tma <initDataRaw>`. */
export function readInitDataHeader(request: Request): string | null {
	const header = request.headers.get("authorization")
	if (!header) return null

	const [scheme, ...rest] = header.split(" ")
	if (scheme?.toLowerCase() !== "tma") return null

	const raw = rest.join(" ").trim()
	return raw.length > 0 ? raw : null
}

export async function verifyInitData(
	initDataRaw: string | null,
	botToken: string,
	maxAgeSeconds: number = READ_MAX_AGE_SECONDS,
): Promise<AuthResult> {
	if (!initDataRaw) return { ok: false, reason: "missing" }

	const params = new URLSearchParams(initDataRaw)
	const hash = params.get("hash")
	const authDateRaw = params.get("auth_date")
	const userRaw = params.get("user")

	if (!hash || !authDateRaw || !userRaw) return { ok: false, reason: "malformed" }

	// data_check_string: всё кроме hash, по алфавиту, через \n. signature тоже
	// исключается: это поле для сторонней Ed25519-проверки, а не часть HMAC.
	const pairs: string[] = []
	for (const [key, value] of params.entries()) {
		if (key === "hash" || key === "signature") continue
		pairs.push(`${key}=${value}`)
	}
	pairs.sort()

	const secret = await hmacSha256(new TextEncoder().encode("WebAppData"), botToken)
	const expected = toHex(await hmacSha256(secret, pairs.join("\n")))

	if (!safeCompare(expected, hash)) return { ok: false, reason: "bad_signature" }

	const authDate = Number(authDateRaw)
	if (!Number.isFinite(authDate)) return { ok: false, reason: "malformed" }

	const age = Math.floor(Date.now() / 1000) - authDate
	if (age > maxAgeSeconds || age < -300) return { ok: false, reason: "expired" }

	let parsed: Record<string, unknown>
	try {
		parsed = JSON.parse(userRaw) as Record<string, unknown>
	} catch {
		return { ok: false, reason: "malformed" }
	}

	const id = Number(parsed.id)
	if (!Number.isInteger(id) || id <= 0) return { ok: false, reason: "malformed" }

	return {
		ok: true,
		authDate,
		startParam: params.get("start_param") ?? undefined,
		user: {
			id,
			firstName: typeof parsed.first_name === "string" ? parsed.first_name : undefined,
			username: typeof parsed.username === "string" ? parsed.username : undefined,
			languageCode:
				typeof parsed.language_code === "string" ? parsed.language_code : undefined,
			isPremium: parsed.is_premium === true,
		},
	}
}
