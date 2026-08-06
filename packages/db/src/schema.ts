/**
 * Схема D1 (SQLite). Drizzle ORM.
 *
 * Принципы:
 *  • Сессии живут здесь, а не в KV — у KV лимит ~1000 записей в сутки (ADR-002).
 *  • Дедуп апдейтов тоже здесь и по той же причине: одна запись на апдейт
 *    исчерпала бы суточный лимит KV на первой сотне активных пользователей.
 *    У D1 лимит 100 000 записей в сутки — на два порядка больше.
 *  • Временные метки — unix секунды integer. Сравнения без парсинга строк.
 *  • telegram_payment_charge_id — уникальный индекс. Это единственная защита
 *    от двойного начисления при повторной доставке апдейта (ADR-005).
 */

import { sql } from "drizzle-orm"
import {
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core"

const now = sql`(unixepoch())`

// ── Пользователи ────────────────────────────────────────────────────────────

export const users = sqliteTable(
	"users",
	{
		/** telegram user id. Он же первичный ключ — своих id не придумываем. */
		id: integer("id").primaryKey(),
		username: text("username"),
		firstName: text("first_name"),
		languageCode: text("language_code"),
		locale: text("locale", { enum: ["ru", "en"] }).notNull().default("ru"),
		currency: text("currency").notNull().default("RUB"),
		/** Город вылета по умолчанию, IATA. Спрашивается один раз. */
		homeIata: text("home_iata"),
		/** Откуда пришёл: deep-link payload из /start. */
		referralSource: text("referral_source"),
		isBlocked: integer("is_blocked", { mode: "boolean" }).notNull().default(false),
		createdAt: integer("created_at").notNull().default(now),
		lastSeenAt: integer("last_seen_at").notNull().default(now),
	},
	(table) => ({
		lastSeenIdx: index("users_last_seen_idx").on(table.lastSeenAt),
	}),
)

// ── Сессии ──────────────────────────────────────────────────────────────────
// Состояние диалога grammY. Одна строка на ключ сессии.

export const sessions = sqliteTable("sessions", {
	key: text("key").primaryKey(),
	value: text("value").notNull(),
	updatedAt: integer("updated_at").notNull().default(now),
})

// ── Дедуп апдейтов ──────────────────────────────────────────────────────────
// Telegram доставляет апдейт повторно, если не получил 200 вовремя. Без дедупа
// это означает двойной поиск, двойное списание квоты и, в худшем случае,
// двойное начисление доступа. Чистится кроном.

export const processedUpdates = sqliteTable(
	"processed_updates",
	{
		updateId: integer("update_id").primaryKey(),
		createdAt: integer("created_at").notNull().default(now),
	},
	(table) => ({
		createdIdx: index("processed_updates_created_idx").on(table.createdAt),
	}),
)

// ── Счётчик бесплатных поисков ──────────────────────────────────────────────
// Ключ — (user, дата в UTC). Старые строки чистит крон.

export const searchQuota = sqliteTable(
	"search_quota",
	{
		userId: integer("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		/** YYYY-MM-DD в UTC. */
		day: text("day").notNull(),
		count: integer("count").notNull().default(0),
	},
	(table) => ({
		userDayIdx: uniqueIndex("search_quota_user_day_idx").on(table.userId, table.day),
	}),
)

// ── Избранные маршруты ──────────────────────────────────────────────────────

export const favorites = sqliteTable(
	"favorites",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		userId: integer("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		origin: text("origin").notNull(),
		destination: text("destination").notNull(),
		createdAt: integer("created_at").notNull().default(now),
	},
	(table) => ({
		routeIdx: uniqueIndex("favorites_user_route_idx").on(
			table.userId,
			table.origin,
			table.destination,
		),
	}),
)

// ── Отслеживание цены ───────────────────────────────────────────────────────
// Крон раз в сутки перебирает активные строки и шлёт алерт при падении.

export const watches = sqliteTable(
	"watches",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		userId: integer("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		origin: text("origin").notNull(),
		destination: text("destination").notNull(),
		/** YYYY-MM или null — «любые даты». */
		departMonth: text("depart_month"),
		/** Порог в валюте пользователя. null — алерт на любое падение. */
		targetPrice: integer("target_price"),
		/** Цена на момент последней проверки — база для сравнения. */
		lastPrice: integer("last_price"),
		lastCheckedAt: integer("last_checked_at"),
		/** Защита от спама: не чаще одного алерта в сутки на маршрут. */
		lastNotifiedAt: integer("last_notified_at"),
		isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
		createdAt: integer("created_at").notNull().default(now),
	},
	(table) => ({
		userIdx: index("watches_user_idx").on(table.userId),
		activeIdx: index("watches_active_idx").on(table.isActive, table.lastCheckedAt),
		routeIdx: uniqueIndex("watches_user_route_idx").on(
			table.userId,
			table.origin,
			table.destination,
			table.departMonth,
		),
	}),
)

// ── Платный доступ ──────────────────────────────────────────────────────────
// Отдельно от платежей: доступ можно выдать руками (поддержка, компенсация),
// и тогда платежа за ним нет.

export const entitlements = sqliteTable(
	"entitlements",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		userId: integer("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		plan: text("plan", { enum: ["plus"] }).notNull().default("plus"),
		startsAt: integer("starts_at").notNull().default(now),
		expiresAt: integer("expires_at").notNull(),
		/** payment — куплено; grant — выдано вручную; refund — аннулировано. */
		source: text("source", { enum: ["payment", "grant", "refund"] })
			.notNull()
			.default("payment"),
		createdAt: integer("created_at").notNull().default(now),
	},
	(table) => ({
		userIdx: index("entitlements_user_idx").on(table.userId, table.expiresAt),
	}),
)

// ── Платежи Telegram Stars ──────────────────────────────────────────────────
// Строка создаётся ДО выставления инвойса в статусе pending, иначе на
// pre_checkout проверять нечего, а времени там десять секунд.

export const payments = sqliteTable(
	"payments",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		userId: integer("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		/** Наш payload из инвойса, до 128 байт. Уникален. */
		payload: text("payload").notNull(),
		stars: integer("stars").notNull(),
		plan: text("plan", { enum: ["plus"] }).notNull().default("plus"),
		durationDays: integer("duration_days").notNull(),
		status: text("status", {
			enum: ["pending", "paid", "refunded", "failed"],
		})
			.notNull()
			.default("pending"),
		/** Приходит только в successful_payment. Уникален — защита от двойного начисления. */
		telegramPaymentChargeId: text("telegram_payment_charge_id"),
		createdAt: integer("created_at").notNull().default(now),
		paidAt: integer("paid_at"),
		refundedAt: integer("refunded_at"),
	},
	(table) => ({
		payloadIdx: uniqueIndex("payments_payload_idx").on(table.payload),
		chargeIdx: uniqueIndex("payments_charge_idx").on(table.telegramPaymentChargeId),
		userIdx: index("payments_user_idx").on(table.userId, table.createdAt),
	}),
)

export type User = typeof users.$inferSelect
export type Favorite = typeof favorites.$inferSelect
export type Watch = typeof watches.$inferSelect
export type Entitlement = typeof entitlements.$inferSelect
export type Payment = typeof payments.$inferSelect
