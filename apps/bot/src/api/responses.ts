/**
 * Ответы API и CORS.
 *
 * Mini App живёт на домене Pages, а API — на домене Worker. Это разные
 * origin, значит без CORS браузер не отдаст ответ фронту.
 *
 * Credentials не используем: авторизация идёт заголовком Authorization, а не
 * куками. Поэтому звёздочка в Allow-Origin безопасна: без валидной подписи
 * initData любой origin получит только 401.
 */

import type { ApiError, ApiErrorCode } from "@voolo/shared"

const CORS_HEADERS: Record<string, string> = {
	"access-control-allow-origin": "*",
	"access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
	"access-control-allow-headers": "authorization,content-type",
	"access-control-max-age": "86400",
}

export function json(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: {
			"content-type": "application/json; charset=utf-8",
			"cache-control": "no-store",
			...CORS_HEADERS,
		},
	})
}

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
	unauthorized: 401,
	forbidden: 403,
	invalid_request: 400,
	quota_exceeded: 402,
	watch_limit: 402,
	provider_unavailable: 503,
	not_found: 404,
	internal: 500,
}

export function fail(code: ApiErrorCode, message: string): Response {
	const body: ApiError = { error: { code, message } }
	return json(body, STATUS_BY_CODE[code])
}

export function preflight(): Response {
	return new Response(null, { status: 204, headers: CORS_HEADERS })
}
