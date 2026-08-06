import type { Bot } from "grammy"

import type { VooloContext } from "../bot"
import { registerPayments } from "./payments"
import { registerSearch } from "./search"
import { registerStart } from "./start"
import { registerWatches } from "./watches"

/**
 * Порядок важен. Поиск регистрируется последним, потому что он ловит любой
 * текст — если поставить его выше, команды до своих хендлеров не дойдут.
 */
export function registerHandlers(bot: Bot<VooloContext>): void {
	registerStart(bot)
	registerPayments(bot)
	registerWatches(bot)
	registerSearch(bot)
}
