import type { EditorView } from 'prosemirror-view'
import { h, iconButton } from './dom'
import { icons } from './icons'
import { commands, isMarkActive, isBlockActive, isInList } from '../commands'
import { schema } from '../schema'
import { openLinkEditor } from './link'
import { modKey as M } from '../keymap'
import type { MenuItem } from './bubble'
import { toggleFindBar } from './find'
import { prompt } from './dom'
import type { FontFamilyOption, TypographyOptions } from '../editor'

const { marks: m, nodes: n } = schema

export const defaultToolbarItems: (MenuItem | '|')[] = [
  { id: 'undo', icon: 'undo', label: 'Undo', shortcut: `${M}+Z`, run: (v) => commands.undo(v.state, v.dispatch) },
  { id: 'redo', icon: 'redo', label: 'Redo', shortcut: `${M}+Shift+Z`, run: (v) => commands.redo(v.state, v.dispatch) },
  '|',
  { id: 'paragraph', icon: 'text', label: 'Text', isActive: (s) => isBlockActive(s, n.paragraph), run: (v) => commands.paragraph(v.state, v.dispatch) },
  { id: 'h1', icon: 'h1', label: 'Heading 1', shortcut: `${M}+Alt+1`, isActive: (s) => isBlockActive(s, n.heading, { level: 1 }), run: (v) => commands.heading(1)(v.state, v.dispatch) },
  { id: 'h2', icon: 'h2', label: 'Heading 2', shortcut: `${M}+Alt+2`, isActive: (s) => isBlockActive(s, n.heading, { level: 2 }), run: (v) => commands.heading(2)(v.state, v.dispatch) },
  { id: 'h3', icon: 'h3', label: 'Heading 3', shortcut: `${M}+Alt+3`, isActive: (s) => isBlockActive(s, n.heading, { level: 3 }), run: (v) => commands.heading(3)(v.state, v.dispatch) },
  '|',
  { id: 'bold', icon: 'bold', label: 'Bold', shortcut: `${M}+B`, isActive: (s) => isMarkActive(s, m.bold), run: (v) => commands.bold(v.state, v.dispatch) },
  { id: 'italic', icon: 'italic', label: 'Italic', shortcut: `${M}+I`, isActive: (s) => isMarkActive(s, m.italic), run: (v) => commands.italic(v.state, v.dispatch) },
  { id: 'underline', icon: 'underline', label: 'Underline', shortcut: `${M}+U`, isActive: (s) => isMarkActive(s, m.underline), run: (v) => commands.underline(v.state, v.dispatch) },
  { id: 'strike', icon: 'strike', label: 'Strikethrough', shortcut: `${M}+Shift+S`, isActive: (s) => isMarkActive(s, m.strike), run: (v) => commands.strike(v.state, v.dispatch) },
  { id: 'code', icon: 'code', label: 'Inline code', shortcut: `${M}+E`, isActive: (s) => isMarkActive(s, m.code), run: (v) => commands.code(v.state, v.dispatch) },
  { id: 'highlight', icon: 'highlight', label: 'Highlight', shortcut: `${M}+Shift+H`, isActive: (s) => isMarkActive(s, m.highlight), run: (v) => commands.highlight()(v.state, v.dispatch) },
  { id: 'link', icon: 'link', label: 'Link', shortcut: `${M}+K`, isActive: (s) => isMarkActive(s, m.link), run: (v, root) => openLinkEditor(v, root) },
  '|',
  { id: 'bullet', icon: 'bulletList', label: 'Bullet list', shortcut: `${M}+Shift+8`, isActive: (s) => isInList(s, n.bullet_list), run: (v) => commands.bulletList(v.state, v.dispatch) },
  { id: 'ordered', icon: 'orderedList', label: 'Numbered list', shortcut: `${M}+Shift+7`, isActive: (s) => isInList(s, n.ordered_list), run: (v) => commands.orderedList(v.state, v.dispatch) },
  { id: 'task', icon: 'taskList', label: 'To-do list', shortcut: `${M}+Shift+9`, isActive: (s) => isInList(s, n.task_list), run: (v) => commands.taskList(v.state, v.dispatch) },
  { id: 'quote', icon: 'quote', label: 'Quote', shortcut: `${M}+Shift+B`, run: (v) => commands.blockquote(v.state, v.dispatch) },
  { id: 'codeBlock', icon: 'codeBlock', label: 'Code block', shortcut: `${M}+Alt+C`, isActive: (s) => isBlockActive(s, n.code_block), run: (v) => commands.codeBlock()(v.state, v.dispatch) },
  '|',
  { id: 'alignLeft', icon: 'alignLeft', label: 'Align left', run: (v) => commands.align('left')(v.state, v.dispatch) },
  { id: 'alignCenter', icon: 'alignCenter', label: 'Align center', run: (v) => commands.align('center')(v.state, v.dispatch) },
  { id: 'alignRight', icon: 'alignRight', label: 'Align right', run: (v) => commands.align('right')(v.state, v.dispatch) },
  '|',
  { id: 'image', icon: 'image', label: 'Image', run: (v) => { const i = h('input', { type: 'file', accept: 'image/*,video/*', multiple: true }); i.onchange = () => { const dt = new DataTransfer(); Array.from(i.files ?? []).forEach((f) => dt.items.add(f)); v.dom.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })) }; i.click() } },
  { id: 'embed', icon: 'embed', label: 'Embed link', run: async (v) => { const url = await prompt('Paste a link to embed (YouTube, Vimeo, Loom, Figma…)'); if (url) commands.embed(url)(v.state, v.dispatch); v.focus() } },
  { id: 'table', icon: 'table', label: 'Table', run: (v) => commands.table()(v.state, v.dispatch) },
  { id: 'hr', icon: 'hr', label: 'Divider', run: (v) => commands.horizontalRule(v.state, v.dispatch) },
  '|',
  { id: 'find', icon: 'search', label: 'Find & replace', shortcut: `${M}+F`, run: (v, root) => toggleFindBar(v, root) },
  { id: 'clear', icon: 'clear', label: 'Clear formatting', shortcut: `${M}+\\`, run: (v) => commands.clearFormatting(v.state, v.dispatch) },
]

