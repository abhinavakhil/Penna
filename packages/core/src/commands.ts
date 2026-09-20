import { type Command, type EditorState, TextSelection, NodeSelection, Transaction } from 'prosemirror-state'
import { setBlockType, toggleMark, wrapIn, lift, chainCommands } from 'prosemirror-commands'
import { wrapInList, liftListItem } from 'prosemirror-schema-list'
import { undo, redo } from 'prosemirror-history'
import { addColumnAfter, addColumnBefore, addRowAfter, addRowBefore, deleteColumn, deleteRow, deleteTable, toggleHeaderRow, isInTable } from 'prosemirror-tables'
import { type Attrs, type MarkType, type NodeType, Node as PMNode } from 'prosemirror-model'
import { schema } from './schema'

const { nodes: n, marks: m } = schema

export function isMarkActive(state: EditorState, type: MarkType): boolean {
  const { from, $from, to, empty } = state.selection
  if (empty) return !!type.isInSet(state.storedMarks || $from.marks())
  return state.doc.rangeHasMark(from, to, type)
}

export function isBlockActive(state: EditorState, type: NodeType, attrs?: Attrs): boolean {
  const { $from, to } = state.selection
  const node = state.selection instanceof NodeSelection ? state.selection.node : $from.parent
  if (to > $from.end()) return false
  return node.hasMarkup(type, attrs ? { ...node.attrs, ...attrs } : node.attrs)
}

export function isInList(state: EditorState, type: NodeType): boolean {
  const { $from } = state.selection
  for (let d = $from.depth; d > 0; d--) if ($from.node(d).type === type) return true
  return false
}

export function getMarkAttrs(state: EditorState, type: MarkType): Attrs | null {
  const { $from, from, to, empty } = state.selection
  if (empty) return type.isInSet(state.storedMarks || $from.marks())?.attrs ?? null
  let found: Attrs | null = null
  state.doc.nodesBetween(from, to, (node) => {
    const mk = type.isInSet(node.marks)
    if (mk) found = mk.attrs
    return !found
  })
  return found
}

/** Toggle a list type; if already in that list, lift out. Switching list kinds re-wraps. */
export function toggleList(listType: NodeType, itemType: NodeType): Command {
  return (state, dispatch) => {
    if (isInList(state, listType)) return liftListItem(itemType)(state, dispatch)
    const other = [n.bullet_list, n.ordered_list, n.task_list].find((t) => t !== listType && isInList(state, t))
    if (other) {
      const item = other === n.task_list ? n.task_item : n.list_item
      let ok = false
      liftListItem(item)(state, (tr) => {
        ok = wrapInList(listType)(state.apply(tr), (tr2) => dispatch?.(tr2))
      })
      return ok
    }
    return wrapInList(listType)(state, dispatch)
  }
}

/** Toggle a wrapping block (blockquote, callout). */
export function toggleWrap(type: NodeType, attrs?: Attrs): Command {
  return (state, dispatch) => (isBlockWrapped(state, type) ? lift(state, dispatch) : wrapIn(type, attrs)(state, dispatch))
}
function isBlockWrapped(state: EditorState, type: NodeType) {
  const { $from } = state.selection
  for (let d = $from.depth; d > 0; d--) if ($from.node(d).type === type) return true
  return false
}

/** Set heading level, or paragraph if already that level. */
export function toggleHeading(level: number): Command {
  return (state, dispatch) =>
    isBlockActive(state, n.heading, { level }) ? setBlockType(n.paragraph)(state, dispatch) : setBlockType(n.heading, { level })(state, dispatch)
}

export function setLink(href: string | null, attrs: Attrs = {}): Command {
  return (state, dispatch) => {
    const { from, to, empty } = state.selection
    if (!dispatch) return true
    const tr = state.tr
    if (!href) {
      if (empty) {
        // remove the whole link the cursor sits in
        const range = markRange(state, m.link)
        if (range) tr.removeMark(range.from, range.to, m.link)
      } else tr.removeMark(from, to, m.link)
    } else if (empty) {
      const range = markRange(state, m.link)
      if (range) tr.addMark(range.from, range.to, m.link.create({ href, ...attrs }))
      else tr.insertText(href, from).addMark(from, from + href.length, m.link.create({ href, ...attrs }))
    } else tr.addMark(from, to, m.link.create({ href, ...attrs }))
    dispatch(tr.scrollIntoView())
    return true
  }
}

export function markRange(state: EditorState, type: MarkType): { from: number; to: number } | null {
  const { $from } = state.selection
  const mark = type.isInSet($from.marks())
  if (!mark) return null
  const parent = $from.parent, start = $from.start()
  let from = $from.parentOffset, to = from
  while (from > 0 && mark.isInSet(parent.childAfter(from - 1).node?.marks ?? [])) from = parent.childBefore(from).offset
  while (to < parent.content.size && mark.isInSet(parent.childAfter(to).node?.marks ?? [])) to = parent.childAfter(to).offset + parent.childAfter(to).node!.nodeSize
  return { from: start + from, to: start + to }
}

export function insertNode(type: NodeType, attrs?: Attrs): Command {
  return (state, dispatch) => {
    const node = type.createAndFill(attrs)
    if (!node) return false
    if (dispatch) {
      let tr = state.tr.replaceSelectionWith(node)
      // keep a paragraph after block media so the user can keep typing
      if (type.isBlock && !type.isTextblock) {
        const pos = tr.selection.$to.after()
        if (pos >= tr.doc.content.size) tr = tr.insert(pos, n.paragraph.create())
        tr = tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(pos + 1, tr.doc.content.size))))
      }
      dispatch(tr.scrollIntoView())
    }
    return true
  }
}

