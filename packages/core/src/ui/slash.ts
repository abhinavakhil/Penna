import { Plugin, PluginKey, TextSelection } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'
import { h, place, fuzzy, prompt } from './dom'
import { icons, type IconName } from './icons'
import { commands } from '../commands'

export interface SlashItem {
  id: string
  title: string
  description?: string
  /** icon name from the built-in set, or raw SVG/emoji markup */
  icon: IconName | string
  keywords?: string[]
  group?: string
  /** Keyboard shortcut shown in the menu, ProseMirror style ('Mod-Alt-t'). Bind it yourself or via an extension. */
  hotkey?: string
  run: (view: EditorView) => void
}

const isMac = typeof navigator !== 'undefined' && /Mac|iP(hone|ad)/.test(navigator.platform)
/** 'Mod-Alt-t' → 'Ctrl+Alt+T' (or ⌘⌥T on Mac). */
export const formatHotkey = (k: string) => k.split('-').map((p) => ({ Mod: isMac ? '⌘' : 'Ctrl', Alt: isMac ? '⌥' : 'Alt', Shift: isMac ? '⇧' : 'Shift', Ctrl: 'Ctrl' }[p] ?? p.toUpperCase())).join(isMac ? '' : '+')

const pick = (view: EditorView, accept: string) => (cb: (files: File[]) => void) => {
  const input = h('input', { type: 'file', accept, multiple: true, style: 'display:none' })
  input.onchange = () => { cb(Array.from(input.files ?? [])); input.remove(); view.focus() }
  document.body.append(input)
  input.click()
}

const insertFiles = (view: EditorView, files: File[]) => {
  const dt = new DataTransfer()
  files.forEach((f) => dt.items.add(f))
  // Reuse the media plugin's paste path so onUpload is honoured.
  view.dom.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
}

export const defaultSlashItems: SlashItem[] = [
  { id: 'text', title: 'Text', description: 'Plain paragraph', icon: 'text', keywords: ['paragraph', 'p'], group: 'Basic', hotkey: 'Mod-Alt-0', run: (v) => commands.paragraph(v.state, v.dispatch) },
  { id: 'h1', title: 'Heading 1', description: 'Big section heading', icon: 'h1', keywords: ['title', '#'], group: 'Basic', hotkey: 'Mod-Alt-1', run: (v) => commands.heading(1)(v.state, v.dispatch) },
  { id: 'h2', title: 'Heading 2', description: 'Medium section heading', icon: 'h2', keywords: ['##'], group: 'Basic', hotkey: 'Mod-Alt-2', run: (v) => commands.heading(2)(v.state, v.dispatch) },
  { id: 'h3', title: 'Heading 3', description: 'Small section heading', icon: 'h3', keywords: ['###'], group: 'Basic', hotkey: 'Mod-Alt-3', run: (v) => commands.heading(3)(v.state, v.dispatch) },
  { id: 'bullet', title: 'Bullet list', description: 'Simple bulleted list', icon: 'bulletList', keywords: ['ul', 'unordered', '-'], group: 'Basic', hotkey: 'Mod-Shift-8', run: (v) => commands.bulletList(v.state, v.dispatch) },
  { id: 'ordered', title: 'Numbered list', description: 'List with numbers', icon: 'orderedList', keywords: ['ol', '1.'], group: 'Basic', hotkey: 'Mod-Shift-7', run: (v) => commands.orderedList(v.state, v.dispatch) },
  { id: 'task', title: 'To-do list', description: 'Track tasks with checkboxes', icon: 'taskList', keywords: ['todo', 'checkbox', 'check', '[]'], group: 'Basic', hotkey: 'Mod-Shift-9', run: (v) => commands.taskList(v.state, v.dispatch) },
  { id: 'quote', title: 'Quote', description: 'Capture a quotation', icon: 'quote', keywords: ['blockquote', '>'], group: 'Basic', hotkey: 'Mod-Shift-b', run: (v) => commands.blockquote(v.state, v.dispatch) },
  { id: 'callout', title: 'Callout', description: 'Highlighted note box', icon: 'callout', keywords: ['note', 'info', 'tip', 'warning'], group: 'Basic', run: (v) => commands.callout()(v.state, v.dispatch) },
  { id: 'code', title: 'Code block', description: 'Snippet with syntax label', icon: 'codeBlock', keywords: ['pre', '```', 'snippet'], group: 'Basic', hotkey: 'Mod-Alt-c', run: (v) => commands.codeBlock()(v.state, v.dispatch) },
  { id: 'hr', title: 'Divider', description: 'Horizontal rule', icon: 'hr', keywords: ['rule', 'line', '---', 'separator'], group: 'Basic', run: (v) => commands.horizontalRule(v.state, v.dispatch) },
  { id: 'table', title: 'Table', description: '3×3 table with header', icon: 'table', keywords: ['grid', 'rows', 'columns'], group: 'Basic', hotkey: 'Mod-Alt-t', run: (v) => commands.table()(v.state, v.dispatch) },
  { id: 'image', title: 'Image', description: 'Upload or paste an image', icon: 'image', keywords: ['picture', 'photo', 'img', 'upload'], group: 'Media', run: (v) => pick(v, 'image/*')((files) => insertFiles(v, files)) },
  { id: 'image-url', title: 'Image from URL', description: 'Embed an image by link', icon: 'image', keywords: ['picture', 'link'], group: 'Media', run: async (v) => { const src = await prompt('Image URL'); if (src) commands.image(src)(v.state, v.dispatch); v.focus() } },
  { id: 'video', title: 'Video', description: 'Upload a video file', icon: 'video', keywords: ['mp4', 'movie', 'upload'], group: 'Media', run: (v) => pick(v, 'video/*')((files) => insertFiles(v, files)) },
  { id: 'embed', title: 'Embed', description: 'YouTube, Vimeo, Loom, Figma, CodePen…', icon: 'embed', keywords: ['youtube', 'vimeo', 'iframe', 'loom', 'figma', 'codepen'], group: 'Media', run: async (v) => { const url = await prompt('Paste a link to embed'); if (url) commands.embed(url)(v.state, v.dispatch); v.focus() } },
]

