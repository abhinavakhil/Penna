import { Plugin, PluginKey } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'
import { schema } from '../schema'
import type { PennaEditor, PennaExtension } from '../editor'

export interface CommentAnchor { id: string; quote: string; from: number; to: number }

export interface CommentsExtension extends PennaExtension {
  /** Anchor a new thread on the current selection. Returns its id, or null if nothing is selected. */
  add(id?: string): string | null
  /** Remove the anchor (the thread itself lives in your app). */
  resolve(id: string): void
  setActive(id: string | null): void
  list(): CommentAnchor[]
}

const key = new PluginKey<string | null>('pn-comments')
const mark = schema.marks.comment

export function comments(opts: { onAdd?: (c: CommentAnchor) => void; onSelect?: (id: string | null) => void } = {}): CommentsExtension {
  let editor: PennaEditor | undefined
  const anchors = (): CommentAnchor[] => {
    if (!editor) return []
    const out = new Map<string, CommentAnchor>()
    editor.state.doc.descendants((node, pos) => {
      node.marks.forEach((m) => {
        if (m.type !== mark) return
        const a = out.get(m.attrs.id)
        if (a) { a.to = pos + node.nodeSize; a.quote += node.text ?? '' } else out.set(m.attrs.id, { id: m.attrs.id, quote: node.text ?? '', from: pos, to: pos + node.nodeSize })
      })
    })
    return [...out.values()]
  }
  const ext: CommentsExtension = {
    name: 'comments',
    list: anchors,
    add: (id = `c${Math.random().toString(36).slice(2, 9)}`) => {
      if (!editor) return null
      const { from, to, empty } = editor.state.selection
      if (empty) return null
      editor.view.dispatch(editor.state.tr.addMark(from, to, mark.create({ id })).setMeta(key, id))
      opts.onAdd?.(anchors().find((a) => a.id === id)!)
      return id
    },
    resolve: (id) => {
      if (!editor) return
      const tr = editor.state.tr
      editor.state.doc.descendants((node, pos) => { node.marks.forEach((m) => { if (m.type === mark && m.attrs.id === id) tr.removeMark(pos, pos + node.nodeSize, m) }) })
      editor.view.dispatch(tr.setMeta(key, null))
    },
    setActive: (id) => editor?.view.dispatch(editor.state.tr.setMeta(key, id)),
    bubbleItems: [{ id: 'comment', icon: 'comment', label: 'Comment', run: () => { ext.add() } }],
    onCreate: (ed) => { editor = ed },
    plugins: () => [new Plugin<string | null>({
      key,
      state: { init: () => null, apply: (tr, prev) => (tr.getMeta(key) !== undefined ? tr.getMeta(key) : prev) },
      props: {
        decorations(state) {
          const active = key.getState(state)
          if (!active) return null
          const decos: Decoration[] = []
          state.doc.descendants((node, pos) => { if (node.marks.some((m) => m.type === mark && m.attrs.id === active)) decos.push(Decoration.inline(pos, pos + node.nodeSize, { class: 'pn-comment-active' })) })
          return DecorationSet.create(state.doc, decos)
        },
        handleDOMEvents: {
          click(view, e) {
            const id = (e.target as HTMLElement).closest?.('[data-comment]')?.getAttribute('data-comment') ?? null
            if (id !== key.getState(view.state)) { view.dispatch(view.state.tr.setMeta(key, id)); opts.onSelect?.(id) }
            return false
          },
        },
      },
    })],
  }
  return ext
}
