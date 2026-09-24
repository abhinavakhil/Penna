import { EditorState, Plugin, TextSelection, type Transaction } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { DOMParser, DOMSerializer, Node as PMNode } from 'prosemirror-model'
import { history } from 'prosemirror-history'
import { dropCursor } from 'prosemirror-dropcursor'
import { gapCursor } from 'prosemirror-gapcursor'
import { keymap } from 'prosemirror-keymap'
import { baseKeymap } from 'prosemirror-commands'
import { tableEditing, columnResizing } from 'prosemirror-tables'
import { schema } from './schema'
import { commands, type Commands } from './commands'
import { pennaInputRules } from './inputrules'
import { pennaKeymap } from './keymap'
import { placeholderPlugin, mediaPlugin, trailingNodePlugin, taskClickPlugin, findPlugin, readonlyPlugin, readonlyKey, countWords, type UploadHandler } from './plugins'
import { toMarkdown, fromMarkdown } from './markdown'
import { renderToHTML } from './render'
import { h } from './ui/dom'
import { slashPlugin, defaultSlashItems, type SlashItem } from './ui/slash'
import { bubblePlugin, defaultBubbleItems, type MenuItem } from './ui/bubble'
import { dragHandlePlugin } from './ui/draghandle'
import { MediaView } from './ui/image'
import { tableMenuPlugin } from './ui/table'
import { createToolbar, defaultToolbarItems } from './ui/toolbar'
import { openLinkEditor, closeLinkEditor, linkHoverCard } from './ui/link'
import { toggleFindBar } from './ui/find'

export type PennaTheme = 'light' | 'dark' | 'sepia' | 'auto'
export type PennaContent = string | Record<string, unknown> | null | undefined

export interface FontFamilyOption { label: string; value: string }
export interface TypographyOptions {
  fontFamilies?: FontFamilyOption[]
  fontSizes?: string[]
  lineHeights?: string[]
  bodyFontFamily?: string
  headingFontFamily?: string
}
export const defaultFontFamilies: FontFamilyOption[] = [
  { label: 'Inter', value: 'Inter' },
  { label: 'Plus Jakarta Sans', value: 'Plus Jakarta Sans' },
  { label: 'Manrope', value: 'Manrope' },
  { label: 'DM Sans', value: 'DM Sans' },
  { label: 'IBM Plex Sans', value: 'IBM Plex Sans' },
  { label: 'Lora', value: 'Lora' },
  { label: 'Merriweather', value: 'Merriweather' },
  { label: 'Sometype Mono', value: 'Sometype Mono' },
]

export interface PennaExtension {
  name: string
  plugins?: (editor: PennaEditor) => Plugin[]
  slashItems?: SlashItem[]
  bubbleItems?: MenuItem[]
  toolbarItems?: (MenuItem | '|')[]
  onCreate?: (editor: PennaEditor) => void
  onDestroy?: (editor: PennaEditor) => void
}

export interface PennaOptions {
  /** Initial content: HTML string, Markdown (with `contentFormat: 'markdown'`), or JSON doc. */
  content?: PennaContent
  contentFormat?: 'html' | 'markdown' | 'json'
  placeholder?: string
  readonly?: boolean
  autofocus?: boolean
  /** 'auto' (default) follows a `data-theme` / `.dark` ancestor, then prefers-color-scheme. */
  theme?: PennaTheme
  /** Text direction. 'rtl' mirrors lists, quotes and menus for Arabic, Urdu, Hebrew… */
  dir?: 'ltr' | 'rtl' | 'auto'
  /** Show the fixed toolbar (default true). */
  toolbar?: boolean | (MenuItem | '|')[]
  bubbleMenu?: boolean | MenuItem[]
  slashMenu?: boolean | SlashItem[]
  dragHandle?: boolean
  statusBar?: boolean
  borderless?: boolean
  typography?: TypographyOptions
  /** Return a URL for the file. Default stores it inline as a data URL. */
  onUpload?: UploadHandler
  autosave?: { key: string; storage?: Storage; debounceMs?: number }
  extensions?: PennaExtension[]
  onUpdate?: (editor: PennaEditor) => void
  onSelectionChange?: (editor: PennaEditor) => void
  onFocus?: (editor: PennaEditor) => void
  onBlur?: (editor: PennaEditor) => void
}

