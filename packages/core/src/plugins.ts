import { Plugin, PluginKey, type EditorState, type Transaction, TextSelection } from 'prosemirror-state'
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view'
import type { Node as PMNode, Slice } from 'prosemirror-model'
import { schema, isEmbeddable } from './schema'

const { nodes: n, marks: m } = schema

// ---------- placeholder ----------

export function placeholderPlugin(text: string, headingText = 'Heading'): Plugin {
  return new Plugin({
    props: {
      decorations(state) {
        const { $from } = state.selection
        const decos: Decoration[] = []
        const doc = state.doc
        const isEmptyDoc = doc.childCount === 1 && doc.firstChild!.isTextblock && doc.firstChild!.content.size === 0
        if (isEmptyDoc) {
          decos.push(Decoration.node(0, doc.firstChild!.nodeSize, { class: 'pn-empty', 'data-placeholder': text }))
        } else if ($from.parent.isTextblock && $from.parent.content.size === 0 && $from.parent.type !== n.code_block) {
          const label = $from.parent.type === n.heading ? `${headingText} ${$from.parent.attrs.level}` : "Type '/' for commands"
          decos.push(Decoration.node($from.before(), $from.after(), { class: 'pn-empty', 'data-placeholder': label }))
        }
        return DecorationSet.create(doc, decos)
      },
    },
  })
}

// ---------- media: drop / paste files and URLs ----------

export type UploadHandler = (file: File) => Promise<string>

const readAsDataURL = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = reject
    r.readAsDataURL(file)
  })

export function mediaPlugin(opts: { onUpload?: UploadHandler; maxInlineBytes?: number } = {}): Plugin {
  const upload = opts.onUpload ?? readAsDataURL
  const max = opts.maxInlineBytes ?? 10 * 1024 * 1024

  const insertFiles = async (view: EditorView, files: File[], pos?: number) => {
    for (const file of files) {
      const kind = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : null
      if (!kind) continue
      if (!opts.onUpload && file.size > max) { console.warn(`[penna] ${file.name} is larger than ${max} bytes; pass onUpload to store it elsewhere.`); continue }
      const src = await upload(file)
      const node = kind === 'image' ? n.image.create({ src, alt: file.name.replace(/\.\w+$/, '') }) : n.video.create({ src })
      const at = pos ?? view.state.selection.to
      view.dispatch(view.state.tr.insert(at, node).scrollIntoView())
      pos = undefined
    }
  }

  return new Plugin({
    props: {
      handleDrop(view, event) {
        const files = Array.from(event.dataTransfer?.files ?? [])
        if (!files.length) return false
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos
        event.preventDefault()
        void insertFiles(view, files, pos)
        return true
      },
      handlePaste(view, event, slice: Slice) {
        const files = Array.from(event.clipboardData?.files ?? [])
        if (files.length) { event.preventDefault(); void insertFiles(view, files); return true }
        const text = event.clipboardData?.getData('text/plain')?.trim()
        if (!text || slice.content.size > text.length + 2) return false
        const { from, to, empty } = view.state.selection
        if (/^https?:\/\/\S+$/.test(text)) {
          if (!empty) { // paste URL over selected text → link
            view.dispatch(view.state.tr.addMark(from, to, m.link.create({ href: text })))
            return true
          }
          if (isEmbeddable(text) && view.state.selection.$from.parent.content.size === 0) {
            view.dispatch(view.state.tr.replaceSelectionWith(n.embed.create({ url: text })).scrollIntoView())
            return true
          }
          if (/\.(png|jpe?g|gif|webp|svg|avif)(\?|$)/i.test(text)) {
            view.dispatch(view.state.tr.replaceSelectionWith(n.image.create({ src: text })).scrollIntoView())
            return true
          }
          view.dispatch(view.state.tr.insertText(text).addMark(from, from + text.length, m.link.create({ href: text })).removeStoredMark(m.link))
          return true
        }
        return false
      },
    },
  })
}

// ---------- always keep an empty paragraph after a trailing non-text block ----------

export function trailingNodePlugin(): Plugin {
  const key = new PluginKey('pn-trailing')
  return new Plugin({
    key,
    appendTransaction(_trs, _old, state) {
      const last = state.doc.lastChild
      if (!last || last.isTextblock) return null
      return state.tr.insert(state.doc.content.size, n.paragraph.create())
    },
  })
}

