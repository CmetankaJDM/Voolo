/**
 * API для Mini App.
 *
 * Весь бизнес-смысл приложения проходит через этот файл, поэтому здесь три
 * жёстких правила:
 *
 *  1. Каждый роут начинается с проверки initData. Нет подписи — нет ответа.
 *  2. Тело запроса разбирается только через zod-схемы из @voolo/shared.
 *  3. userId берётся из подписи, никогда из тела запроса.
 */

import {
	addFavorite,
	consumeSearchQuota,
	countWatches,
	createDb,
	createWatch,
	deleteWatch,
	listFavorites,
	listWatches,
	peekSearchQuota,
	premiumUntil,
	removeFavorite,
	schema,
	setHomeIata,
	setUserCurrency,
	setUserLocale,
	upsertUser,
	type Db,
} from "@voolo/db"
import {
	calendarRequestSchema,
	exploreRequestSchema,
	favoriteCreateSchema,
	invoiceRequestSchema,
	profileUpdateSchema,
	searchRequestSchema,
	watchCreateSchema,
	type ProfileResponse,
	type SearchResponse,
} from "@voolo/shared"

import { readConfig, type Env } from "../env"
import { createProvider, ProviderError } from "../providers/travelpayouts"
import {
	readInitDataHeader,
	verifyInitData,
	WRITE_MAX_AGE_SECONDS,
	type InitDataUser,
} from "./auth"
import { fail, json, preflight } from "./responses"

const FREE_MAX_WATCHES = 1

type Session = {
	db: Db
	user: InitDataUser
	row: schema.User
	isPlus: boolean
	plusUntil: number | null
}

export async function handleApiRequest(
	request: Request,
	env: Env,
	_ctx: ExecutionContext,
): Promise<Response> {
	if (request.method === "OPTIONS") return preflight()

	const url = new URL(request.url)
	const path = url.pathname.replace(/^\/api/, "") || "/"
	const config = readConfig(env)

	// Для денежных роутов окно жизни подписи короче — час вместо суток.
	const maxAge = path === "/invoice" ? WRITE_MAX_AGE_SECONDS : undefined
	const auth = await verifyInitData(readInitDataHeader(request), env.BOT_TOKEN, maxAge)

	if (!auth.ok) {
		return fail(
			"unauthorized",
			auth.reason === "expired"
				? "Сессия устарела. Переоткройте приложение."
				: "Неверная подпись initData.",
		)
	}

	const db = createDb(env.DB)
	const row = await upsertUser(db, {
		id: auth.user.id,
		username: auth.user.username,
		firstName: auth.user.firstName,
		languageCode: auth.user.languageCode,
		referralSource: auth.startParam?.slice(0, 64),
	})

	const plusUntil = await premiumUntil(db, row.id)
	const session: Session = {
		db,
		user: auth.user,
		row,
		isPlus: plusUntil !== null,
		plusUntil,
	}

	try {
		return await route(path, request, env, config, session)
	} catch (error) {
		if (error instanceof ProviderError) {
			console.warn("provider failed", error.status, error.message)
			return fail("provider_unavailable", "Источник цен временно недоступен.")
		}

		console.error("api failed", { path, error })
		return fail("internal", "Что-то пошло не так.")
	}
}