type EventName = 'update' | 'selection' | 'focus' | 'blur' | 'destroy'

export class PennaEditor {
  readonly view: EditorView
  readonly root: HTMLElement
  readonly commands: Commands = commands
  readonly schema = schema
  readonly options: PennaOptions
  readonly typography: Required<Pick<TypographyOptions, 'fontFamilies' | 'fontSizes' | 'lineHeights'>> & TypographyOptions
  private listeners: Record<EventName, Set<(e: PennaEditor) => void>> = { update: new Set(), selection: new Set(), focus: new Set(), blur: new Set(), destroy: new Set() }
  private toolbar?: ReturnType<typeof createToolbar>
  private status?: HTMLElement
  private saveTimer?: number
  private linkCard?: ReturnType<typeof linkHoverCard>

  constructor(public readonly element: HTMLElement, options: PennaOptions = {}) {
    this.options = options
    const opts = options
    this.typography = {
      ...opts.typography,
      fontFamilies: opts.typography?.fontFamilies ?? defaultFontFamilies,
      fontSizes: opts.typography?.fontSizes ?? ['14px', '16px', '18px', '20px', '24px', '32px', '48px'],
      lineHeights: opts.typography?.lineHeights ?? ['1', '1.15', '1.5', '1.75', '2'],
    }
    const root = (this.root = h('div', { class: 'penna' + (opts.borderless ? ' pn-borderless' : '') }))
    if (this.typography.bodyFontFamily) root.style.setProperty('--pn-font', this.typography.bodyFontFamily)
    if (this.typography.headingFontFamily) root.style.setProperty('--pn-heading-font', this.typography.headingFontFamily)
    if (opts.theme && opts.theme !== 'auto') root.dataset.theme = opts.theme
    if (opts.dir) root.dir = opts.dir
    const scroll = h('div', { class: 'pn-scroll' })
    const mount = h('div', { class: 'pn-editor', spellcheck: 'true' })
    scroll.append(mount)
    root.append(scroll)
    element.append(root)

    const exts = opts.extensions ?? []
    const slashItems = () => [...(Array.isArray(opts.slashMenu) ? opts.slashMenu : defaultSlashItems), ...exts.flatMap((e) => e.slashItems ?? [])]
    const bubbleItems = () => [...(Array.isArray(opts.bubbleMenu) ? opts.bubbleMenu : defaultBubbleItems), ...exts.flatMap((e) => e.bubbleItems ?? [])]
    const toolbarItems = () => [...(Array.isArray(opts.toolbar) ? opts.toolbar : defaultToolbarItems), ...exts.flatMap((e) => e.toolbarItems ?? [])]

    const doc = this.parse(opts.autosave ? this.loadAutosave() ?? opts.content : opts.content, opts.contentFormat)

    const plugins: Plugin[] = [
      readonlyPlugin(!!opts.readonly),
      // menus first so they can claim Enter / arrows before the keymaps
      ...(opts.slashMenu === false ? [] : [slashPlugin(scroll, slashItems)]),
      ...(opts.bubbleMenu === false ? [] : [bubblePlugin(scroll, bubbleItems)]),
      // extensions next, so their popups (mentions, merge fields…) get keys before the base keymaps
      ...exts.flatMap((e) => e.plugins?.(this) ?? []),
      pennaInputRules,
      keymap({
        'Mod-k': (_s, _d, view) => { openLinkEditor(view!, scroll); return true },
        'Mod-f': (_s, _d, view) => { toggleFindBar(view!, root); return true },
      }),
      pennaKeymap,
      keymap(baseKeymap),
      history(),
      dropCursor({ class: 'pn-dropcursor', color: 'var(--pn-accent)', width: 2 }),
      gapCursor(),
      columnResizing(),
      tableEditing(),
      placeholderPlugin(opts.placeholder ?? "Write something, or press '/' for commands…"),
      mediaPlugin({ onUpload: opts.onUpload }),
      trailingNodePlugin(),
      taskClickPlugin(),
      findPlugin(),
      ...(opts.dragHandle === false ? [] : [dragHandlePlugin(scroll)]),
      tableMenuPlugin(scroll),
    ]

    this.view = new EditorView(mount, {
      state: EditorState.create({ doc, plugins }),
      nodeViews: {
        image: (node, view, getPos) => new MediaView(node, view, getPos),
        video: (node, view, getPos) => new MediaView(node, view, getPos),
      },
      dispatchTransaction: (tr: Transaction) => {
        const state = this.view.state.apply(tr)
        this.view.updateState(state)
        this.toolbar?.update()
        this.linkCard?.update()
        if (tr.docChanged) { this.emit('update'); this.updateStatus(); this.scheduleSave() }
        if (tr.selectionSet || tr.docChanged) this.emit('selection')
      },
      handleDOMEvents: {
        focus: () => { this.emit('focus'); return false },
        blur: () => { this.emit('blur'); return false },
      },
      attributes: { class: 'pn-editor', role: 'textbox', 'aria-multiline': 'true', 'aria-label': opts.placeholder ?? 'Rich text editor' },
    })
    // EditorView replaces mount's classes; re-apply
    this.view.dom.classList.add('pn-editor')

    if (opts.toolbar !== false) {
      this.toolbar = createToolbar(this.view, root, toolbarItems, this.typography)
      root.prepend(this.toolbar.el)
    }
    if (opts.statusBar !== false) {
      this.status = h('div', { class: 'pn-statusbar' })
      root.append(this.status)
      this.updateStatus()
    }
    this.linkCard = linkHoverCard(this.view, scroll)
    exts.forEach((e) => e.onCreate?.(this))
    if (opts.autofocus) this.focus()
  }

