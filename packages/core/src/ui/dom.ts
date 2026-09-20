import type { EditorView } from 'prosemirror-view'
import { icons, type IconName } from './icons'

type Child = Node | string | null | undefined | false
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, unknown> = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener)
    else if (k === 'html') el.innerHTML = String(v)
    else if (k === 'class') el.className = String(v)
    else el.setAttribute(k, v === true ? '' : String(v))
  }
  for (const c of children) if (c) el.append(c)
  return el
}

export function iconButton(opts: { icon: IconName; label: string; onClick: (e: MouseEvent) => void; shortcut?: string; text?: string; active?: boolean }): HTMLButtonElement {
  const b = h('button', {
    type: 'button', class: 'pn-btn', 'aria-label': opts.label, title: opts.shortcut ? `${opts.label} (${opts.shortcut})` : opts.label, 'aria-pressed': opts.active ? 'true' : undefined,
    onmousedown: (e: Event) => e.preventDefault(), // keep editor selection
    onclick: opts.onClick,
  })
  b.innerHTML = icons[opts.icon] + (opts.text ? `<span>${opts.text}</span>` : '')
  return b
}

/** Position `el` (absolute, inside `root`) next to a viewport rect. Flips above if no room below. */
export function place(el: HTMLElement, rect: DOMRect, root: HTMLElement, placement: 'below' | 'above' | 'left' = 'below', gap = 8) {
  const rootRect = root.getBoundingClientRect()
  el.style.visibility = 'hidden'
  el.style.display = ''
  const w = el.offsetWidth, hgt = el.offsetHeight
  let top: number, left: number
  if (placement === 'left') {
    top = rect.top - rootRect.top + root.scrollTop
    left = rect.left - rootRect.left - w - gap
  } else {
    const spaceBelow = window.innerHeight - rect.bottom
    const above = placement === 'above' ? rect.top - rootRect.top - hgt - gap >= 0 : spaceBelow < hgt + gap
    top = (above ? rect.top - hgt - gap : rect.bottom + gap) - rootRect.top + root.scrollTop
    left = rect.left + rect.width / 2 - w / 2 - rootRect.left
  }
  left = Math.max(4, Math.min(left, root.clientWidth - w - 4))
  el.style.top = `${top}px`
  el.style.left = `${left}px`
  el.style.visibility = ''
}

export function selectionRect(view: EditorView): DOMRect {
  const { from, to } = view.state.selection
  const a = view.coordsAtPos(from), b = view.coordsAtPos(to, -1)
  const top = Math.min(a.top, b.top), bottom = Math.max(a.bottom, b.bottom)
  const left = Math.min(a.left, b.left), right = Math.max(a.right, b.right)
  // multi-line selections: anchor to the line of `to`
  if (b.top > a.bottom) return new DOMRect(b.left, b.top, 0, b.bottom - b.top)
  return new DOMRect(left, top, right - left, bottom - top)
}

export function onOutside(el: HTMLElement, cb: () => void): () => void {
  const handler = (e: Event) => { if (!el.contains(e.target as Node)) cb() }
  setTimeout(() => document.addEventListener('mousedown', handler), 0)
  return () => document.removeEventListener('mousedown', handler)
}

/** Simple fuzzy match: all query chars appear in order. Returns a score (lower = better) or -1. */
export function fuzzy(query: string, text: string): number {
  const q = query.toLowerCase(), t = text.toLowerCase()
  if (!q) return 0
  if (t.startsWith(q)) return 0
  if (t.includes(q)) return 1
  let qi = 0, score = 2
  for (let i = 0; i < t.length && qi < q.length; i++) if (t[i] === q[qi]) qi++; else score++
  return qi === q.length ? score : -1
}

export const prompt = async (message: string, defaultValue = ''): Promise<string | null> => window.prompt(message, defaultValue)