async function route(
	path: string,
	request: Request,
	env: Env,
	config: ReturnType<typeof readConfig>,
	session: Session,
): Promise<Response> {
	const { db, row } = session
	const method = request.method

	// ── Профиль ─────────────────────────────────────────────

	if (path === "/profile" && method === "GET") {
		const used = await peekSearchQuota(db, row.id)
		const profile: ProfileResponse = {
			id: row.id,
			firstName: row.firstName,
			locale: row.locale,
			currency: row.currency,
			homeIata: row.homeIata,
			isPlus: session.isPlus,
			plusUntil: session.plusUntil,
			quota: {
				used,
				limit: session.isPlus ? null : config.freeSearchesPerDay,
			},
			limits: {
				maxWatches: session.isPlus ? config.plusMaxWatches : FREE_MAX_WATCHES,
				freeResults: session.isPlus ? 0 : config.freeResultsLimit,
			},
		}
		return json(profile)
	}

	if (path === "/profile" && method === "POST") {
		const input = profileUpdateSchema.safeParse(await readJson(request))
		if (!input.success) return fail("invalid_request", input.error.issues[0]!.message)

		if (input.data.locale) await setUserLocale(db, row.id, input.data.locale)
		if (input.data.currency) await setUserCurrency(db, row.id, input.data.currency)
		if (input.data.homeIata) await setHomeIata(db, row.id, input.data.homeIata)

		return json({ ok: true })
	}

	// ── Поиск ───────────────────────────────────────────────

	if (path === "/search" && method === "POST") {
		const input = searchRequestSchema.safeParse(await readJson(request))
		if (!input.success) return fail("invalid_request", input.error.issues[0]!.message)

		let used = 0
		if (!session.isPlus) {
			const quota = await consumeSearchQuota(db, row.id, config.freeSearchesPerDay)
			used = quota.used
			if (!quota.allowed) {
				return fail(
					"quota_exceeded",
					`Бесплатные поиски на сегодня закончились (${config.freeSearchesPerDay}).`,
				)
			}
		}

		const provider = createProvider(env)
		const all = await provider.cheapest({
			origin: input.data.origin,
			destination: input.data.destination,
			departMonth: input.data.departMonth,
			returnMonth: input.data.oneWay ? undefined : input.data.returnMonth,
			currency: input.data.currency,
		})

		const offers = session.isPlus ? all : all.slice(0, config.freeResultsLimit)
		const response: SearchResponse = {
			origin: input.data.origin,
			destination: input.data.destination,
			offers,
			hidden: all.length - offers.length,
			quota: { used, limit: session.isPlus ? null : config.freeSearchesPerDay },
			isPlus: session.isPlus,
		}

		return json(response)
	}

	if (path === "/calendar" && method === "POST") {
		const input = calendarRequestSchema.safeParse(await readJson(request))
		if (!input.success) return fail("invalid_request", input.error.issues[0]!.message)

		const days = await createProvider(env).calendar(input.data)

		// Календарь на три месяца — фича Plus. Бесплатно только текущий запрошенный.
		return json({ month: input.data.month, days, isPlus: session.isPlus })
	}

	if (path === "/explore" && method === "POST") {
		const input = exploreRequestSchema.safeParse(await readJson(request))
		if (!input.success) return fail("invalid_request", input.error.issues[0]!.message)

		const directions = await createProvider(env).directions({
			origin: input.data.origin,
			currency: input.data.currency,
			budget: input.data.budget,
			limit: session.isPlus ? input.data.limit : Math.min(input.data.limit, 5),
		})

		return json({ directions, isPlus: session.isPlus })
	}

	// ── Избранное ──────────────────────────────────────────

	if (path === "/favorites" && method === "GET") {
		return json({ favorites: await listFavorites(db, row.id) })
	}

	if (path === "/favorites" && method === "POST") {
		const input = favoriteCreateSchema.safeParse(await readJson(request))
		if (!input.success) return fail("invalid_request", input.error.issues[0]!.message)

		await addFavorite(db, row.id, input.data.origin, input.data.destination)
		return json({ favorites: await listFavorites(db, row.id) })
	}

	if (path.startsWith("/favorites/") && method === "DELETE") {
		const id = Number(path.slice("/favorites/".length))
		if (!Number.isInteger(id)) return fail("invalid_request", "Неверный id.")

		await removeFavorite(db, row.id, id)
		return json({ favorites: await listFavorites(db, row.id) })
	}

	// ── Отслеживания ────────────────────────────────────────

	if (path === "/watches" && method === "GET") {
		return json({ watches: await listWatches(db, row.id) })
	}

	if (path === "/watches" && method === "POST") {
		const input = watchCreateSchema.safeParse(await readJson(request))
		if (!input.success) return fail("invalid_request", input.error.issues[0]!.message)

		const limit = session.isPlus ? config.plusMaxWatches : FREE_MAX_WATCHES
		if ((await countWatches(db, row.id)) >= limit) {
			return fail("watch_limit", `Лимит отслеживаний: ${limit}.`)
		}

		await createWatch(db, {
			userId: row.id,
			origin: input.data.origin,
			destination: input.data.destination,
			departMonth: input.data.departMonth ?? null,
			targetPrice: input.data.targetPrice ?? null,
		})

		return json({ watches: await listWatches(db, row.id) })
	}

	if (path.startsWith("/watches/") && method === "DELETE") {
		const id = Number(path.slice("/watches/".length))
		if (!Number.isInteger(id)) return fail("invalid_request", "Неверный id.")

		await deleteWatch(db, row.id, id)
		return json({ watches: await listWatches(db, row.id) })
	}

	// ── Оплата ──────────────────────────────────────────────

	if (path === "/invoice" && method === "POST") {
		const input = invoiceRequestSchema.safeParse(await readJson(request))
		if (!input.success) return fail("invalid_request", input.error.issues[0]!.message)
		if (session.isPlus) return fail("forbidden", "Plus уже активен.")

		const payload = `plus:${row.id}:${Date.now().toString(36)}`

		// Строка заказа — до ссылки на оплату, иначе pre_checkout нечего проверять.
		await db.insert(schema.payments).values({
			userId: row.id,
			payload,
			stars: config.plusPriceStars,
			plan: "plus",
			durationDays: config.plusDurationDays,
			status: "pending",
		})

		const response = await fetch(
			`https://api.telegram.org/bot${env.BOT_TOKEN}/createInvoiceLink`,
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					title: `Voolo Plus — ${config.plusDurationDays} дней`,
					description: `Безлимитный поиск, календарь цен и до ${config.plusMaxWatches} отслеживаний с алертами.`,
					payload,
					currency: "XTR",
					prices: [{ label: "Voolo Plus", amount: config.plusPriceStars }],
				}),
			},
		)

		const result = (await response.json()) as { ok: boolean; result?: string }
		if (!result.ok || !result.result) {
			return fail("internal", "Не удалось создать ссылку на оплату.")
		}

		return json({ invoiceLink: result.result, stars: config.plusPriceStars })
	}

	return fail("not_found", "Метод не найден.")
}

async function readJson(request: Request): Promise<unknown> {
	try {
		return await request.json()
	} catch {
		return {}
	}
}
