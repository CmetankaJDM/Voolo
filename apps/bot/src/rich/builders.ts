/**
 * Короткие хелперы для сборки rich-блоков.
 *
 * Цель — чтобы шаблон сообщения читался как разметка, а не как гора JSON.
 * Ничего умного здесь нет: чистые функции без состояния и без сети.
 */

import type {
	InputRichBlock,
	InputRichBlockListItem,
	RichBlockTableCell,
	RichText,
} from "./types"

// ── Инлайн-форматирование ───────────────────────────────────────────

export const b = (text: RichText): RichText => ({ type: "bold", text })
export const i = (text: RichText): RichText => ({ type: "italic", text })
export const s = (text: RichText): RichText => ({ type: "strikethrough", text })
export const u = (text: RichText): RichText => ({ type: "underline", text })
export const code = (text: RichText): RichText => ({ type: "code", text })
export const spoiler = (text: RichText): RichText => ({ type: "spoiler", text })

/** Маркер — подсветка фоном. У нас это «лучшая цена». */
export const marked = (text: RichText): RichText => ({ type: "marked", text })

export const link = (text: RichText, url: string): RichText => ({
	type: "url",
	text,
	url,
})

// ── Блоки ──────────────────────────────────────────────────────────

export const p = (text: RichText): InputRichBlock => ({
	type: "paragraph",
	text,
})

/** Заголовок. В чате размер 3 смотрится лучше всего, он же дефолт. */
export const h = (
	text: RichText,
	size: 1 | 2 | 3 | 4 | 5 | 6 = 3,
): InputRichBlock => ({ type: "heading", text, size })

/** Мелкий текст внизу. Все дисклеймеры о свежести цены — сюда. */
export const footer = (text: RichText): InputRichBlock => ({
	type: "footer",
	text,
})

export const divider = (): InputRichBlock => ({ type: "divider" })

export const pre = (text: RichText, language?: string): InputRichBlock => ({
	type: "pre",
	text,
	...(language ? { language } : {}),
})

export const quote = (
	blocks: InputRichBlock[],
	credit?: RichText,
): InputRichBlock => ({
	type: "blockquote",
	blocks,
	...(credit ? { credit } : {}),
})

/** Сворачиваемый блок. Спасает выдачу от превращения в портянку. */
export const details = (
	summary: RichText,
	blocks: InputRichBlock[],
): InputRichBlock => ({ type: "details", summary, blocks })

/** Индикатор работы. Имеет смысл только внутри sendRichMessageDraft. */
export const thinking = (text: RichText): InputRichBlock => ({
	type: "thinking",
	text,
})

// ── Списки ────────────────────────────────────────────────────────

/** Обычный пункт списка. */
export const li = (text: RichText): InputRichBlockListItem => ({
	blocks: [p(text)],
})

/** Пункт с чекбоксом. */
export const check = (
	text: RichText,
	checked = false,
): InputRichBlockListItem => ({
	blocks: [p(text)],
	has_checkbox: true,
	...(checked ? { is_checked: true as const } : {}),
})

export const list = (items: InputRichBlockListItem[]): InputRichBlock => ({
	type: "list",
	items,
})

// ── Таблицы ──────────────────────────────────────────────────────

export type CellOptions = {
	align?: RichBlockTableCell["align"]
	valign?: RichBlockTableCell["valign"]
	colspan?: number
	rowspan?: number
}

/** Обычная ячейка. */
export const td = (
	text: RichText,
	opts: CellOptions = {},
): RichBlockTableCell => ({
	text,
	align: opts.align ?? "left",
	valign: opts.valign ?? "middle",
	...(opts.colspan ? { colspan: opts.colspan } : {}),
	...(opts.rowspan ? { rowspan: opts.rowspan } : {}),
})

/** Ячейка-заголовок. */
export const th = (
	text: RichText,
	opts: CellOptions = {},
): RichBlockTableCell => ({
	...td(text, opts),
	is_header: true,
})

/** Невидимая ячейка — нужна под растянутыми colspan / rowspan. */
export const tdEmpty = (): RichBlockTableCell => ({
	align: "left",
	valign: "middle",
})

export const table = (
	cells: RichBlockTableCell[][],
	opts: { bordered?: boolean; striped?: boolean; caption?: RichText } = {},
): InputRichBlock => ({
	type: "table",
	cells,
	...(opts.bordered ? { is_bordered: true as const } : {}),
	...(opts.striped ? { is_striped: true as const } : {}),
	...(opts.caption ? { caption: opts.caption } : {}),
})
