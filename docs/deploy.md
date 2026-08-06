# Выкатка Voolo

Порядок шагов важен: вебхук регистрируется последним, иначе Telegram начнёт
биться в нерабочий адрес и копить очередь апдейтов.

## 0. Что нужно заранее

| Что | Где взять |
| --- | --- |
| `BOT_TOKEN` | @BotFather → `/newbot` |
| `TP_TOKEN`, `TP_MARKER` | кабинет Travelpayouts → API-токен и партнёрский marker |
| `TELEGRAM_WEBHOOK_SECRET` | придумать, не короче 16 символов |
| аккаунт Cloudflare | free-тарифа достаточно |

```bash
pnpm install
pnpm dlx wrangler login
```

## 1. База данных D1

```bash
pnpm dlx wrangler d1 create voolo-db
```

Команда вернёт `database_id`. Подставьте его в `apps/bot/wrangler.toml`
вместо `REPLACE_WITH_D1_ID` (и `REPLACE_WITH_PROD_D1_ID` для прода).

Миграции:

```bash
pnpm --filter @voolo/db generate
pnpm dlx wrangler d1 migrations apply voolo-db --local   # для разработки
pnpm dlx wrangler d1 migrations apply voolo-db --remote  # для прода
```

## 2. Секреты воркера

Секреты никогда не попадают в `wrangler.toml` — только через `secret put`:

```bash
cd apps/bot
pnpm dlx wrangler secret put BOT_TOKEN
pnpm dlx wrangler secret put TELEGRAM_WEBHOOK_SECRET
pnpm dlx wrangler secret put TP_TOKEN
```

Остальное (`TP_MARKER`, `MINIAPP_URL`, лимиты, цена Plus) — обычные `[vars]`
в `wrangler.toml`.

## 3. Воркер

```bash
pnpm --filter @voolo/bot deploy
```

После выкатки запомните адрес воркера — это и база API, и адрес вебхука.
Проверка живости: `GET /health` должен отдать 200.

## 4. Mini App на Pages

```bash
cd apps/miniapp
cp .env.example .env      # VITE_API_BASE = адрес воркера из шага 3
pnpm build
pnpm dlx wrangler pages deploy dist --project-name voolo-miniapp
```

Полученный адрес Pages пропишите в `MINIAPP_URL` воркера и выкатите его заново:
бот подставляет этот адрес в кнопку «Открыть Voolo».

## 5. Настройка бота в BotFather

1. `/setmenubutton` → выбрать бота → адрес Pages → название кнопки «Voolo».
2. `/newapp` — если нужна прямая ссылка вида `t.me/<bot>/app`.
3. `/setcommands` — список команд:

```
start - Начать
search - Найти билеты
watch - Следить за ценой
watches - Мои отслеживания
status - Мой тариф
help - Помощь
```

4. Загрузите логотип через `/setuserpic` и описание через `/setdescription`.

## 6. Вебхук — последним шагом

```bash
BOT_TOKEN=... \
TELEGRAM_WEBHOOK_SECRET=... \
WEBHOOK_URL=<адрес воркера> \
pnpm tsx scripts/set-webhook.ts
```

Скрипт сам печатает `getWebhookInfo`. Поле `pending_update_count` должно
стремиться к нулю, `last_error_message` — быть пустым.

Снять вебхук (например, перед локальной отладкой):

```bash
BOT_TOKEN=... pnpm tsx scripts/set-webhook.ts --delete
```

## 7. Локальная разработка

Два терминала:

```bash
pnpm --filter @voolo/bot dev        # wrangler dev на :8787
pnpm --filter @voolo/miniapp dev    # vite на :5173
```

Туннель для Telegram (вебхук требует HTTPS):

```bash
cloudflared tunnel --url http://localhost:8787
```

Полученный адрес подставьте в `WEBHOOK_URL` и перерегистрируйте вебхук.

## 8. Проверка после выкатки

- [ ] `/start` отвечает и показывает кнопку Mini App
- [ ] поиск в Mini App возвращает цены с отметкой свежести
- [ ] четвёртый поиск за сутки упирается в пейвол, а не в ошибку
- [ ] оплата Plus проходит, доступ выдаётся единожды при повторном апдейте
- [ ] `scripts/verify-rich-blocks.ts` прогнан и неподтверждённые блоки размечены
- [ ] крон отработал хотя бы раз и не упал по CPU