// ---------- task checkbox click ----------

export function taskClickPlugin(): Plugin {
  return new Plugin({
    props: {
      handleClickOn(view, _pos, node, nodePos, event) {
        if (node.type !== n.task_item || !(event.target instanceof HTMLInputElement)) return false
        view.dispatch(view.state.tr.setNodeMarkup(nodePos, undefined, { ...node.attrs, checked: !node.attrs.checked }))
        return true
      },
    },
  })
}

// ---------- word / character count ----------

export function countWords(doc: PMNode): { words: number; characters: number; charactersNoSpaces: number; readingMinutes: number } {
  const text = doc.textBetween(0, doc.content.size, ' ', ' ')
  const words = text.trim() ? text.trim().split(/\s+/).length : 0
  return { words, characters: text.length, charactersNoSpaces: text.replace(/\s/g, '').length, readingMinutes: Math.max(1, Math.round(words / 200)) }
}

// ---------- find & replace ----------

export interface FindState { query: string; caseSensitive: boolean; matches: { from: number; to: number }[]; active: number }
export const findKey = new PluginKey<FindState>('pn-find')

function computeMatches(doc: PMNode, query: string, caseSensitive: boolean) {
  const matches: { from: number; to: number }[] = []
  if (!query) return matches
  const q = caseSensitive ? query : query.toLowerCase()
  doc.descendants((node, pos) => {
    if (!node.isText) return
    const text = caseSensitive ? node.text! : node.text!.toLowerCase()
    let i = text.indexOf(q)
    while (i !== -1) { matches.push({ from: pos + i, to: pos + i + q.length }); i = text.indexOf(q, i + q.length) }
  })
  return matches
}

export function findPlugin(): Plugin<FindState> {
  return new Plugin<FindState>({
    key: findKey,
    state: {
      init: () => ({ query: '', caseSensitive: false, matches: [], active: 0 }),
      apply(tr, prev, _old, state) {
        const meta = tr.getMeta(findKey) as Partial<FindState> | undefined
        if (!meta && !tr.docChanged) return prev
        const next = { ...prev, ...meta }
        next.matches = computeMatches(state.doc, next.query, next.caseSensitive)
        next.active = Math.min(next.active, Math.max(0, next.matches.length - 1))
        return next
      },
    },
    props: {
      decorations(state) {
        const { matches, active } = findKey.getState(state)!
        return DecorationSet.create(state.doc, matches.map((mt, i) => Decoration.inline(mt.from, mt.to, { class: i === active ? 'pn-find-match pn-find-active' : 'pn-find-match' })))
      },
    },
  })
}

export const find = {
  set(view: EditorView, patch: Partial<Pick<FindState, 'query' | 'caseSensitive'>>) {
    view.dispatch(view.state.tr.setMeta(findKey, { ...patch, active: 0 }))
  },
  next(view: EditorView, dir = 1) {
    const s = findKey.getState(view.state)!
    if (!s.matches.length) return
    const active = (s.active + dir + s.matches.length) % s.matches.length
    const mt = s.matches[active]
    view.dispatch(view.state.tr.setMeta(findKey, { active }).setSelection(TextSelection.create(view.state.doc, mt.from, mt.to)).scrollIntoView())
  },
  replace(view: EditorView, replacement: string) {
    const s = findKey.getState(view.state)!
    const mt = s.matches[s.active]
    if (!mt) return
    view.dispatch(view.state.tr.insertText(replacement, mt.from, mt.to))
  },
  replaceAll(view: EditorView, replacement: string) {
    const s = findKey.getState(view.state)!
    const tr = view.state.tr
    ;[...s.matches].reverse().forEach((mt) => tr.insertText(replacement, mt.from, mt.to))
    view.dispatch(tr)
  },
  state: (state: EditorState) => findKey.getState(state)!,
}

// ---------- read-only toggle via meta ----------

export const readonlyKey = new PluginKey<boolean>('pn-readonly')
export function readonlyPlugin(initial: boolean): Plugin<boolean> {
  return new Plugin<boolean>({
    key: readonlyKey,
    state: { init: () => initial, apply: (tr: Transaction, prev) => (tr.getMeta(readonlyKey) ?? prev) as boolean },
    props: { editable: (state) => !readonlyKey.getState(state) },
  })
}
