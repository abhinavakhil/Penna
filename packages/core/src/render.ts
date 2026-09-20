import { Node as PMNode, Mark } from 'prosemirror-model'
import { schema } from './schema'

const VOID = new Set(['img', 'br', 'hr', 'input', 'video', 'iframe'])

const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Interpret a DOMOutputSpec array as an HTML string, splicing `inner` at the content hole. */
function specToHTML(spec: unknown, inner: string): string {
  if (typeof spec === 'string') return escape(spec)
  if (!Array.isArray(spec)) throw new Error('renderToHTML: toDOM must return a DOMOutputSpec array')
  const [tag, ...rest] = spec as [string, ...unknown[]]
  let attrs = ''
  let children = rest
  if (rest[0] && typeof rest[0] === 'object' && !Array.isArray(rest[0])) {
    for (const [k, v] of Object.entries(rest[0] as Record<string, unknown>)) {
      if (v == null) continue
      attrs += ` ${k}="${escape(String(v))}"`
    }
    children = rest.slice(1)
  }
  if (VOID.has(tag) && children.length === 0) return `<${tag}${attrs}>`
  const body = children.map((c) => (c === 0 ? inner : specToHTML(c, inner))).join('')
  return `<${tag}${attrs}>${body}</${tag}>`
}

function renderNode(node: PMNode): string {
  if (node.isText) {
    let html = escape(node.text ?? '')
    // innermost mark first, same order DOMSerializer uses
    for (let i = node.marks.length - 1; i >= 0; i--) html = renderMark(node.marks[i], html)
    return html
  }
  const inner = renderContent(node)
  const spec = node.type.spec.toDOM!(node)
  return specToHTML(spec, inner)
}

function renderMark(mark: Mark, inner: string): string {
  return specToHTML(mark.type.spec.toDOM!(mark, true), inner)
}

function renderContent(node: PMNode): string {
  let out = ''
  let run: PMNode[] = []
  const flush = () => {
    if (!run.length) return
    // Group adjacent text nodes sharing outer marks so <strong>a<em>b</em></strong> stays merged,
    // matching DOMSerializer output.
    out += mergeMarked(run)
    run = []
  }
  node.forEach((child) => {
    if (child.isInline) run.push(child)
    else { flush(); out += renderNode(child) }
  })
  flush()
  return out
}

function mergeMarked(nodes: PMNode[]): string {
  // Recursive: peel the outermost common mark off the longest prefix that shares it.
  let out = ''
  let i = 0
  while (i < nodes.length) {
    const first = nodes[i]
    const mark = first.isText ? first.marks[0] : undefined
    if (!mark) { out += first.isText ? escape(first.text ?? '') : renderNode(first); i++; continue }
    let j = i
    while (j < nodes.length && nodes[j].isText && mark.isInSet(nodes[j].marks) && nodes[j].marks[0]?.eq(mark)) j++
    const stripped = nodes.slice(i, j).map((n) => n.mark(n.marks.filter((m) => !m.eq(mark))))
    out += renderMark(mark, mergeMarked(stripped))
    i = j
  }
  return out
}

/** SSR-safe: turn editor JSON into the same HTML the editor produces. No DOM needed. */
export function renderToHTML(json: unknown): string {
  const doc = PMNode.fromJSON(schema, json as Record<string, unknown>)
  return renderContent(doc)
}
