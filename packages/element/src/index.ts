import { createEditor, type PennaEditor, type PennaOptions } from '@abhinavakhil/penna-core'

/**
 * `<penna-editor>` — works in plain HTML, Angular, Svelte, Solid, Lit, anything.
 *
 *   <penna-editor placeholder="Write…" theme="dark" dir="rtl" value="<p>Hello</p>"></penna-editor>
 *   el.addEventListener('change', e => console.log(e.detail.html))
 *   el.editor            // the PennaEditor instance
 *   el.options = {...}   // set full PennaOptions (extensions, onUpload…) before it connects
 */
export class PennaElement extends HTMLElement {
  static observedAttributes = ['value', 'placeholder', 'readonly', 'theme', 'dir', 'format', 'toolbar', 'autosave-key']
  editor: PennaEditor | null = null
  /** Full options object; attributes override the matching keys. */
  options: PennaOptions = {}
  private _value: string | null = null
  private _format: 'html' | 'markdown' | 'json' = 'html'

  connectedCallback() {
    if (this.editor) return
    this._format = (this.getAttribute('format') as typeof this._format) || this.options.contentFormat || 'html'
    const raw = this._value ?? this.getAttribute('value') ?? this.options.content ?? (this.textContent?.trim() || null)
    this.textContent = ''
    const content = this._format === 'json' && typeof raw === 'string' ? JSON.parse(raw) : raw
    this.editor = createEditor(this, {
      ...this.options,
      content,
      contentFormat: this._format,
      placeholder: this.getAttribute('placeholder') ?? this.options.placeholder,
      readonly: this.hasAttribute('readonly') || this.options.readonly,
      theme: (this.getAttribute('theme') as PennaOptions['theme']) ?? this.options.theme,
      dir: (this.getAttribute('dir') as PennaOptions['dir']) ?? this.options.dir,
      toolbar: this.getAttribute('toolbar') === 'false' ? false : this.options.toolbar,
      autosave: this.getAttribute('autosave-key') ? { key: this.getAttribute('autosave-key')! } : this.options.autosave,
      onUpdate: (ed) => {
        this.options.onUpdate?.(ed)
        this.dispatchEvent(new CustomEvent('change', { detail: { html: ed.getHTML(), json: ed.getJSON(), markdown: ed.getMarkdown(), editor: ed }, bubbles: true }))
      },
      onFocus: (ed) => { this.options.onFocus?.(ed); this.dispatchEvent(new CustomEvent('editor-focus', { bubbles: true })) },
      onBlur: (ed) => { this.options.onBlur?.(ed); this.dispatchEvent(new CustomEvent('editor-blur', { bubbles: true })) },
    })
    this.dispatchEvent(new CustomEvent('ready', { detail: { editor: this.editor } }))
  }

  disconnectedCallback() { this.editor?.destroy(); this.editor = null }

  attributeChangedCallback(name: string, _old: string | null, val: string | null) {
    if (!this.editor) return
    if (name === 'readonly') this.editor.readonly = val != null
    if (name === 'theme') this.editor.theme = (val as PennaOptions['theme']) ?? 'auto'
    if (name === 'dir') this.editor.dir = (val as PennaOptions['dir']) ?? 'ltr'
    if (name === 'value' && val != null && val !== this.value) this.value = val
  }

  /** Current content in the element's `format` (html by default). */
  get value(): string {
    if (!this.editor) return this._value ?? ''
    return this._format === 'markdown' ? this.editor.getMarkdown() : this._format === 'json' ? JSON.stringify(this.editor.getJSON()) : this.editor.getHTML()
  }
  set value(v: string) {
    this._value = v
    if (!this.editor) return
    if (v === this.value) return // frameworks echo `change` back into `value`; re-parsing would drop trailing whitespace and the caret
    const content = this._format === 'json' ? JSON.parse(v) : v
    this.editor.setContent(content, this._format, false)
  }
  get html() { return this.editor?.getHTML() ?? '' }
  get json() { return this.editor?.getJSON() ?? null }
  get markdown() { return this.editor?.getMarkdown() ?? '' }
}

export function definePennaElement(tag = 'penna-editor') {
  if (typeof customElements !== 'undefined' && !customElements.get(tag)) customElements.define(tag, PennaElement)
}
definePennaElement()

declare global {
  interface HTMLElementTagNameMap { 'penna-editor': PennaElement }
}
export type { PennaEditor, PennaOptions }