export function insertTable(rows = 3, cols = 3, withHeader = true): Command {
  return (state, dispatch) => {
    const cells = (type: NodeType) => Array.from({ length: cols }, () => type.createAndFill()!)
    const rowNodes = Array.from({ length: rows }, (_, i) => n.table_row.create(null, cells(withHeader && i === 0 ? n.table_header : n.table_cell)))
    const table = n.table.create(null, rowNodes)
    if (dispatch) {
      const tr = state.tr.replaceSelectionWith(table)
      const pos = tr.selection.from - table.nodeSize + 3
      dispatch(tr.setSelection(TextSelection.near(tr.doc.resolve(pos))).scrollIntoView())
    }
    return true
  }
}

export function setAlign(align: 'left' | 'center' | 'right' | 'justify' | null): Command {
  return (state, dispatch) => {
    const { from, to } = state.selection
    const tr = state.tr
    let changed = false
    state.doc.nodesBetween(from, to, (node, pos) => {
      if (node.type === n.paragraph || node.type === n.heading || node.type === n.image) {
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, align: node.type === n.image ? align ?? 'center' : align === 'left' ? null : align })
        changed = true
      }
    })
    if (changed && dispatch) dispatch(tr)
    return changed
  }
}

export function setTextblockAttr(name: 'fontFamily' | 'fontSize' | 'lineHeight', value: string | null): Command {
  return (state, dispatch) => {
    const { from, to, empty, $from } = state.selection
    const tr = state.tr
    let changed = false
    const update = (node: PMNode, pos: number) => {
      if (node.type !== n.paragraph && node.type !== n.heading) return
      if (node.attrs[name] === value) return
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, [name]: value })
      changed = true
    }
    if (empty) {
      for (let depth = $from.depth; depth > 0; depth--) {
        const node = $from.node(depth)
        if (node.type === n.paragraph || node.type === n.heading) { update(node, $from.before(depth)); break }
      }
    } else state.doc.nodesBetween(from, to, update)
    if (changed && dispatch) dispatch(tr)
    return changed
  }
}

export function updateNodeAttrs(attrs: Attrs): Command {
  return (state, dispatch) => {
    const sel = state.selection
    if (!(sel instanceof NodeSelection)) return false
    dispatch?.(state.tr.setNodeMarkup(sel.from, undefined, { ...sel.node.attrs, ...attrs }))
    return true
  }
}

export function toggleTaskItem(pos: number): Command {
  return (state, dispatch) => {
    const node = state.doc.nodeAt(pos)
    if (node?.type !== n.task_item) return false
    dispatch?.(state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, checked: !node.attrs.checked }))
    return true
  }
}

export function clearFormatting(): Command {
  return (state, dispatch) => {
    const { from, to } = state.selection
    const tr = state.tr
    Object.values(m).forEach((mk) => tr.removeMark(from, to, mk))
    tr.setBlockType(from, to, n.paragraph)
    dispatch?.(tr)
    return true
  }
}

/** Replace the selection (or insert at cursor) with parsed HTML/markdown doc content. */
export function replaceWithDoc(doc: PMNode, from?: number, to?: number): (tr: Transaction) => Transaction {
  return (tr) => tr.replaceWith(from ?? tr.selection.from, to ?? tr.selection.to, doc.content)
}

export const commands = {
  undo,
  redo,
  bold: toggleMark(m.bold),
  italic: toggleMark(m.italic),
  underline: toggleMark(m.underline),
  strike: toggleMark(m.strike),
  code: toggleMark(m.code),
  highlight: (color: string | null = null) => toggleMark(m.highlight, color ? { color } : undefined),
  color: (color: string) => toggleMark(m.color, { color }),
  paragraph: setBlockType(n.paragraph),
  heading: toggleHeading,
  blockquote: toggleWrap(n.blockquote),
  callout: (emoji?: string) => toggleWrap(n.callout, emoji ? { emoji } : undefined),
  codeBlock: (language = '') => setBlockType(n.code_block, { language }),
  bulletList: toggleList(n.bullet_list, n.list_item),
  orderedList: toggleList(n.ordered_list, n.list_item),
  taskList: toggleList(n.task_list, n.task_item),
  horizontalRule: insertNode(n.horizontal_rule),
  hardBreak: chainCommands((state, dispatch) => {
    dispatch?.(state.tr.replaceSelectionWith(n.hard_break.create()).scrollIntoView())
    return true
  }),
  link: setLink,
  unlink: setLink(null),
  image: (src: string, attrs: Attrs = {}) => insertNode(n.image, { src, ...attrs }),
  video: (src: string) => insertNode(n.video, { src }),
  embed: (url: string) => insertNode(n.embed, { url }),
  table: insertTable,
  align: setAlign,
  fontFamily: (value: string | null) => setTextblockAttr('fontFamily', value),
  fontSize: (value: string | null) => setTextblockAttr('fontSize', value),
  lineHeight: (value: string | null) => setTextblockAttr('lineHeight', value),
  clearFormatting: clearFormatting(),
  updateNodeAttrs,
  toggleTaskItem,
  // tables
  addRowBefore, addRowAfter, addColumnBefore, addColumnAfter, deleteRow, deleteColumn, deleteTable, toggleHeaderRow, isInTable,
}
export type Commands = typeof commands
