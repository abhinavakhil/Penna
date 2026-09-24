import { Schema, type NodeSpec, type MarkSpec, type DOMOutputSpec } from 'prosemirror-model'
import { tableNodes } from 'prosemirror-tables'

// Every toDOM here returns a plain DOMOutputSpec array (no DOM nodes) so
// renderToHTML() can interpret the same spec without a document. Keep it that way.

const safeFont = (value: unknown) => {
  const font = String(value ?? '').replace(/^["']|["']$/g, '').trim()
  return font && /^[\p{L}\p{N} _-]{1,80}$/u.test(font) ? font : null
}
const safeSize = (value: unknown) => {
  const size = String(value ?? '').trim()
  return /^(?:\d+(?:\.\d+)?(?:px|rem|em|%)|)$/.test(size) ? size || null : null
}
const safeLineHeight = (value: unknown) => {
  const height = String(value ?? '').trim()
  return /^(?:\d+(?:\.\d+)?(?:px|rem|em|%)?|normal|)$/.test(height) ? height || null : null
}
const typographyAttrs = { fontFamily: { default: null }, fontSize: { default: null }, lineHeight: { default: null } }
const blockAttrs = (dom: HTMLElement) => ({
  align: dom.style.textAlign || null,
  fontFamily: safeFont(dom.dataset.fontFamily || dom.style.fontFamily),
  fontSize: safeSize(dom.dataset.fontSize || dom.style.fontSize),
  lineHeight: safeLineHeight(dom.dataset.lineHeight || dom.style.lineHeight),
})
const blockDOMAttrs = (attrs: Record<string, unknown>) => {
  const fontFamily = safeFont(attrs.fontFamily)
  const fontSize = safeSize(attrs.fontSize)
  const lineHeight = safeLineHeight(attrs.lineHeight)
  const styles = [attrs.align ? `text-align: ${attrs.align};` : '', fontFamily ? `font-family: ${fontFamily};` : '', fontSize ? `font-size: ${fontSize};` : '', lineHeight ? `line-height: ${lineHeight};` : ''].filter(Boolean)
  return {
    ...(fontFamily ? { 'data-font-family': fontFamily } : {}),
    ...(fontSize ? { 'data-font-size': fontSize } : {}),
    ...(lineHeight ? { 'data-line-height': lineHeight } : {}),
    ...(styles.length ? { style: styles.join(' ') } : {}),
  }
}

const nodes: Record<string, NodeSpec> = {
  doc: { content: 'block+' },

  paragraph: {
    content: 'inline*',
    group: 'block',
    attrs: { align: { default: null }, ...typographyAttrs },
    parseDOM: [{ tag: 'p', getAttrs: blockAttrs }],
    toDOM: (n) => ['p', blockDOMAttrs(n.attrs), 0],
  },

  heading: {
    content: 'inline*',
    group: 'block',
    defining: true,
    attrs: { level: { default: 1 }, align: { default: null }, ...typographyAttrs },
    parseDOM: [1, 2, 3].map((level) => ({ tag: `h${level}`, getAttrs: (d: HTMLElement) => ({ level, ...blockAttrs(d) }) })),
    toDOM: (n) => [`h${n.attrs.level}`, blockDOMAttrs(n.attrs), 0],
  },

  blockquote: {
    content: 'block+',
    group: 'block',
    defining: true,
    parseDOM: [{ tag: 'blockquote' }],
    toDOM: () => ['blockquote', 0],
  },

  callout: {
    content: 'block+',
    group: 'block',
    defining: true,
    attrs: { emoji: { default: '💡' } },
    parseDOM: [{ tag: 'div[data-callout]', getAttrs: (d: HTMLElement) => ({ emoji: d.dataset.callout }) }],
    toDOM: (n) => [
      'div',
      { 'data-callout': n.attrs.emoji, class: 'pn-callout' },
      ['span', { class: 'pn-callout-emoji', contenteditable: 'false' }, n.attrs.emoji],
      ['div', { class: 'pn-callout-body' }, 0],
    ],
  },

  code_block: {
    content: 'text*',
    group: 'block',
    marks: '',
    code: true,
    defining: true,
    attrs: { language: { default: '' } },
    parseDOM: [
      {
        tag: 'pre',
        preserveWhitespace: 'full',
        getAttrs: (d: HTMLElement) => ({
          language: d.dataset.language || d.querySelector('code')?.className.replace(/^language-/, '') || '',
        }),
      },
    ],
    toDOM: (n) => [
      'pre',
      { 'data-language': n.attrs.language },
      ['code', n.attrs.language ? { class: `language-${n.attrs.language}` } : {}, 0],
    ],
  },

  bullet_list: {
    content: 'list_item+',
    group: 'block',
    parseDOM: [{ tag: 'ul:not([data-task])' }],
    toDOM: () => ['ul', 0],
  },

  ordered_list: {
    content: 'list_item+',
    group: 'block',
    attrs: { start: { default: 1 } },
    parseDOM: [{ tag: 'ol', getAttrs: (d: HTMLElement) => ({ start: d.hasAttribute('start') ? +d.getAttribute('start')! : 1 }) }],
    toDOM: (n) => ['ol', n.attrs.start === 1 ? {} : { start: n.attrs.start }, 0],
  },

  list_item: {
    content: 'paragraph block*',
    defining: true,
    parseDOM: [{ tag: 'li:not([data-checked])' }],
    toDOM: () => ['li', 0],
  },

  task_list: {
    content: 'task_item+',
    group: 'block',
    parseDOM: [{ tag: 'ul[data-task]' }],
    toDOM: () => ['ul', { 'data-task': '', class: 'pn-task-list' }, 0],
  },

  task_item: {
    content: 'paragraph block*',
    defining: true,
    attrs: { checked: { default: false } },
    parseDOM: [{ tag: 'li[data-checked]', getAttrs: (d: HTMLElement) => ({ checked: d.dataset.checked === 'true' }) }],
    toDOM: (n) => [
      'li',
      { 'data-checked': String(n.attrs.checked), class: 'pn-task-item' },
      ['label', { contenteditable: 'false' }, ['input', { type: 'checkbox', ...(n.attrs.checked ? { checked: 'checked' } : {}) }]],
      ['div', 0],
    ],
  },

  horizontal_rule: {
    group: 'block',
    parseDOM: [{ tag: 'hr' }],
    toDOM: () => ['hr'],
  },

  hard_break: {
    inline: true,
    group: 'inline',
    selectable: false,
    parseDOM: [{ tag: 'br' }],
    toDOM: () => ['br'],
  },

  image: {
    group: 'block',
    draggable: true,
    attrs: { src: {}, alt: { default: '' }, title: { default: null }, width: { default: null }, align: { default: 'center' } },
    parseDOM: [
      {
        tag: 'img[src]',
        getAttrs: (d: HTMLElement) => ({
          src: d.getAttribute('src'),
          alt: d.getAttribute('alt') || '',
          title: d.getAttribute('title'),
          width: d.getAttribute('width') ? +d.getAttribute('width')! : null,
          align: d.parentElement?.dataset.align || 'center',
        }),
      },
    ],
    toDOM: (n) => [
      'figure',
      { class: 'pn-image', 'data-align': n.attrs.align },
      ['img', { src: n.attrs.src, alt: n.attrs.alt, title: n.attrs.title, ...(n.attrs.width ? { width: n.attrs.width } : {}) }],
    ],
  },

  video: {
    group: 'block',
    draggable: true,
    attrs: { src: {}, width: { default: null } },
    parseDOM: [
      {
        tag: 'video[src]',
        getAttrs: (d: HTMLElement) => ({ src: d.getAttribute('src'), width: d.getAttribute('width') ? +d.getAttribute('width')! : null }),
      },
    ],
    toDOM: (n) => [
      'figure',
      { class: 'pn-video' },
      ['video', { src: n.attrs.src, controls: 'controls', ...(n.attrs.width ? { width: n.attrs.width } : {}) }],
    ],
  },

  embed: {
    group: 'block',
    draggable: true,
    attrs: { url: {} },
    parseDOM: [{ tag: 'div[data-embed]', getAttrs: (d: HTMLElement) => ({ url: d.dataset.embed }) }],
    toDOM: (n) => [
      'div',
      { class: 'pn-embed', 'data-embed': n.attrs.url },
      [
        'iframe',
        {
          src: embedSrc(n.attrs.url),
          allowfullscreen: 'true',
          loading: 'lazy',
          frameborder: '0',
          allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture',
        },
      ],
    ],
  },

  mention: {
    inline: true,
    group: 'inline',
    atom: true,
    selectable: false,
    attrs: { id: {}, label: {} },
    leafText: (n) => `@${n.attrs.label}`,
    parseDOM: [{ tag: 'span[data-mention]', getAttrs: (d: HTMLElement) => ({ id: d.dataset.mention, label: d.dataset.label ?? d.textContent?.replace(/^@/, '') ?? '' }) }],
    toDOM: (n) => ['span', { class: 'pn-mention', 'data-mention': n.attrs.id, 'data-label': n.attrs.label }, `@${n.attrs.label}`],
  },

  /** Per-reader placeholder, e.g. {{first_name}}. `label` is what the writer sees. */
  merge_field: {
    inline: true,
    group: 'inline',
    atom: true,
    selectable: false,
    attrs: { key: {}, label: { default: null } },
    leafText: (n) => `{{${n.attrs.key}}}`,
    parseDOM: [{ tag: 'span[data-merge]', getAttrs: (d: HTMLElement) => ({ key: d.dataset.merge, label: d.dataset.label || null }) }],
    toDOM: (n) => ['span', { class: 'pn-merge', 'data-merge': n.attrs.key, 'data-label': n.attrs.label }, ['span', { class: 'pn-merge-label' }, n.attrs.label ?? n.attrs.key]],
  },

  text: { group: 'inline' },

  ...tableNodes({ tableGroup: 'block', cellContent: 'block+', cellAttributes: {} }),
}

const marks: Record<string, MarkSpec> = {
  link: {
    attrs: { href: {}, title: { default: null }, target: { default: '_blank' } },
    inclusive: false,
    parseDOM: [
      {
        tag: 'a[href]',
        getAttrs: (d: HTMLElement) => ({ href: d.getAttribute('href'), title: d.getAttribute('title'), target: d.getAttribute('target') }),
      },
    ],
    toDOM: (m) => [
      'a',
      { href: m.attrs.href, title: m.attrs.title, target: m.attrs.target, rel: m.attrs.target === '_blank' ? 'noopener noreferrer' : null },
      0,
    ],
  },
  bold: {
    parseDOM: [
      { tag: 'strong' },
      { tag: 'b', getAttrs: (d: HTMLElement) => d.style.fontWeight !== 'normal' && null },
      { style: 'font-weight', getAttrs: (v: string) => /^(bold(er)?|[5-9]\d{2})$/.test(v) && null },
    ],
    toDOM: () => ['strong', 0],
  },
  italic: {
    parseDOM: [{ tag: 'em' }, { tag: 'i' }, { style: 'font-style=italic' }],
    toDOM: () => ['em', 0],
  },
  underline: {
    parseDOM: [{ tag: 'u' }, { style: 'text-decoration=underline' }],
    toDOM: () => ['u', 0],
  },
  strike: {
    parseDOM: [{ tag: 's' }, { tag: 'del' }, { tag: 'strike' }, { style: 'text-decoration=line-through' }],
    toDOM: () => ['s', 0],
  },
  code: {
    excludes: '_',
    parseDOM: [{ tag: 'code' }],
    toDOM: () => ['code', 0],
  },
  highlight: {
    attrs: { color: { default: null } },
    parseDOM: [{ tag: 'mark', getAttrs: (d: HTMLElement) => ({ color: d.style.backgroundColor || null }) }],
    toDOM: (m) => ['mark', m.attrs.color ? { style: `background-color:${m.attrs.color}` } : {}, 0],
  },
  /** Anchors a comment thread. Threads live in your app; the doc only stores the id. */
  comment: {
    attrs: { id: {} },
    inclusive: false,
    excludes: '',
    parseDOM: [{ tag: 'span[data-comment]', getAttrs: (d: HTMLElement) => ({ id: d.dataset.comment }) }],
    toDOM: (m) => ['span', { class: 'pn-comment', 'data-comment': m.attrs.id }, 0],
  },
  color: {
    attrs: { color: {} },
    parseDOM: [{ style: 'color', getAttrs: (v: string) => (v ? { color: v } : false) }],
    toDOM: (m) => ['span', { style: `color:${m.attrs.color}` }, 0],
  },
}

export const schema = new Schema({ nodes, marks })
export type PennaSchema = typeof schema

/** Turn a share URL into an embeddable iframe src. Unknown hosts are returned as-is. */
export function embedSrc(url: string): string {
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/)
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`
  const vimeo = url.match(/vimeo\.com\/(\d+)/)
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`
  const loom = url.match(/loom\.com\/share\/(\w+)/)
  if (loom) return `https://www.loom.com/embed/${loom[1]}`
  if (/figma\.com\/(file|design|proto)\//.test(url)) return `https://www.figma.com/embed?embed_host=penna&url=${encodeURIComponent(url)}`
  const codepen = url.match(/codepen\.io\/([\w-]+)\/pen\/([\w-]+)/)
  if (codepen) return `https://codepen.io/${codepen[1]}/embed/${codepen[2]}`
  return url
}

export function isEmbeddable(url: string): boolean {
  return embedSrc(url) !== url
}

export type { DOMOutputSpec }
