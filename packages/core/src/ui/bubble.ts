import { Plugin, NodeSelection, type EditorState } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'
import { h, iconButton, place, selectionRect } from './dom'
import type { IconName } from './icons'
import { commands, isMarkActive, isBlockActive, isInList } from '../commands'
import { schema } from '../schema'
import { openLinkEditor } from './link'
import { modKey } from '../keymap'

export interface MenuItem {
  id: string
  icon: IconName
  label: string
  shortcut?: string
  isActive?: (state: EditorState) => boolean
  run: (view: EditorView, root: HTMLElement) => void
  /** 'inline' items only show for text selections; 'block' for node selections */
  scope?: 'inline' | 'block' | 'both'
}

const { marks: m, nodes: n } = schema
const M = modKey

export const defaultBubbleItems: MenuItem[] = [
  { id: 'bold', icon: 'bold', label: 'Bold', shortcut: `${M}+B`, isActive: (s) => isMarkActive(s, m.bold), run: (v) => commands.bold(v.state, v.dispatch) },
  { id: 'italic', icon: 'italic', label: 'Italic', shortcut: `${M}+I`, isActive: (s) => isMarkActive(s, m.italic), run: (v) => commands.italic(v.state, v.dispatch) },
  { id: 'underline', icon: 'underline', label: 'Underline', shortcut: `${M}+U`, isActive: (s) => isMarkActive(s, m.underline), run: (v) => commands.underline(v.state, v.dispatch) },
  { id: 'strike', icon: 'strike', label: 'Strikethrough', shortcut: `${M}+Shift+S`, isActive: (s) => isMarkActive(s, m.strike), run: (v) => commands.strike(v.state, v.dispatch) },
  { id: 'code', icon: 'code', label: 'Inline code', shortcut: `${M}+E`, isActive: (s) => isMarkActive(s, m.code), run: (v) => commands.code(v.state, v.dispatch) },
  { id: 'highlight', icon: 'highlight', label: 'Highlight', shortcut: `${M}+Shift+H`, isActive: (s) => isMarkActive(s, m.highlight), run: (v) => commands.highlight()(v.state, v.dispatch) },
  { id: 'link', icon: 'link', label: 'Link', shortcut: `${M}+K`, isActive: (s) => isMarkActive(s, m.link), run: (v, root) => openLinkEditor(v, root) },
  { id: 'h1', icon: 'h1', label: 'Heading 1', isActive: (s) => isBlockActive(s, n.heading, { level: 1 }), run: (v) => commands.heading(1)(v.state, v.dispatch) },
  { id: 'h2', icon: 'h2', label: 'Heading 2', isActive: (s) => isBlockActive(s, n.heading, { level: 2 }), run: (v) => commands.heading(2)(v.state, v.dispatch) },
  { id: 'bullet', icon: 'bulletList', label: 'Bullet list', isActive: (s) => isInList(s, n.bullet_list), run: (v) => commands.bulletList(v.state, v.dispatch) },
  { id: 'quote', icon: 'quote', label: 'Quote', run: (v) => commands.blockquote(v.state, v.dispatch) },
  { id: 'clear', icon: 'clear', label: 'Clear formatting', shortcut: `${M}+\\`, run: (v) => commands.clearFormatting(v.state, v.dispatch) },
]

export function bubblePlugin(root: HTMLElement, items: () => MenuItem[]): Plugin {
  let el: HTMLElement | null = null
  let mouseDown = false
  const hide = () => { el?.remove(); el = null }

  const render = (view: EditorView) => {
    const { selection } = view.state
    const show = !selection.empty && !(selection instanceof NodeSelection) && view.editable && view.hasFocus() && !mouseDown
      && !selection.$from.parent.type.spec.code
    if (!show) return hide()
    if (!el) { el = h('div', { class: 'pn-menu pn-bubble', role: 'toolbar', 'aria-label': 'Text formatting' }); root.append(el) }
    el.innerHTML = ''
    for (const it of items()) {
      if (it.scope === 'block') continue
      el.append(iconButton({ icon: it.icon, label: it.label, shortcut: it.shortcut, active: it.isActive?.(view.state), onClick: () => { it.run(view, root); render(view) } }))
    }
    place(el, selectionRect(view), root, 'above')
  }

  return new Plugin({
    view(view) {
      const down = () => { mouseDown = true; hide() }
      const up = () => { mouseDown = false; render(view) }
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