export const slashKey = new PluginKey<{ open: boolean; from: number; query: string }>('pn-slash')

export function slashPlugin(root: HTMLElement, items: () => SlashItem[]): Plugin {
  let menu: HTMLElement | null = null
  let selected = 0
  let filtered: SlashItem[] = []

  const runItem = (view: EditorView, item: SlashItem) => {
    const s = slashKey.getState(view.state)!
    // delete "/query"
    view.dispatch(view.state.tr.delete(s.from, view.state.selection.from).setMeta(slashKey, { open: false }))
    item.run(view)
    view.focus()
  }

  const render = (view: EditorView) => {
    const s = slashKey.getState(view.state)!
    if (!s.open) { menu?.remove(); menu = null; return }
    if (!menu) selected = 0
    const all = items()
    filtered = all
      .map((it) => ({ it, score: Math.min(...[it.title, ...(it.keywords ?? [])].map((t) => fuzzy(s.query, t)).map((x) => (x < 0 ? 99 : x))) }))
      .filter((x) => x.score < 99)
      .sort((a, b) => a.score - b.score)
      .map((x) => x.it)
    selected = Math.min(selected, Math.max(0, filtered.length - 1))
    if (!menu) {
      menu = h('div', { class: 'pn-menu pn-slash', role: 'listbox', 'aria-label': 'Insert block' })
      root.append(menu)
    }
    menu.innerHTML = ''
    if (!filtered.length) menu.append(h('div', { class: 'pn-menu-empty' }, 'No results'))
    let lastGroup = ''
    filtered.forEach((it, i) => {
      if (it.group && it.group !== lastGroup) { menu!.append(h('div', { class: 'pn-menu-group' }, it.group)); lastGroup = it.group }
      const icon = (icons as Record<string, string>)[it.icon] ?? it.icon
      const el = h('button', {
        type: 'button', class: 'pn-menu-item' + (i === selected ? ' pn-selected' : ''), role: 'option', 'aria-selected': i === selected ? 'true' : 'false',
        onmousedown: (e: Event) => e.preventDefault(), onclick: () => runItem(view, it), onmousemove: () => { if (selected !== i) { selected = i; render(view) } },
      }, h('span', { class: 'pn-menu-icon', html: icon }), h('span', { class: 'pn-menu-text' }, h('span', { class: 'pn-menu-title' }, it.title), it.description ? h('span', { class: 'pn-menu-desc' }, it.description) : null),
        it.hotkey ? h('kbd', { class: 'pn-menu-kbd' }, formatHotkey(it.hotkey)) : null)
      menu!.append(el)
    })
    menu.querySelector('.pn-selected')?.scrollIntoView({ block: 'nearest' })
    const coords = view.coordsAtPos(s.from)
    place(menu, new DOMRect(coords.left, coords.top, 0, coords.bottom - coords.top), root)
  }

  return new Plugin({
    key: slashKey,
    state: {
      init: () => ({ open: false, from: 0, query: '' }),
      apply(tr, prev) {
        const meta = tr.getMeta(slashKey)
        const cur = meta ? { ...prev, ...meta } : prev
        if (!tr.selection.empty) return cur.open ? { ...cur, open: false } : cur
        const { $from } = tr.selection
        if (!$from.parent.isTextblock || $from.parent.type.spec.code) return cur.open ? { ...cur, open: false } : cur
        const text = $from.parent.textBetween(0, $from.parentOffset, undefined, '￼')
        if (!cur.open) {
          // Open when the user has just typed "/" at the start of a line or after whitespace.
          if (tr.docChanged && text.endsWith('/') && (text.length === 1 || /\s/.test(text[text.length - 2]))) return { open: true, from: $from.pos - 1, query: '' }
          return cur
        }
        const start = cur.from - $from.start()
        if (start < 0 || text[start] !== '/' || /\s/.test(text.slice(start + 1))) return { ...cur, open: false }
        return { ...cur, query: text.slice(start + 1) }
      },
    },
    props: {
      handleKeyDown(view, e) {
        const s = slashKey.getState(view.state)
        if (!s?.open) return false
        if (e.key === 'ArrowDown') { selected = (selected + 1) % Math.max(1, filtered.length); render(view); return true }
        if (e.key === 'ArrowUp') { selected = (selected - 1 + filtered.length) % Math.max(1, filtered.length); render(view); return true }
        if (e.key === 'Enter' || e.key === 'Tab') { if (filtered[selected]) runItem(view, filtered[selected]); return true }
        if (e.key === 'Escape') { close(view); return true }
        return false
      },
    },
    view() {
      return {
        update: (v) => render(v),
        destroy: () => { menu?.remove(); menu = null },
      }
    },
  })
}

export { close as closeSlash }
function close(view: EditorView) { if (slashKey.getState(view.state)?.open) view.dispatch(view.state.tr.setMeta(slashKey, { open: false })) }
