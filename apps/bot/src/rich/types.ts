/**
 * Telegram Bot API 10.2 — Rich Messages.
 *
 * grammY на момент написания не типизирует эти методы (10.1 и 10.2 вышли
 * в июне и июле 2026), поэтому держим собственные типы. См. ADR-004.
 *
 * Каждый блок помечен:
 *   VERIFIED   — сверено с core.telegram.org/bots/api, можно пользоваться.
 *   UNVERIFIED — имена полей выведены по аналогии. Перед использованием
 *                проверить живым запросом к API.
 *
 * Лимит сообщения: 32768 UTF-8 символов, включая alt-текст custom emoji.
 */

/** Максимальная длина rich-сообщения в UTF-8 символах. VERIFIED. */
export const RICH_MESSAGE_MAX_LENGTH = 32768

export type TelegramUser = {
	id: number
	is_bot: boolean
	first_name: string
	last_name?: string
	username?: string
}

// ── RichText ──────────────────────────────────────────────────────────

/**
 * Рекурсивный текст: строка, массив фрагментов или узел форматирования.
 * Считать UTF-16 оффсеты больше не нужно — главный выигрыш перед старым
 * MessageEntity[].
 * VERIFIED.
 */
export type RichText = string | RichText[] | RichTextNode

/** VERIFIED. */
export type RichTextNode =
	| { type: "bold"; text: RichText }
	| { type: "italic"; text: RichText }
	| { type: "underline"; text: RichText }
	| { type: "strikethrough"; text: RichText }
	| { type: "spoiler"; text: RichText }
	| { type: "marked"; text: RichText }
	| { type: "code"; text: RichText }
	| { type: "subscript"; text: RichText }
	| { type: "superscript"; text: RichText }
	| { type: "date_time"; text: RichText }
	| { type: "mathematical_expression"; expression: string }
	| { type: "url"; text: RichText; url: string }
	| { type: "email_address"; text: RichText; email_address: string }
	| { type: "phone_number"; text: RichText; phone_number: string }
	| { type: "bank_card_number"; text: RichText; bank_card_number: string }
	| { type: "mention"; text: RichText; username: string }
	| { type: "text_mention"; text: RichText; user: TelegramUser }
	| { type: "hashtag"; text: RichText; hashtag: string }
	| { type: "cashtag"; text: RichText; cashtag: string }
	| { type: "bot_command"; text: RichText; bot_command: string }
	| { type: "anchor"; name: string }
	| { type: "anchor_link"; text: RichText; anchor_name: string }
	| { type: "reference"; text: RichText; name: string }
	| { type: "reference_link"; text: RichText; reference_name: string }
	// UNVERIFIED: точное имя поля идентификатора не подтверждено.
	| { type: "custom_emoji"; text: RichText; custom_emoji_id: string }

// ── Вспомогательные структуры ────────────────────────────────────────

/**
 * Ячейка таблицы. VERIFIED.
 * Если text опущен — ячейка невидимая (нужно под colspan / rowspan).
 */
export type RichBlockTableCell = {
	text?: RichText
	is_header?: true
	colspan?: number
	rowspan?: number
	align: "left" | "center" | "right"
	valign: "top" | "middle" | "bottom"
}

/**
 * Подпись медиа-блока. VERIFIED.
 * Внимание: у таблицы caption — это просто RichText, а не RichBlockCaption.
 */
export type RichBlockCaption = {
	text: RichText
	credit?: RichText
}

/**
 * Элемент списка. VERIFIED.
 * У Input-версии НЕТ поля label — нумерацию рисует клиент.
 */
export type InputRichBlockListItem = {
	blocks: InputRichBlock[]
	has_checkbox?: true
	is_checked?: true
}

// ── Блоки ──────────────────────────────────────────────────────────

export type InputRichBlock =
	/** VERIFIED. */
	| { type: "paragraph"; text: RichText }
	/** VERIFIED. size: 1 — самый крупный, 6 — самый мелкий. */
	| { type: "heading"; text: RichText; size: 1 | 2 | 3 | 4 | 5 | 6 }
	/** VERIFIED. Моноширинный блок. */
	| { type: "pre"; text: RichText; language?: string }
	/** VERIFIED. Мелкий текст внизу — идеален для дисклеймера о кэше. */
	| { type: "footer"; text: RichText }
	/** VERIFIED. */
	| { type: "divider" }
	/** VERIFIED. Невидимая метка для прыжков внутри сообщения. */
	| { type: "anchor"; name: string }
	/** VERIFIED. У Input-версии нет is_ordered — вид списка решает клиент. */
	| { type: "list"; items: InputRichBlockListItem[] }
	/** VERIFIED. */
	| { type: "blockquote"; blocks: InputRichBlock[]; credit?: RichText }
	/** VERIFIED. Крупная врезка. */
	| { type: "pullquote"; text: RichText; credit?: RichText }
	/**
	 * VERIFIED. Главный блок для Voolo: выдача билетов таблична по природе.
	 * cells — массив строк, каждая строка — массив ячеек.
	 */
	| {
			type: "table"
			cells: RichBlockTableCell[][]
			is_bordered?: true
			is_striped?: true
			caption?: RichText
	  }
	/** VERIFIED. Сворачиваемый блок — под него прячем «все варианты». */
	| { type: "details"; summary: RichText; blocks: InputRichBlock[] }
	/** VERIFIED. Карусель — фото направления. */
	| { type: "collage"; blocks: InputRichBlock[]; caption?: RichBlockCaption }
	/** VERIFIED. */
	| { type: "slideshow"; blocks: InputRichBlock[]; caption?: RichBlockCaption }
	/** VERIFIED. caption внутри медиа-объекта игнорируется. */
	| { type: "audio"; audio: Record<string, unknown>; caption?: RichBlockCaption }
	/** VERIFIED. */
	| { type: "video"; video: Record<string, unknown>; caption?: RichBlockCaption }
	// UNVERIFIED: имя поля выведено по аналогии с audio / video.
	| { type: "photo"; photo: Record<string, unknown>; caption?: RichBlockCaption }
	/**
	 * VERIFIED. Индикатор работы. Осмыслен только с sendRichMessageDraft.
	 * Рекомендованный пак эмодзи: https://t.me/addemoji/AIActions
	 */
	| { type: "thinking"; text: RichText }

/**
 * Тело сообщения. VERIFIED.
 * Ровно ОДНО из трёх полей: blocks | html | markdown.
 * Поле media допустимо только в режимах html и markdown.
 */
export type InputRichMessage =
	| { blocks: InputRichBlock[]; is_rtl?: boolean }
	| { html: string; media?: Record<string, unknown>[]; is_rtl?: boolean }
	| { markdown: string; media?: Record<string, unknown>[]; is_rtl?: boolean }

export type SendRichMessageParams = {
	chat_id: number | string
	rich_message: InputRichMessage
	message_thread_id?: number
	/** Обязателен в чатах direct messages. */
	direct_messages_topic_id?: number
	disable_notification?: boolean
	protect_content?: boolean
	reply_markup?: Record<string, unknown>
	reply_parameters?: Record<string, unknown>
}
