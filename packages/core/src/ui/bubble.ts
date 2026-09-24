import { Plugin, NodeSelection, type EditorState } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'
import { h, iconButton, place, selectionRect, onOutside } from './dom'
import { icons, type IconName } from './icons'
import { commands, isMarkActive, isBlockActive, isInList } from '../commands'
import { schema } from '../schema'
import { openLinkEditor } from './link'
import { modKey } from '../keymap'
import { lift } from 'prosemirror-commands'

export interface MenuItem {
  id: string
  icon: IconName
  label: string
  /** Visible text next to the icon (e.g. the current block type). */
  text?: (state: EditorState) => string
  shortcut?: string
  isActive?: (state: EditorState) => boolean
  run: (view: EditorView, root: HTMLElement) => void
  /** 'inline' items only show for text selections; 'block' for node selections */
  scope?: 'inline' | 'block' | 'both'
}

const { marks: m, nodes: n } = schema
const M = modKey

/** Block types offered by the bubble's "Turn into" menu. */
export const turnIntoItems: { id: string; label: string; icon: IconName; isActive: (s: EditorState) => boolean; run: (v: EditorView) => void }[] = [
  { id: 'paragraph', label: 'Text', icon: 'text', isActive: (s) => isBlockActive(s, n.paragraph) && ![n.bullet_list, n.ordered_list, n.task_list, n.blockquote, n.callout].some((t) => isInList(s, t)), run: (v) => toText(v) },
  { id: 'h1', label: 'Heading 1', icon: 'h1', isActive: (s) => isBlockActive(s, n.heading, { level: 1 }), run: (v) => commands.heading(1)(v.state, v.dispatch) },
  { id: 'h2', label: 'Heading 2', icon: 'h2', isActive: (s) => isBlockActive(s, n.heading, { level: 2 }), run: (v) => commands.heading(2)(v.state, v.dispatch) },
  { id: 'h3', label: 'Heading 3', icon: 'h3', isActive: (s) => isBlockActive(s, n.heading, { level: 3 }), run: (v) => commands.heading(3)(v.state, v.dispatch) },
  { id: 'bullet', label: 'Bullet list', icon: 'bulletList', isActive: (s) => isInList(s, n.bullet_list), run: (v) => commands.bulletList(v.state, v.dispatch) },
  { id: 'ordered', label: 'Numbered list', icon: 'orderedList', isActive: (s) => isInList(s, n.ordered_list), run: (v) => commands.orderedList(v.state, v.dispatch) },
  { id: 'task', label: 'To-do list', icon: 'taskList', isActive: (s) => isInList(s, n.task_list), run: (v) => commands.taskList(v.state, v.dispatch) },
  { id: 'quote', label: 'Quote', icon: 'quote', isActive: (s) => isInList(s, n.blockquote), run: (v) => commands.blockquote(v.state, v.dispatch) },
  { id: 'callout', label: 'Callout', icon: 'callout', isActive: (s) => isInList(s, n.callout), run: (v) => commands.callout()(v.state, v.dispatch) },
  { id: 'code', label: 'Code block', icon: 'codeBlock', isActive: (s) => isBlockActive(s, n.code_block), run: (v) => commands.codeBlock()(v.state, v.dispatch) },
]

/** Unwrap lists / quotes / callouts, then make the block a paragraph. */
function toText(v: EditorView) {
  for (let guard = 0; guard < 8; guard++) {
    const s = v.state
    if (isInList(s, n.task_list)) commands.taskList(s, v.dispatch)
    else if (isInList(s, n.bullet_list)) commands.bulletList(s, v.dispatch)
    else if (isInList(s, n.ordered_list)) commands.orderedList(s, v.dispatch)
    else if (isInList(s, n.blockquote) || isInList(s, n.callout)) { if (!lift(s, v.dispatch)) break }
    else break
  }
  commands.paragraph(v.state, v.dispatch)
}

let turnMenu: { el: HTMLElement; off: () => void } | null = null
const closeTurnInto = () => { turnMenu?.off(); turnMenu?.el.remove(); turnMenu = null }
function openTurnInto(view: EditorView, root: HTMLElement) {
  if (turnMenu) return closeTurnInto()
  const el = h('div', { class: 'pn-menu pn-slash pn-turn-into', role: 'menu', 'aria-label': 'Turn into' }, h('div', { class: 'pn-menu-group' }, 'Turn into'),
    ...turnIntoItems.map((it) => h('button', {
      type: 'button', role: 'menuitemradio', 'aria-checked': String(it.isActive(view.state)), class: 'pn-menu-item' + (it.isActive(view.state) ? ' pn-selected' : ''),
      onmousedown: (e: Event) => e.preventDefault(), onclick: () => { closeTurnInto(); it.run(view); view.focus() },
    }, h('span', { class: 'pn-menu-icon', html: icons[it.icon] }), h('span', { class: 'pn-menu-title' }, it.label))))
  root.append(el)
  place(el, selectionRect(view), root, 'below', 12)
  turnMenu = { el, off: onOutside(el, closeTurnInto) }
}

