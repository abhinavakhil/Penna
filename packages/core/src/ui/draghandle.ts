import { Plugin, NodeSelection, TextSelection } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'
import { h } from './dom'
import { icons } from './icons'
import { schema } from '../schema'
import { slashKey } from './slash'

/** Notion-style handle in the left gutter: drag to move a block, click "+" to insert below. */
export function dragHandlePlugin(root: HTMLElement): Plugin {
  let handle: HTMLElement | null = null
  let targetPos: number | null = null
  let hideTimer: number | undefined

  const hide = () => { if (handle) handle.style.display = 'none' }

  const blockAt = (view: EditorView, x: number, y: number): { pos: number; dom: HTMLElement } | null => {
    // find the top-level block under the pointer (allowing a bit of leeway to the left)
    const found = view.posAtCoords({ left: Math.max(x, view.dom.getBoundingClientRect().left + 8), top: y })
    if (!found) return null
    const $pos = view.state.doc.resolve(found.inside < 0 ? found.pos : found.inside)
    const depth = Math.min(1, $pos.depth)
    const pos = depth === 0 ? found.inside : $pos.before(1)
    if (pos < 0) return null
    const dom = view.nodeDOM(pos) as HTMLElement | null
    return dom ? { pos, dom } : null
  }

  return new Plugin({
    view(view) {
      handle = h('div', { class: 'pn-drag-handle', style: 'display:none' },
        h('button', { type: 'button', class: 'pn-btn', 'aria-label': 'Insert block below', title: 'Add block', html: icons.plus, onmousedown: (e: Event) => e.preventDefault(), onclick: () => {
          if (targetPos == null) return
          const node = view.state.doc.nodeAt(targetPos)!
          const after = targetPos + node.nodeSize
          const tr = view.state.tr.insert(after, schema.nodes.paragraph.create())
          tr.setSelection(TextSelection.create(tr.doc, after + 1))
          view.dispatch(tr)
          view.focus()
          // open the slash menu straight away
          view.dispatch(view.state.tr.insertText('/'))
          view.dispatch(view.state.tr.setMeta(slashKey, { open: true, from: after + 1, query: '' }))
        } }),
        h('button', { type: 'button', class: 'pn-btn pn-grip', draggable: 'true', 'aria-label': 'Drag to move block', title: 'Drag to move', html: icons.grip, onmousedown: () => {
          if (targetPos == null) return
          view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, targetPos)))
        }, ondragstart: (e: DragEvent) => {
          if (targetPos == null) return
          const sel = NodeSelection.create(view.state.doc, targetPos)
          view.dispatch(view.state.tr.setSelection(sel))
          const slice = sel.content()
          e.dataTransfer?.setData('text/html', '')
          e.dataTransfer!.effectAllowed = 'move'
          const dom = view.nodeDOM(targetPos) as HTMLElement
          if (dom) e.dataTransfer?.setDragImage(dom, 0, 0)
          view.dragging = { slice, move: true }
        }, ondragend: () => hide() }),
      )
      root.append(handle)

      const move = (e: MouseEvent) => {
        if (!view.editable) return hide()
        window.clearTimeout(hideTimer)
        const b = blockAt(view, e.clientX, e.clientY)
        if (!b) { hideTimer = window.setTimeout(hide, 300); return }
        targetPos = b.pos
        const r = b.dom.getBoundingClientRect(), rr = root.getBoundingClientRect()
        handle!.style.display = ''
        handle!.style.top = `${r.top - rr.top + root.scrollTop + (b.dom.matches('h1,h2,h3') ? 6 : 2)}px`
        handle!.style.left = `${r.left - rr.left - 52}px`
      }
      const leave = () => { hideTimer = window.setTimeout(hide, 300) }
      root.addEventListener('mousemove', move)
      root.addEventListener('mouseleave', leave)
      handle.addEventListener('mouseenter', () => window.clearTimeout(hideTimer))
      return {
        destroy() { root.removeEventListener('mousemove', move); root.removeEventListener('mouseleave', leave); handle?.remove(); handle = null },
      }
    },
  })
}
