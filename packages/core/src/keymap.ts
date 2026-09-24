import { keymap } from 'prosemirror-keymap'
import { baseKeymap, chainCommands, exitCode, joinUp, joinDown, lift, selectParentNode, newlineInCode, createParagraphNear, liftEmptyBlock, splitBlock } from 'prosemirror-commands'
import { splitListItem, liftListItem, sinkListItem } from 'prosemirror-schema-list'
import { undoInputRule } from 'prosemirror-inputrules'
import { goToNextCell } from 'prosemirror-tables'
import { TextSelection, type Command } from 'prosemirror-state'
import { schema, isEmbeddable } from './schema'
import { commands } from './commands'

const { nodes: n } = schema
const mac = typeof navigator !== 'undefined' && /Mac|iP(hone|ad|od)/.test(navigator.platform)
export const modKey = mac ? '⌘' : 'Ctrl'

/** Enter on a line that is only an embeddable URL turns it into an embed. */
const embedOnEnter: Command = (state, dispatch) => {
  const { $from, empty } = state.selection
  if (!empty || $from.parent.type !== n.paragraph) return false
  const text = $from.parent.textContent.trim()
  if (!text || !isEmbeddable(text) || $from.parentOffset !== $from.parent.content.size) return false
  const parent = $from.node(-1), index = $from.index(-1)
  if (!parent.canReplaceWith(index, index + 1, n.embed)) return false
  const start = $from.before(), end = $from.after()
  if (dispatch) {
    const tr = state.tr.replaceWith(start, end, [n.embed.create({ url: text }), n.paragraph.create()])
    dispatch(tr.setSelection(TextSelection.near(tr.doc.resolve(end + 1))).scrollIntoView())
  }
  return true
}

/** Backspace at the start of a heading/blockquote-ish block converts it back to a paragraph. */
const backspaceToParagraph: Command = (state, dispatch) => {
  const { $from, empty } = state.selection
  if (!empty || $from.parentOffset !== 0) return false
  const p = $from.parent
  if (p.type === n.heading || (p.type === n.code_block && p.content.size === 0)) {
    dispatch?.(state.tr.setBlockType($from.before(), $from.after(), n.paragraph))
    return true
  }
  return false
}

/** Exit a code block with Mod-Enter or ArrowDown at the end when it's the last node. */
const exitOrCreateAfter: Command = (state, dispatch) => {
  const { $from } = state.selection
  if ($from.parent.type !== n.code_block) return false
  if (exitCode(state, dispatch)) return true
  const after = $from.after()
  if (dispatch) {
    const tr = state.tr.insert(after, n.paragraph.create())
    dispatch(tr.setSelection(TextSelection.near(tr.doc.resolve(after + 1))).scrollIntoView())
  }
  return true
}

export const pennaKeymap = keymap({
  'Mod-z': commands.undo,
  'Shift-Mod-z': commands.redo,
  'Mod-y': commands.redo,
  Backspace: chainCommands(undoInputRule, backspaceToParagraph, baseKeymap.Backspace),
  'Mod-b': commands.bold,
  'Mod-i': commands.italic,
  'Mod-u': commands.underline,
  'Mod-Shift-s': commands.strike,
  'Mod-e': commands.code,
  'Mod-Shift-h': commands.highlight(),
  'Mod-Alt-0': commands.paragraph,
  'Mod-Alt-1': commands.heading(1),
  'Mod-Alt-2': commands.heading(2),
  'Mod-Alt-3': commands.heading(3),
  'Mod-Shift-7': commands.orderedList,
  'Mod-Shift-8': commands.bulletList,
  'Mod-Shift-9': commands.taskList,
  'Mod-Shift-b': commands.blockquote,
  'Mod-Alt-c': commands.codeBlock(),
  'Mod-Alt-t': commands.table(),
  'Mod-Shift-l': commands.align('left'),
  'Mod-Shift-e': commands.align('center'),
  'Mod-Shift-r': commands.align('right'),
  'Mod-\\': commands.clearFormatting,
  Enter: chainCommands(
    embedOnEnter,
    newlineInCode,
    splitListItem(n.task_item),
    splitListItem(n.list_item),
    createParagraphNear,
    liftEmptyBlock,
    splitBlock,
  ),
  'Mod-Enter': chainCommands(exitOrCreateAfter, commands.hardBreak),
  'Shift-Enter': chainCommands(exitCode, commands.hardBreak),
  Tab: chainCommands(goToNextCell(1), sinkListItem(n.list_item), sinkListItem(n.task_item), (state, dispatch) => {
    // In a code block, insert two spaces instead of leaving the editor.
    if (state.selection.$from.parent.type !== n.code_block) return false
    dispatch?.(state.tr.insertText('  '))
    return true
  }),
  'Shift-Tab': chainCommands(goToNextCell(-1), liftListItem(n.list_item), liftListItem(n.task_item)),
  'Alt-ArrowUp': joinUp,
  'Alt-ArrowDown': joinDown,
  'Mod-BracketLeft': lift,
  Escape: selectParentNode,
})

export { baseKeymap }