  // ---------- content ----------

  private parse(content: PennaContent, format?: PennaOptions['contentFormat']): PMNode {
    if (!content) return schema.topNodeType.createAndFill()!
    if (typeof content !== 'string') return PMNode.fromJSON(schema, content)
    if (format === 'markdown') return fromMarkdown(content)
    const el = document.createElement('div')
    el.innerHTML = content
    return DOMParser.fromSchema(schema).parse(el)
  }

  getJSON(): Record<string, unknown> { return this.view.state.doc.toJSON() }
  getHTML(): string {
    const frag = DOMSerializer.fromSchema(schema).serializeFragment(this.view.state.doc.content)
    const el = document.createElement('div')
    el.append(frag)
    return el.innerHTML
  }
  getMarkdown(): string { return toMarkdown(this.view.state.doc) }
  getText(): string { return this.view.state.doc.textBetween(0, this.view.state.doc.content.size, '\n\n') }
  isEmpty(): boolean { const d = this.view.state.doc; return d.childCount === 1 && d.firstChild!.isTextblock && d.firstChild!.content.size === 0 }

  setContent(content: PennaContent, format?: PennaOptions['contentFormat'], emit = true) {
    const doc = this.parse(content, format)
    const tr = this.view.state.tr.replaceWith(0, this.view.state.doc.content.size, doc.content)
    if (!emit) tr.setMeta('addToHistory', false)
    this.view.dispatch(tr)
  }
  setJSON(json: Record<string, unknown>) { this.setContent(json, 'json') }
  setHTML(html: string) { this.setContent(html, 'html') }
  setMarkdown(md: string) { this.setContent(md, 'markdown') }
  /** Insert HTML/markdown at the cursor (replacing the selection). */
  insertContent(content: string, format: 'html' | 'markdown' = 'html') {
    const doc = this.parse(content, format)
    this.view.dispatch(this.view.state.tr.replaceSelection(doc.slice(0)).scrollIntoView())
  }

  /** Static renderer, same HTML as getHTML(), no DOM required. */
  static renderToHTML = renderToHTML

  // ---------- state ----------

