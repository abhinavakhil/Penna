import { Plugin, PluginKey } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'
import { h, place } from './dom'

export interface SuggestItem { title: string; description?: string; icon?: string }

export interface SuggestOptions<T> {
  /** Trigger text typed at a word start, e.g. '@' or '{{'. */
  char: string
  /** Heading shown above the list. */
  heading?: string
  items: (query: string) => T[] | Promise<T[]>
  render: (item: T) => SuggestItem
  /** Replace `from..to` (the trigger + query) with whatever the item inserts. */
  select: (view: EditorView, item: T, range: { from: number; to: number }) => void
}

type State = { open: boolean; from: number; query: string }

/** Generic "type a trigger, pick from a list" popup. Used by mentions and merge fields. */
export function suggestPlugin<T>(root: () => HTMLElement, opts: SuggestOptions<T>): Plugin<State> {
  const key = new PluginKey<State>(`pn-suggest-${opts.char}`)
  let menu: HTMLElement | null = null
  let list: T[] = []
  let selected = 0
  let token = 0
  let lastQuery: string | null = null

  const close = (view: EditorView) => { if (key.getState(view.state)?.open) view.dispatch(view.state.tr.setMeta(key, { open: false })) }
  const pick = (view: EditorView, item: T) => {
    const s = key.getState(view.state)!
    const range = { from: s.from, to: view.state.selection.from }
    view.dispatch(view.state.tr.setMeta(key, { open: false }))
    opts.select(view, item, range)
    view.focus()
  }
  const draw = (view: EditorView) => {
    if (!menu) return
    menu.innerHTML = ''
    if (opts.heading) menu.append(h('div', { class: 'pn-menu-group' }, opts.heading))
    if (!list.length) menu.append(h('div', { class: 'pn-menu-empty' }, 'No matches'))
    list.forEach((it, i) => {
      const r = opts.render(it)
      menu!.append(h('button', {
        type: 'button', class: 'pn-menu-item' + (i === selected ? ' pn-selected' : ''), role: 'option', 'aria-selected': String(i === selected),
        onmousedown: (e: Event) => e.preventDefault(), onclick: () => pick(view, it),
      }, r.icon ? h('span', { class: 'pn-menu-icon', html: r.icon }) : null, h('span', { class: 'pn-menu-text' }, h('span', { class: 'pn-menu-title' }, r.title), r.description ? h('span', { class: 'pn-menu-desc' }, r.description) : null)))
    })
    const s = key.getState(view.state)!
    const c = view.coordsAtPos(s.from)
    place(menu, new DOMRect(c.left, c.top, 0, c.bottom - c.top), root())
  }
  const refresh = async (view: EditorView) => {
    const s = key.getState(view.state)!
    if (!s.open) { menu?.remove(); menu = null; lastQuery = null; return }
    if (!menu) { menu = h('div', { class: 'pn-menu pn-slash pn-suggest', role: 'listbox' }); root().append(menu); selected = 0 }
    if (s.query === lastQuery) return
    lastQuery = s.query
    const mine = ++token
    const items = await opts.items(s.query)
    if (mine !== token || !menu) return
    list = items
    selected = Math.min(selected, Math.max(0, list.length - 1))
    draw(view)
  }

  return new Plugin<State>({
    key,
    state: {
      init: () => ({ open: false, from: 0, query: '' }),
      apply(tr, prev) {
        const meta = tr.getMeta(key)
        const cur = meta ? { ...prev, ...meta } : prev
        const { $from, empty } = tr.selection
        if (!empty || !$from.parent.isTextblock || $from.parent.type.spec.code) return cur.open ? { ...cur, open: false } : cur
        const text = $from.parent.textBetween(0, $from.parentOffset, undefined, '￼')
        if (!cur.open) {
          if (meta?.open === false || !tr.docChanged || !text.endsWith(opts.char)) return cur
          const before = text[text.length - opts.char.length - 1]
          if (before && !/\s/.test(before)) return cur
          return { open: true, from: $from.pos - opts.char.length, query: '' }
        }
        const start = cur.from - $from.start()
        const q = text.slice(start + opts.char.length)
        if (start < 0 || text.slice(start, start + opts.char.length) !== opts.char || /\s\s|\n/.test(q) || q.length > 40) return { ...cur, open: false }
        return { ...cur, query: q }
      },
    },
    props: {
      handleKeyDown(view, e) {
        if (!key.getState(view.state)?.open || !menu) return false
        if (e.key === 'ArrowDown') { selected = (selected + 1) % Math.max(1, list.length); draw(view); return true }
        if (e.key === 'ArrowUp') { selected = (selected - 1 + list.length) % Math.max(1, list.length); draw(view); return true }
        if (e.key === 'Enter' || e.key === 'Tab') { if (list[selected]) { pick(view, list[selected]); return true } close(view); return false }
        if (e.key === 'Escape') { close(view); return true }
        return false
      },
    },
    view: () => ({ update: (v) => void refresh(v), destroy: () => { menu?.remove(); menu = null } }),
  })
}
