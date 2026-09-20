import type { EditorView } from 'prosemirror-view'
import { h, place, selectionRect, onOutside } from './dom'
import { icons } from './icons'
import { commands, getMarkAttrs } from '../commands'
import { schema } from '../schema'

let current: { el: HTMLElement; off: () => void } | null = null

export function closeLinkEditor() {
  current?.off()
  current?.el.remove()
  current = null
}

/** Small popover: URL input + open/remove. Used by the bubble menu, toolbar and Mod-k. */
export function openLinkEditor(view: EditorView, root: HTMLElement) {
  closeLinkEditor()
  const existing = getMarkAttrs(view.state, schema.marks.link)
  const input = h('input', { type: 'url', class: 'pn-input', placeholder: 'Paste or type a link…', value: existing?.href ?? '', 'aria-label': 'Link URL' })
  const apply = () => {
    let href = input.value.trim()
    if (href && !/^[a-z][a-z0-9+.-]*:|^\/|^#/i.test(href)) href = `https://${href}`
    commands.link(href || null)(view.state, view.dispatch)
    closeLinkEditor()
    view.focus()
  }
  const el = h('div', { class: 'pn-menu pn-link-editor', role: 'dialog', 'aria-label': 'Edit link' },
    input,
    h('button', { type: 'button', class: 'pn-btn', title: 'Apply', 'aria-label': 'Apply link', onclick: apply, html: icons.check }),
    existing ? h('button', { type: 'button', class: 'pn-btn', title: 'Remove link', 'aria-label': 'Remove link', onclick: () => { commands.unlink(view.state, view.dispatch); closeLinkEditor(); view.focus() }, html: icons.unlink }) : null,
  )
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); apply() }
    if (e.key === 'Escape') { e.preventDefault(); closeLinkEditor(); view.focus() }
  })
  root.append(el)
  place(el, selectionRect(view), root)
  const off = onOutside(el, closeLinkEditor)
  current = { el, off }
  input.focus()
  input.select()
}

/** Hover card showing the href of the link under the cursor with edit/open/remove. */
export function linkHoverCard(view: EditorView, root: HTMLElement): { update(): void; destroy(): void } {
  let card: HTMLElement | null = null
  const hide = () => { card?.remove(); card = null }
  const update = () => {
    const attrs = view.state.selection.empty ? getMarkAttrs(view.state, schema.marks.link) : null
    if (!attrs || !view.hasFocus()) return hide()
    if (!card) { card = h('div', { class: 'pn-menu pn-link-card' }); root.append(card) }
    card.innerHTML = ''
    card.append(
      h('a', { href: attrs.href, target: '_blank', rel: 'noopener noreferrer', class: 'pn-link-href' }, String(attrs.href).replace(/^https?:\/\//, '').slice(0, 48)),
      h('button', { type: 'button', class: 'pn-btn', 'aria-label': 'Edit link', title: 'Edit', onmousedown: (e: Event) => e.preventDefault(), onclick: () => { hide(); openLinkEditor(view, root) }, html: icons.link }),
      h('button', { type: 'button', class: 'pn-btn', 'aria-label': 'Remove link', title: 'Remove', onmousedown: (e: Event) => e.preventDefault(), onclick: () => { commands.unlink(view.state, view.dispatch); hide() }, html: icons.unlink }),
    )
    place(card, selectionRect(view), root)
  }
  return { update, destroy: hide }
}
