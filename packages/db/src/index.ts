/**
 * Клиент D1 и прикладные хелперы.
 *
 * Всё, что трогает базу, живёт здесь. Хендлеры бота не пишут SQL.
 */

import { and, eq, gt, lt, sql } from "drizzle-orm"
import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1"

import * as schema from "./schema"

export * from "./schema"
export { schema }

export type Db = DrizzleD1Database<typeof schema>

export function createDb(d1: D1Database): Db {
	return drizzle(d1, { schema })
}

const nowSeconds = () => Math.floor(Date.now() / 1000)

// ── Дедуп апдейтов ───────────────────────────────────────────────────

/**
 * Забрать апдейт себе. true — обрабатываем первый раз, false — дубль.
 *
 * INSERT ... ON CONFLICT DO NOTHING атомарен, поэтому два одновременных
 * вызова не могут оба получить true. Проверка через SELECT была бы гонкой.
 */
export async function claimUpdate(db: Db, updateId: number): Promise<boolean> {
	const inserted = await db
		.insert(schema.processedUpdates)
		.values({ updateId })
		.onConflictDoNothing()
		.returning({ updateId: schema.processedUpdates.updateId })

	return inserted.length > 0
}

// ── Пользователи ────────────────────────────────────────────────────

/**
 * Завести или обновить пользователя. Вызывается на каждом апдейте.
 * language_code из Telegram влияет на локаль только при первом заходе —
 * дальше решает выбор пользователя.
 */
export async function upsertUser(
	db: Db,
	input: {
		id: number
		username?: string
		firstName?: string
		languageCode?: string
		referralSource?: string
	},
): Promise<schema.User> {
	const locale = input.languageCode?.startsWith("ru") ? "ru" : "en"

	await db
		.insert(schema.users)
		.values({
			id: input.id,
			username: input.username ?? null,
			firstName: input.firstName ?? null,
			languageCode: input.languageCode ?? null,
			locale,
			referralSource: input.referralSource ?? null,
		})
		.onConflictDoUpdate({
			target: schema.users.id,
			set: {
				username: input.username ?? null,
				firstName: input.firstName ?? null,
				lastSeenAt: nowSeconds(),
			},
		})

	const [user] = await db
		.select()
		.from(schema.users)
		.where(eq(schema.users.id, input.id))
		.limit(1)

	return user!
}

export async function setUserLocale(
	db: Db,
	userId: number,
	locale: "ru" | "en",
): Promise<void> {
	await db.update(schema.users).set({ locale }).where(eq(schema.users.id, userId))
}

export async function setHomeIata(
	db: Db,
	userId: number,
	homeIata: string,
): Promise<void> {
	await db.update(schema.users).set({ homeIata }).where(eq(schema.users.id, userId))
}

// ── Сессии ──────────────────────────────────────────────────────────

/**
 * StorageAdapter для grammY поверх D1.
 *
 * Почему не KV: у бесплатного KV около тысячи записей в сутки. Сессия
 * пишется на каждом шаге диалога — сотня активных пользователей съедает лимит
 * за час. У D1 лимит считается по строкам и на порядки больше.
 */
export function createD1SessionStorage(db: Db) {
	return {
		async read(key: string): Promise<unknown | undefined> {
			const [row] = await db
				.select({ value: schema.sessions.value })
				.from(schema.sessions)
				.where(eq(schema.sessions.key, key))
				.limit(1)

			if (!row) return undefined

			try {
				return JSON.parse(row.value)
			} catch {
				// Битая сессия лучше упавшего бота: начинаем с чистого листа.
				return undefined
			}
		},

		async write(key: string, value: unknown): Promise<void> {
			const serialized = JSON.stringify(value)
			await db
				.insert(schema.sessions)
				.values({ key, value: serialized })
				.onConflictDoUpdate({
					target: schema.sessions.key,
					set: { value: serialized, updatedAt: nowSeconds() },
				})
		},

		async delete(key: string): Promise<void> {
			await db.delete(schema.sessions).where(eq(schema.sessions.key, key))
		},
	}
}

// ── Доступ и квоты ──────────────────────────────────────────────────

/** Есть ли активный Plus прямо сейчас. */
export async function isPremium(db: Db, userId: number): Promise<boolean> {
	const [row] = await db
		.select({ id: schema.entitlements.id })
		.from(schema.entitlements)
		.where(
			and(
				eq(schema.entitlements.userId, userId),
				gt(schema.entitlements.expiresAt, nowSeconds()),
			),
		)
		.limit(1)

	return Boolean(row)
}

/** Выдать доступ. Если активный уже есть — продлеваем от его конца, а не от сейчас. */
export async function grantAccess(
	db: Db,
	userId: number,
	days: number,
	source: "payment" | "grant" = "payment",
): Promise<number> {
	const current = nowSeconds()

	const [active] = await db
		.select({ expiresAt: schema.entitlements.expiresAt })
		.from(schema.entitlements)
		.where(
			and(
				eq(schema.entitlements.userId, userId),
				gt(schema.entitlements.expiresAt, current),
			),
		)
		.orderBy(sql`${schema.entitlements.expiresAt} desc`)
		.limit(1)

	const startsAt = active?.expiresAt ?? current
	const expiresAt = startsAt + days * 86_400

	await db.insert(schema.entitlements).values({
		userId,
		plan: "plus",
		startsAt,
		expiresAt,
		source,
	})

	return expiresAt
}

/**
 * Списать один бесплатный поиск. Возвращает состояние квоты ПОСЛЕ списания.
 * Премиум проверяется вызывающим кодом до вызова — здесь только счёт.
 */
export async function consumeSearchQuota(
	db: Db,
	userId: number,
	limit: number,
): Promise<{ used: number; limit: number; allowed: boolean }> {
	const day = new Date().toISOString().slice(0, 10)

	await db
		.insert(schema.searchQuota)
		.values({ userId, day, count: 1 })
		.onConflictDoUpdate({
			target: [schema.searchQuota.userId, schema.searchQuota.day],
			set: { count: sql`${schema.searchQuota.count} + 1` },
		})

	const [row] = await db
		.select({ count: schema.searchQuota.count })
		.from(schema.searchQuota)
		.where(
			and(eq(schema.searchQuota.userId, userId), eq(schema.searchQuota.day, day)),
		)
		.limit(1)

	const used = row?.count ?? 1
	return { used, limit, allowed: used <= limit }
}

/** Чистка хвостов. Зовётся из крона. */
export async function pruneStaleRows(db: Db): Promise<void> {
	const cutoffDay = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10)
	await db.delete(schema.searchQuota).where(lt(schema.searchQuota.day, cutoffDay))

	const cutoffSession = nowSeconds() - 30 * 86_400
	await db.delete(schema.sessions).where(lt(schema.sessions.updatedAt, cutoffSession))

	// Двух суток хватает: Telegram перестаёт ретраить гораздо раньше.
	const cutoffUpdates = nowSeconds() - 2 * 86_400
	await db
		.delete(schema.processedUpdates)
		.where(lt(schema.processedUpdates.createdAt, cutoffUpdates))
}
