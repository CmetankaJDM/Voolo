# Voolo ✈️

Telegram-бот и Mini App для поиска дешёвых авиабилетов и подбора направления отдыха.

Вся основная работа происходит в Mini App, бот отвечает в чате форматированными
Rich Messages (Bot API 10.2) и присылает алерты о падении цены.

> **Статус:** 🚧 фаза 2 из 8 — каркас и слой Rich Messages.
> Продукт ещё не запущен.

---

## Стек

| Слой | Технология | Тариф |
| --- | --- | --- |
| Бот | TypeScript + grammY, режим вебхука | — |
| Рантайм | Cloudflare Workers | free |
| БД | Cloudflare D1 + Drizzle ORM | free |
| Кэш и дедуп апдейтов | Cloudflare KV | free |
| Mini App | React + Vite + TypeScript | — |
| Хостинг Mini App | Cloudflare Pages | free |
| Фоновые задачи | Cron Triggers | free |
| Данные о рейсах | Travelpayouts Aviasales **Data API** | free |
| Оплата | Telegram Stars (XTR) | — |

Всё, что нужно для работы, укладывается в бесплатные тарифы. Обоснование выбора
и цена этого решения — в [`DECISIONS.md`](./DECISIONS.md).

---

## Структура

```
voolo/
├── apps/
│   ├── bot/              Worker: вебхук, команды, платежи
│   │   └── src/rich/     слой Rich Messages (Bot API 10.2)
│   └── miniapp/          React + Vite, деплой на Pages
├── packages/
│   ├── shared/           типы, контракты, брендбук, zod-схемы
│   └── db/               схема Drizzle и миграции D1
├── docs/
│   └── rich-messages.md  справочник по блокам Rich Messages
└── DECISIONS.md          архитектурные решения (ADR)
```

Граница между `apps/bot` и `apps/miniapp` проходит по `packages/shared`:
обе стороны говорят одними и теми же типами, дублирования контрактов нет.

---

## Быстрый старт

```bash
pnpm install
cp .env.example .env      # заполнить BOT_TOKEN и TP_TOKEN
pnpm dev
```

Telegram умеет доставлять апдейты только на публичный HTTPS-адрес, поэтому
локально нужен туннель:

```bash
cloudflared tunnel --url http://localhost:8787
```

Полученный адрес прописывается в `setWebhook` вместе с `secret_token`.

---

## Что важно знать до чтения кода

**Цены не в реальном времени.** Мы работаем на кэшированном Data API:
данным от 2 до 7 дней. Это не баг и не временная заглушка — real-time поиск
Aviasales открывается только с 50 000 MAU. Поэтому в интерфейсе рядом с каждой
ценой обязателен возраст данных, а покупка уходит на Aviasales по партнёрской
ссылке. Подробно — ADR-001.

**Тема Mini App фирменная, а не системная.** Мы намеренно не берём палитру из
`themeParams` Telegram. Подробно — ADR-006.

---

## Документация

- [`DECISIONS.md`](./DECISIONS.md) — почему сделано именно так
- [`docs/rich-messages.md`](./docs/rich-messages.md) — блоки Rich Messages