type TypographyControls = Required<Pick<TypographyOptions, 'fontFamilies' | 'fontSizes' | 'lineHeights'>>

function selectedBlockAttr(view: EditorView, name: 'fontFamily' | 'fontSize' | 'lineHeight'): string {
  const { from, to, empty, $from } = view.state.selection
  if (empty) return ($from.parent.type === n.paragraph || $from.parent.type === n.heading) ? $from.parent.attrs[name] ?? '' : ''
  const values = new Set<string>()
  view.state.doc.nodesBetween(from, to, (node) => {
    if (node.type === n.paragraph || node.type === n.heading) values.add(node.attrs[name] ?? '')
  })
  return values.size === 1 ? [...values][0] : ''
}

export function createToolbar(view: EditorView, root: HTMLElement, items: () => (MenuItem | '|')[], typography?: TypographyControls): { el: HTMLElement; update(): void; destroy(): void } {
  const el = h('div', { class: 'pn-toolbar', role: 'toolbar', 'aria-label': 'Editor toolbar' })
  const buttons: { it: MenuItem; b: HTMLButtonElement }[] = []
  const selects: { el: HTMLSelectElement; attr: 'fontFamily' | 'fontSize' | 'lineHeight' }[] = []
  const addSelect = (label: string, attr: 'fontFamily' | 'fontSize' | 'lineHeight', options: FontFamilyOption[]) => {
    const select = h('select', { class: `pn-select pn-select-${attr}`, 'aria-label': label, title: label },
      h('option', { value: '' }, label),
      ...options.map((option) => h('option', { value: option.value }, option.label)),
    )
    select.addEventListener('change', () => {
      commands[attr](select.value || null)(view.state, view.dispatch)
      view.focus()
      update()
    })
    selects.push({ el: select, attr })
    el.append(select)
  }
  const build = () => {
    el.innerHTML = ''
    buttons.length = 0
    selects.length = 0
    if (typography) {
      addSelect('Font family', 'fontFamily', typography.fontFamilies)
      addSelect('Font size', 'fontSize', typography.fontSizes.map((value) => ({ label: value, value })))
      addSelect('Line height', 'lineHeight', typography.lineHeights.map((value) => ({ label: value, value })))
      el.append(h('span', { class: 'pn-sep' }))
    }
    for (const it of items()) {
      if (it === '|') { el.append(h('span', { class: 'pn-sep' })); continue }
      const b = iconButton({ icon: it.icon, label: it.label, shortcut: it.shortcut, onClick: () => { it.run(view, root); view.focus(); update() } })
      buttons.push({ it, b })
      el.append(b)
    }
  }
  const update = () => {
    for (const { it, b } of buttons) {
      const active = !!it.isActive?.(view.state)
      b.classList.toggle('pn-active', active)
      b.setAttribute('aria-pressed', String(active))
      b.disabled = !view.editable
    }
    for (const select of selects) {
      select.el.value = selectedBlockAttr(view, select.attr)
      select.el.disabled = !view.editable
    }
  }
  build()
  update()
  return { el, update, destroy: () => el.remove() }
}

export { icons }
