import MarkdownIt from 'markdown-it'
import { MarkdownParser, MarkdownSerializer, defaultMarkdownSerializer } from 'prosemirror-markdown'
import type { Node as PMNode } from 'prosemirror-model'
import { schema } from './schema'

// ---------- Markdown -> doc ----------

const md = MarkdownIt('commonmark', { html: false, linkify: true }).enable(['strikethrough', 'table'])

// task list items: "- [ ] foo" / "- [x] foo"
md.core.ruler.after('inline', 'penna_tasks', (state) => {
  const t = state.tokens
  for (let i = 0; i < t.length; i++) {
    if (t[i].type !== 'list_item_open') continue
    const inline = t[i + 2]
    if (!inline || inline.type !== 'inline') continue
    const m = inline.content.match(/^\[( |x|X)\] /)
    if (!m) continue
    t[i].type = 'task_item_open'
    t[i].attrSet('checked', m[1] === ' ' ? 'false' : 'true')
    inline.content = inline.content.slice(4)
    if (inline.children?.[0]?.type === 'text') inline.children[0].content = inline.children[0].content.slice(4)
    // find matching close
    let depth = 0
    for (let j = i; j < t.length; j++) {
      if (t[j].type === 'list_item_open' || t[j].type === 'task_item_open') depth++
      if (t[j].type === 'list_item_close') { depth--; if (depth === 0) { t[j].type = 'task_item_close'; break } }
    }
    // mark enclosing list as a task list
    for (let j = i - 1; j >= 0; j--) if (t[j].type === 'bullet_list_open') { t[j].type = 'task_list_open'; break }
  }
  for (let i = 0; i < t.length; i++) {
    if (t[i].type !== 'task_list_open') continue
    let depth = 0
    for (let j = i; j < t.length; j++) {
      if (t[j].type === 'task_list_open' || t[j].type === 'bullet_list_open') depth++
      if (t[j].type === 'bullet_list_close') { depth--; if (depth === 0) { t[j].type = 'task_list_close'; break } }
    }
  }
  return true
})

// Our table cells hold block+, so wrap each cell's inline content in a paragraph.
md.core.ruler.after('inline', 'penna_table_cells', (state) => {
  const t = state.tokens
  for (let i = 0; i < t.length; i++) {
    if ((t[i].type === 'th_open' || t[i].type === 'td_open') && t[i + 1]?.type === 'inline') {
      t.splice(i + 1, 0, new state.Token('paragraph_open', 'p', 1))
      t.splice(i + 3, 0, new state.Token('paragraph_close', 'p', -1))
    }
  }
  return true
})

// A paragraph containing only an image becomes a block-level image (our image node is a block).
md.core.ruler.after('inline', 'penna_block_images', (state) => {
  const t = state.tokens
  for (let i = 0; i + 2 < t.length; i++) {
    const inline = t[i + 1]
    if (t[i].type !== 'paragraph_open' || inline.type !== 'inline' || t[i + 2].type !== 'paragraph_close') continue
    const kids = (inline.children ?? []).filter((c) => !(c.type === 'text' && !c.content.trim()))
    if (kids.length !== 1 || kids[0].type !== 'image') continue
    const img = kids[0]
    img.block = true
    t.splice(i, 3, img)
  }
  return true
})

// {{first_name}} → merge field
md.inline.ruler.before('emphasis', 'penna_merge', (state, silent) => {
  const m = /^\{\{\s*([\w.-]+)\s*\}\}/.exec(state.src.slice(state.pos))
  if (!m) return false
  if (!silent) state.push('merge_field', '', 0).meta = { key: m[1] }
  state.pos += m[0].length
  return true
})