export const defaultBubbleItems: MenuItem[] = [
  { id: 'turnInto', icon: 'chevronDown', label: 'Turn into', text: (s) => [...turnIntoItems].reverse().find((t) => t.isActive(s))?.label ?? 'Text', run: (v, root) => openTurnInto(v, root) },
  { id: 'bold', icon: 'bold', label: 'Bold', shortcut: `${M}+B`, isActive: (s) => isMarkActive(s, m.bold), run: (v) => commands.bold(v.state, v.dispatch) },
  { id: 'italic', icon: 'italic', label: 'Italic', shortcut: `${M}+I`, isActive: (s) => isMarkActive(s, m.italic), run: (v) => commands.italic(v.state, v.dispatch) },
  { id: 'underline', icon: 'underline', label: 'Underline', shortcut: `${M}+U`, isActive: (s) => isMarkActive(s, m.underline), run: (v) => commands.underline(v.state, v.dispatch) },
  { id: 'strike', icon: 'strike', label: 'Strikethrough', shortcut: `${M}+Shift+S`, isActive: (s) => isMarkActive(s, m.strike), run: (v) => commands.strike(v.state, v.dispatch) },
  { id: 'code', icon: 'code', label: 'Inline code', shortcut: `${M}+E`, isActive: (s) => isMarkActive(s, m.code), run: (v) => commands.code(v.state, v.dispatch) },
  { id: 'highlight', icon: 'highlight', label: 'Highlight', shortcut: `${M}+Shift+H`, isActive: (s) => isMarkActive(s, m.highlight), run: (v) => commands.highlight()(v.state, v.dispatch) },
  { id: 'link', icon: 'link', label: 'Link', shortcut: `${M}+K`, isActive: (s) => isMarkActive(s, m.link), run: (v, root) => openLinkEditor(v, root) },
  { id: 'clear', icon: 'clear', label: 'Clear formatting', shortcut: `${M}+\\`, run: (v) => commands.clearFormatting(v.state, v.dispatch) },
]

export function bubblePlugin(root: HTMLElement, items: () => MenuItem[]): Plugin {
  let el: HTMLElement | null = null
  let mouseDown = false
  const hide = () => { el?.remove(); el = null; closeTurnInto() }

  const render = (view: EditorView) => {
    const { selection } = view.state
    const show = !selection.empty && !(selection instanceof NodeSelection) && view.editable && view.hasFocus() && !mouseDown
      && !selection.$from.parent.type.spec.code
    if (!show) return hide()
    if (!el) { el = h('div', { class: 'pn-menu pn-bubble', role: 'toolbar', 'aria-label': 'Text formatting' }); root.append(el) }
    el.innerHTML = ''
    for (const it of items()) {
      if (it.scope === 'block') continue
      const b = iconButton({ icon: it.icon, label: it.label, shortcut: it.shortcut, text: it.text?.(view.state), active: it.isActive?.(view.state), onClick: () => { it.run(view, root); render(view) } })
      if (it.text) { b.classList.add('pn-btn-text', 'pn-btn-trail'); el.append(b, h('span', { class: 'pn-sep' })) } else el.append(b)
    }
    place(el, selectionRect(view), root, 'above')
  }

  return new Plugin({
    view(view) {
      const down = () => { mouseDown = true; hide() }
      // re-rendering under the pointer would swap the button out before its click fires
      const up = (e: MouseEvent) => { if (el?.contains(e.target as Node)) return; mouseDown = false; render(view) }
      const blur = () => setTimeout(() => { if (!root.contains(document.activeElement)) hide() }, 0)
      view.dom.addEventListener('mousedown', down)
      document.addEventListener('mouseup', up)
      view.dom.addEventListener('blur', blur)
      return {
        update: (v) => render(v),
        destroy: () => { hide(); view.dom.removeEventListener('mousedown', down); document.removeEventListener('mouseup', up); view.dom.removeEventListener('blur', blur) },
      }
    },
  })
}