  get readonly(): boolean { return !!readonlyKey.getState(this.view.state) }
  set readonly(v: boolean) {
    this.view.dispatch(this.view.state.tr.setMeta(readonlyKey, v))
    this.root.classList.toggle('pn-readonly', v)
    this.toolbar?.update()
  }
  get theme(): PennaTheme { return (this.root.dataset.theme as PennaTheme) ?? 'auto' }
  set theme(t: PennaTheme) { if (t === 'auto') delete this.root.dataset.theme; else this.root.dataset.theme = t }
  get dir(): 'ltr' | 'rtl' | 'auto' { return (this.root.dir as 'ltr' | 'rtl' | 'auto') || 'ltr' }
  set dir(d: 'ltr' | 'rtl' | 'auto') { this.root.dir = d }

  /** Run any ProseMirror command against the live view. */
  exec(cmd: (state: EditorState, dispatch?: (tr: Transaction) => void, view?: EditorView) => boolean): boolean {
    return cmd(this.view.state, this.view.dispatch, this.view)
  }
  chain(...cmds: ((state: EditorState, dispatch?: (tr: Transaction) => void, view?: EditorView) => boolean)[]) {
    return cmds.every((c) => this.exec(c))
  }
  get state() { return this.view.state }
  focus(where: 'start' | 'end' = 'end') {
    this.view.focus()
    if (where === 'end' && this.isEmpty()) return
    const pos = where === 'start' ? 1 : this.view.state.doc.content.size - 1
    this.view.dispatch(this.view.state.tr.setSelection(TextSelection.near(this.view.state.doc.resolve(Math.max(0, pos)), where === 'start' ? 1 : -1)))
  }
  wordCount() { return countWords(this.view.state.doc) }
  openLinkEditor() { openLinkEditor(this.view, this.root.querySelector('.pn-scroll') as HTMLElement) }
  toggleFind() { toggleFindBar(this.view, this.root) }

  // ---------- events ----------

  on(event: EventName, fn: (editor: PennaEditor) => void): () => void {
    this.listeners[event].add(fn)
    return () => this.listeners[event].delete(fn)
  }
  off(event: EventName, fn: (editor: PennaEditor) => void) { this.listeners[event].delete(fn) }
  private emit(event: EventName) {
    this.listeners[event].forEach((fn) => fn(this))
    const opt = { update: this.options.onUpdate, selection: this.options.onSelectionChange, focus: this.options.onFocus, blur: this.options.onBlur, destroy: undefined }[event]
    opt?.(this)
  }

  // ---------- autosave / status ----------

  private storage() { return this.options.autosave?.storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined) }
  private loadAutosave(): Record<string, unknown> | undefined {
    try { const raw = this.storage()?.getItem(`penna:${this.options.autosave!.key}`); return raw ? JSON.parse(raw) : undefined } catch { return undefined }
  }
  private scheduleSave() {
    const a = this.options.autosave
    if (!a) return
    window.clearTimeout(this.saveTimer)
    this.saveTimer = window.setTimeout(() => { try { this.storage()?.setItem(`penna:${a.key}`, JSON.stringify(this.getJSON())) } catch { /* quota */ } }, a.debounceMs ?? 500)
  }
  clearAutosave() { const a = this.options.autosave; if (a) this.storage()?.removeItem(`penna:${a.key}`) }
  private updateStatus() {
    if (!this.status) return
    const c = this.wordCount()
    this.status.textContent = `${c.words} words · ${c.characters} characters · ${c.readingMinutes} min read`
  }

  destroy() {
    this.emit('destroy')
    this.options.extensions?.forEach((e) => e.onDestroy?.(this))
    closeLinkEditor()
    this.linkCard?.destroy()
    this.view.destroy()
    this.root.remove()
  }
}

export function createEditor(element: HTMLElement | string, options?: PennaOptions): PennaEditor {
  const el = typeof element === 'string' ? document.querySelector<HTMLElement>(element) : element
  if (!el) throw new Error(`[penna] mount element not found: ${element}`)
  return new PennaEditor(el, options)
}
