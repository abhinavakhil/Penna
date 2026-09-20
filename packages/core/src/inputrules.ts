import { inputRules, wrappingInputRule, textblockTypeInputRule, InputRule, smartQuotes, emDash, ellipsis } from 'prosemirror-inputrules'
import type { MarkType, NodeType } from 'prosemirror-model'
import { schema } from './schema'

const { nodes: n, marks: m } = schema

/**
 * `**bold**`, `_italic_`, `` `code` `` etc.
 * Regex shape: /(?:^|\s)(DELIM(text)DELIM)$/ — group 1 is the delimited run, group 2 the inner text.
 */
export function markInputRule(regexp: RegExp, markType: MarkType, getAttrs?: (match: RegExpMatchArray) => Record<string, unknown>): InputRule {
  return new InputRule(regexp, (state, match, start, end) => {
    const [full, delimited, text] = match
    if (!text) return null
    const delimStart = start + full.indexOf(delimited)
    const textStart = delimStart + delimited.indexOf(text)
    const textEnd = textStart + text.length
    const tr = state.tr
    if (textEnd < end) tr.delete(textEnd, end)
    if (textStart > delimStart) tr.delete(delimStart, textStart)
    return tr.addMark(delimStart, delimStart + text.length, markType.create(getAttrs?.(match))).removeStoredMark(markType)
  })
}

export function nodeInputRule(regexp: RegExp, type: NodeType, getAttrs: (match: RegExpMatchArray) => Record<string, unknown>): InputRule {
  return new InputRule(regexp, (state, match, start, end) => state.tr.replaceWith(start, end, type.create(getAttrs(match))))
}

export const pennaInputRules = inputRules({
  rules: [
    ...smartQuotes, emDash, ellipsis,
    // blocks
    textblockTypeInputRule(/^(#{1,3})\s$/, n.heading, (match) => ({ level: match[1].length })),
    wrappingInputRule(/^\s*>\s$/, n.blockquote),
    wrappingInputRule(/^\s*([-+*])\s$/, n.bullet_list),
    wrappingInputRule(/^(\d+)\.\s$/, n.ordered_list, (match) => ({ start: +match[1] }), (match, node) => node.childCount + node.attrs.start === +match[1]),
    wrappingInputRule(/^\s*\[([ x])\]\s$/, n.task_list, (match) => ({ checked: match[1] === 'x' })),
    textblockTypeInputRule(/^```([a-z0-9+#-]*)\s$/, n.code_block, (match) => ({ language: match[1] })),
    new InputRule(/^(?:---|___|\*\*\*)\s$/, (state, _match, start, end) =>
      state.tr.replaceWith(start - 1, end, n.horizontal_rule.create()).insert(start, n.paragraph.create())),
    // marks (inline markdown)
    markInputRule(/(?:^|\s)(\*\*([^*]+)\*\*)$/, m.bold),
    markInputRule(/(?:^|\s)(__([^_]+)__)$/, m.bold),
    markInputRule(/(?:^|\s)(\*([^*]+)\*)$/, m.italic),
    markInputRule(/(?:^|\s)(_([^_]+)_)$/, m.italic),
    markInputRule(/(?:^|\s)(~~([^~]+)~~)$/, m.strike),
    markInputRule(/(?:^|\s)(==([^=]+)==)$/, m.highlight),
    markInputRule(/(?:^|\s)(`([^`]+)`)$/, m.code),
    // typed URL followed by space → link
    new InputRule(/(https?:\/\/[^\s]+)\s$/, (state, match, start, end) => {
      const url = match[1]
      const from = start + match[0].indexOf(url)
      return state.tr.insertText(' ', end).addMark(from, from + url.length, m.link.create({ href: url })).removeStoredMark(m.link)
    }),
    nodeInputRule(/^!\[([^\]]*)\]\(([^)]+)\)$/, n.image, (match) => ({ alt: match[1], src: match[2] })),
  ],
})