export const markdownParser = new MarkdownParser(schema, md, {
  merge_field: { node: 'merge_field', getAttrs: (t) => ({ key: t.meta.key }) },
  blockquote: { block: 'blockquote' },
  paragraph: { block: 'paragraph' },
  list_item: { block: 'list_item' },
  task_item: { block: 'task_item', getAttrs: (t) => ({ checked: t.attrGet('checked') === 'true' }) },
  bullet_list: { block: 'bullet_list' },
  task_list: { block: 'task_list' },
  ordered_list: { block: 'ordered_list', getAttrs: (t) => ({ start: +(t.attrGet('start') || 1) }) },
  heading: { block: 'heading', getAttrs: (t) => ({ level: Math.min(3, +t.tag.slice(1)) }) },
  code_block: { block: 'code_block', noCloseToken: true },
  fence: { block: 'code_block', getAttrs: (t) => ({ language: t.info || '' }), noCloseToken: true },
  hr: { node: 'horizontal_rule' },
  image: { node: 'image', getAttrs: (t) => ({ src: t.attrGet('src'), title: t.attrGet('title'), alt: t.children?.[0]?.content || '' }) },
  hardbreak: { node: 'hard_break' },
  table: { block: 'table' },
  thead: { ignore: true },
  tbody: { ignore: true },
  tr: { block: 'table_row' },
  th: { block: 'table_header' },
  td: { block: 'table_cell' },
  em: { mark: 'italic' },
  strong: { mark: 'bold' },
  s: { mark: 'strike' },
  link: { mark: 'link', getAttrs: (t) => ({ href: t.attrGet('href'), title: t.attrGet('title') }) },
  code_inline: { mark: 'code', noCloseToken: true },
})

// ---------- doc -> Markdown ----------

export const markdownSerializer = new MarkdownSerializer(
  {
    ...defaultMarkdownSerializer.nodes,
    code_block(state, node) {
      state.write('```' + (node.attrs.language || '') + '\n')
      state.text(node.textContent, false)
      state.write('\n```')
      state.closeBlock(node)
    },
    task_list(state, node) {
      state.renderList(node, '  ', () => '- ')
    },
    task_item(state, node) {
      state.write(node.attrs.checked ? '[x] ' : '[ ] ')
      state.renderContent(node)
    },
    callout(state, node) {
      state.wrapBlock('> ', null, node, () => {
        state.write(`${node.attrs.emoji} `)
        state.renderContent(node)
      })
    },
    image(state, node) {
      state.write(`![${state.esc(node.attrs.alt || '')}](${node.attrs.src}${node.attrs.title ? ` "${state.esc(node.attrs.title)}"` : ''})`)
      state.closeBlock(node)
    },
    video(state, node) {
      state.write(`<video src="${node.attrs.src}" controls></video>`)
      state.closeBlock(node)
    },
    mention(state, node) {
      state.write(`@${node.attrs.label}`)
    },
    merge_field(state, node) {
      state.write(`{{${node.attrs.key}}}`)
    },
    embed(state, node) {
      state.write(node.attrs.url)
      state.closeBlock(node)
    },
    table(state, node) {
      node.forEach((row, _, i) => {
        state.write('| ')
        row.forEach((cell, __, j) => {
          if (j) state.write(' | ')
          state.renderInline(cell.child(0))
        })
        state.write(' |')
        state.ensureNewLine()
        if (i === 0) {
          state.write('|' + ' --- |'.repeat(row.childCount))
          state.ensureNewLine()
        }
      })
      state.closeBlock(node)
    },
  },
  {
    ...defaultMarkdownSerializer.marks,
    bold: defaultMarkdownSerializer.marks.strong,
    italic: defaultMarkdownSerializer.marks.em,
    strike: { open: '~~', close: '~~', mixable: true, expelEnclosingWhitespace: true },
    underline: { open: '<u>', close: '</u>', mixable: true },
    highlight: { open: '==', close: '==', mixable: true },
    color: { open: '', close: '', mixable: true },
    comment: { open: '', close: '', mixable: true },
  },
)

export const toMarkdown = (doc: PMNode) => markdownSerializer.serialize(doc, { tightLists: true })
export const fromMarkdown = (text: string) => markdownParser.parse(text)
