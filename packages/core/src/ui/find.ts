import type { EditorView } from 'prosemirror-view'
import { h } from './dom'
import { icons } from './icons'
import { find } from '../plugins'

const bars = new WeakMap<HTMLElement, HTMLElement>()

export function toggleFindBar(view: EditorView, root: HTMLElement) {
  const existing = bars.get(root)
  if (existing) { closeFindBar(view, root); return }
  const q = h('input', { type: 'search', class: 'pn-input', placeholder: 'Find', 'aria-label': 'Find' })
  const r = h('input', { type: 'text', class: 'pn-input', placeholder: 'Replace', 'aria-label': 'Replace with' })
  const count = h('span', { class: 'pn-find-count', 'aria-live': 'polite' })
  const cs = h('input', { type: 'checkbox', 'aria-label': 'Match case' })
  const refresh = () => {
    find.set(view, { query: q.value, caseSensitive: cs.checked })
    const s = find.state(view.state)
    count.textContent = q.value ? (s.matches.length ? `${s.active + 1}/${s.matches.length}` : '0/0') : ''
  }
  q.addEventListener('input', refresh)
  cs.addEventListener('change', refresh)
  q.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); find.next(view, e.shiftKey ? -1 : 1); refreshCount() }
    if (e.key === 'Escape') closeFindBar(view, root)
  })
  r.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); find.replace(view, r.value); refresh() }
    if (e.key === 'Escape') closeFindBar(view, root)
  })
  const refreshCount = () => { const s = find.state(view.state); count.textContent = s.matches.length ? `${s.active + 1}/${s.matches.length}` : '0/0' }
  const bar = h('div', { class: 'pn-findbar', role: 'search' },
    q, count,
    h('button', { type: 'button', class: 'pn-btn', 'aria-label': 'Previous match', title: 'Previous (Shift+Enter)', html: '↑', onclick: () => { find.next(view, -1); refreshCount() } }),
    h('button', { type: 'button', class: 'pn-btn', 'aria-label': 'Next match', title: 'Next (Enter)', html: '↓', onclick: () => { find.next(view, 1); refreshCount() } }),
    h('label', { class: 'pn-find-case', title: 'Match case' }, cs, 'Aa'),
    r,
    h('button', { type: 'button', class: 'pn-btn pn-btn-text', onclick: () => { find.replace(view, r.value); refresh() } }, 'Replace'),
    h('button', { type: 'button', class: 'pn-btn pn-btn-text', onclick: () => { find.replaceAll(view, r.value); refresh() } }, 'All'),
    h('button', { type: 'button', class: 'pn-btn', 'aria-label': 'Close', title: 'Close (Esc)', html: icons.x, onclick: () => closeFindBar(view, root) }),
  )
  root.prepend(bar)
  bars.set(root, bar)
  const sel = view.state.doc.textBetween(view.state.selection.from, view.state.selection.to)
  if (sel && !sel.includes('\n')) q.value = sel
  refresh()
  q.focus()
  q.select()
}

export function closeFindBar(view: EditorView, root: HTMLElement) {
  bars.get(root)?.remove()
  bars.delete(root)
  find.set(view, { query: '' })
  view.focus()
}
