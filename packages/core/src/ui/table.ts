import { Plugin } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'
import { isInTable, selectedRect, addRowAfter, addRowBefore, addColumnAfter, addColumnBefore, deleteRow, deleteColumn, deleteTable, toggleHeaderRow, mergeCells, splitCell } from 'prosemirror-tables'
import { h, place } from './dom'
import { icons } from './icons'

/** Compact controls shown above a table while the cursor is inside it. */
export function tableMenuPlugin(root: HTMLElement): Plugin {
  let el: HTMLElement | null = null
  const hide = () => { el?.remove(); el = null }
  const btn = (label: string, cmd: (s: EditorView['state'], d: EditorView['dispatch']) => boolean, view: EditorView, html?: string) =>
    h('button', { type: 'button', class: 'pn-btn' + (html ? '' : ' pn-btn-text'), 'aria-label': label, title: label, html: html ?? label, onmousedown: (e: Event) => e.preventDefault(), onclick: () => { cmd(view.state, view.dispatch); view.focus() } })

  const render = (view: EditorView) => {
    if (!view.editable || !isInTable(view.state) || !view.hasFocus()) return hide()
    if (!el) { el = h('div', { class: 'pn-menu pn-table-menu', role: 'toolbar', 'aria-label': 'Table' }); root.append(el) }
    el.innerHTML = ''
    el.append(
      btn('Row above', addRowBefore, view, '↑ row'), btn('Row below', addRowAfter, view, '↓ row'),
      btn('Column left', addColumnBefore, view, '← col'), btn('Column right', addColumnAfter, view, 'col →'),
      h('span', { class: 'pn-sep' }),
      btn('Toggle header row', toggleHeaderRow, view, 'header'),
      btn('Merge cells', mergeCells, view, 'merge'), btn('Split cell', splitCell, view, 'split'),
      h('span', { class: 'pn-sep' }),
      btn('Delete row', deleteRow, view, '− row'), btn('Delete column', deleteColumn, view, '− col'),
      btn('Delete table', deleteTable, view, icons.trash),
    )
    const rect = selectedRect(view.state)
    const tableDom = view.nodeDOM(rect.tableStart - 1) as HTMLElement | null
    if (!tableDom) return hide()
    place(el, tableDom.getBoundingClientRect(), root, 'above')
  }

  return new Plugin({
    view(view) {
      const blur = () => setTimeout(() => { if (!root.contains(document.activeElement)) hide() }, 0)
      view.dom.addEventListener('blur', blur)
      return { update: render, destroy: () => { hide(); view.dom.removeEventListener('blur', blur) } }
    },
  })
}
