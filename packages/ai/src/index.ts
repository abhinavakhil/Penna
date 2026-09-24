import { keymap } from 'prosemirror-keymap'
import type { EditorView } from 'prosemirror-view'
import { h, icons, place, selectionRect, onOutside, fromMarkdown, diffHTML, type PennaExtension, type PennaEditor, type SlashItem, type MenuItem } from '@abhinavakhil/penna-core'
import { chat, type AIConfig, type ChatMessage } from './provider'

export * from './provider'

export interface AIAction {
  id: string
  title: string
  description?: string
  /** Build the prompt. `selection` is the selected text, `before` the text preceding the cursor, `doc` the full plain text. */
  prompt: (ctx: { selection: string; before: string; doc: string; input?: string }) => ChatMessage[]
  /** Where the result goes: replace the selection (default) or insert after the cursor. */
  mode?: 'replace' | 'insert'
  /** Show in the bubble menu when text is selected (default true for replace-mode actions). */
  needsSelection?: boolean
  /** Ask the user for extra input (e.g. target language) before running. */
  askInput?: string
}

const SYSTEM = 'You are a writing assistant inside a rich-text editor. Reply with only the requested text, formatted as Markdown when structure helps. No preamble, no explanations, no quotes around the answer.'
const sys = (extra: string): ChatMessage => ({ role: 'system', content: `${SYSTEM} ${extra}` })

export const defaultActions: AIAction[] = [
  { id: 'continue', title: 'Continue writing', description: 'Pick up where the text leaves off', mode: 'insert', needsSelection: false,
    prompt: ({ before }) => [sys('Continue the document naturally in the same voice. Write 1-3 paragraphs. Do not repeat the existing text.'), { role: 'user', content: before.slice(-4000) }] },
  { id: 'improve', title: 'Improve writing', description: 'Clearer, tighter, same meaning',
    prompt: ({ selection }) => [sys('Rewrite the text to be clearer and more engaging while keeping its meaning, length and formatting.'), { role: 'user', content: selection }] },
  { id: 'grammar', title: 'Fix spelling & grammar', description: 'Correct mistakes only',
    prompt: ({ selection }) => [sys('Fix spelling, grammar and punctuation. Change nothing else.'), { role: 'user', content: selection }] },
  { id: 'shorter', title: 'Make shorter', description: 'Cut it down',
    prompt: ({ selection }) => [sys('Shorten the text to roughly half its length, keeping the key points.'), { role: 'user', content: selection }] },
  { id: 'longer', title: 'Make longer', description: 'Expand with detail',
    prompt: ({ selection }) => [sys('Expand the text with more detail and examples, roughly doubling its length.'), { role: 'user', content: selection }] },
  { id: 'simplify', title: 'Simplify', description: 'Plain language',
    prompt: ({ selection }) => [sys('Rewrite in plain, simple language a 12-year-old could understand.'), { role: 'user', content: selection }] },
  { id: 'summarize', title: 'Summarize', description: 'Short summary', mode: 'insert',
    prompt: ({ selection, doc }) => [sys('Summarize the text in 2-4 sentences or a short bullet list.'), { role: 'user', content: selection || doc }] },
  { id: 'tone-professional', title: 'Professional tone', prompt: ({ selection }) => [sys('Rewrite in a professional, polished tone.'), { role: 'user', content: selection }] },
  { id: 'tone-casual', title: 'Casual tone', prompt: ({ selection }) => [sys('Rewrite in a friendly, casual tone.'), { role: 'user', content: selection }] },
  { id: 'translate', title: 'Translate…', description: 'Into any language', askInput: 'Translate to which language?',
    prompt: ({ selection, input }) => [sys(`Translate the text into ${input}. Keep formatting.`), { role: 'user', content: selection }] },
  { id: 'custom', title: 'Ask AI…', description: 'Any instruction', askInput: 'What should AI do?', needsSelection: false,
    prompt: ({ selection, before, input }) => [sys(selection ? 'Apply the instruction to the given text and return the result.' : 'Write the requested content. Use the context (preceding text) only for style and continuity.'), { role: 'user', content: selection ? `Instruction: ${input}\n\nText:\n${selection}` : `Instruction: ${input}\n\nContext:\n${before.slice(-3000)}` }] },
]

export interface AIOptions extends AIConfig {
  actions?: AIAction[]
  /** Called with the streamed result before it is inserted; return false to cancel. */
  onResult?: (text: string, action: AIAction) => boolean | void
  onError?: (err: Error) => void
}

/** Create the AI extension: `createEditor(el, { extensions: [ai({ provider: 'groq', apiKey })] })` */
export function ai(options: AIOptions): PennaExtension {
  const actions = options.actions ?? defaultActions
  let editor: PennaEditor
  let bar: HTMLElement | null = null
  let abort: AbortController | null = null
  let cleanupOutside: (() => void) | null = null

  const ctx = (view: EditorView) => {
    const { from, to } = view.state.selection
    const doc = view.state.doc
    return { selection: doc.textBetween(from, to, '\n\n'), before: doc.textBetween(0, from, '\n\n'), doc: doc.textBetween(0, doc.content.size, '\n\n') }
  }

  const close = () => { abort?.abort(); abort = null; cleanupOutside?.(); cleanupOutside = null; bar?.remove(); bar = null }

  const run = async (view: EditorView, action: AIAction, input?: string) => {
    close()
    const root = editor.root.querySelector('.pn-scroll') as HTMLElement
    const { from, to } = view.state.selection
    const mode = action.mode ?? 'replace'
    const original = view.state.doc.textBetween(from, to, '\n\n')
    const preview = h('div', { class: 'pn-ai-preview', 'aria-live': 'polite' })
    const error = h('div', { class: 'pn-ai-error' })
    const status = h('span', { class: 'pn-ai-sparkle', html: icons.sparkles })
    const title = h('span', {}, action.title)
    let text = ''
    let done = false

    const accept = () => {
      if (!text.trim()) return close()
      if (options.onResult?.(text, action) === false) return close()
      const doc = fromMarkdown(text.trim())
      const tr = view.state.tr
      if (mode === 'replace' && from !== to) tr.replaceWith(from, to, doc.content)
      else {
        const $to = view.state.doc.resolve(to)
        const insertAt = $to.parent.isTextblock && $to.parent.content.size > 0 ? $to.after() : to
        tr.insert(insertAt, doc.content)
      }
      view.dispatch(tr.scrollIntoView())
      close()
      view.focus()
    }
    const retry = () => run(view, action, input)
    const actionsRow = h('div', { class: 'pn-ai-row' },
      h('button', { type: 'button', class: 'pn-btn pn-btn-text', html: icons.check + '<span>' + (mode === 'replace' && from !== to ? 'Replace' : 'Insert') + '</span>', onclick: accept }),
      h('button', { type: 'button', class: 'pn-btn pn-btn-text', html: icons.refresh + '<span>Retry</span>', onclick: retry }),
      h('button', { type: 'button', class: 'pn-btn pn-btn-text', html: icons.copy + '<span>Copy</span>', onclick: () => navigator.clipboard?.writeText(text) }),
      h('span', { style: 'flex:1' }),
      h('button', { type: 'button', class: 'pn-btn pn-btn-text', html: icons.x + '<span>Discard</span>', onclick: () => { close(); view.focus() } }),
    )
    actionsRow.style.display = 'none'
    const el = (bar = h('div', { class: 'pn-ai-bar', role: 'dialog', 'aria-label': action.title }, h('div', { class: 'pn-ai-row' }, status, title), preview, error, actionsRow))
    root.append(el)
    place(el, selectionRect(view), root)
    cleanupOutside = onOutside(el, () => { if (done) close() })
    el.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); if (e.key === 'Enter' && done) accept() })

    abort = new AbortController()
    try {
      for await (const chunk of chat(options, action.prompt({ ...ctx(view), input }), abort.signal)) {
        text += chunk
        preview.textContent = text
        preview.scrollTop = preview.scrollHeight
      }
      done = true
      // show what the rewrite changes, word by word, before it touches the document
      if (mode === 'replace' && original) preview.innerHTML = diffHTML(original, text.trim())
      actionsRow.style.display = ''
      ;(actionsRow.firstElementChild as HTMLElement).focus()
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      done = true
      error.textContent = (err as Error).message
      actionsRow.style.display = ''
      options.onError?.(err as Error)
    }
  }

  const start = async (view: EditorView, action: AIAction) => {
    let input: string | undefined
    if (action.askInput) { input = window.prompt(action.askInput) ?? undefined; if (!input) return }
    void run(view, action, input)
  }

  /** Floating list of actions, used by bubble menu button and Mod-j. */
  const openPicker = (view: EditorView) => {
    close()
    const root = editor.root.querySelector('.pn-scroll') as HTMLElement
    const hasSel = !view.state.selection.empty
    const list = actions.filter((a) => (a.needsSelection ?? (a.mode ?? 'replace') === 'replace') ? hasSel : true)
    const input = h('input', { type: 'text', class: 'pn-input', placeholder: hasSel ? 'Ask AI to edit the selection…' : 'Ask AI to write anything…', 'aria-label': 'AI prompt' })
    const submit = () => { const q = input.value.trim(); if (!q) return; void run(view, actions.find((a) => a.id === 'custom')!, q) }
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit() } if (e.key === 'Escape') { close(); view.focus() } })
    bar = h('div', { class: 'pn-ai-bar', role: 'dialog', 'aria-label': 'AI' },
      h('div', { class: 'pn-ai-row' }, h('span', { class: 'pn-ai-sparkle', html: icons.sparkles }), input, h('button', { type: 'button', class: 'pn-btn', 'aria-label': 'Run', html: icons.check, onclick: submit })),
      h('div', { class: 'pn-slash', style: 'position:static;box-shadow:none;padding:0;max-height:240px;width:auto' },
        ...list.filter((a) => a.id !== 'custom').map((a) => h('button', { type: 'button', class: 'pn-menu-item', onmousedown: (e: Event) => e.preventDefault(), onclick: () => start(view, a) },
          h('span', { class: 'pn-menu-text' }, h('span', { class: 'pn-menu-title' }, a.title), a.description ? h('span', { class: 'pn-menu-desc' }, a.description) : null)))),
    )
    root.append(bar)
    place(bar, selectionRect(view), root)
    cleanupOutside = onOutside(bar, close)
    input.focus()
  }

  const slashItems: SlashItem[] = [
    { id: 'ai', title: 'Ask AI', description: 'Write, edit, or answer anything', icon: 'sparkles', keywords: ['ai', 'gpt', 'write', 'assistant'], group: 'AI', run: (v) => openPicker(v) },
    { id: 'ai-continue', title: 'Continue writing', description: 'AI picks up where you left off', icon: 'sparkles', keywords: ['ai', 'continue', 'more'], group: 'AI', run: (v) => start(v, actions.find((a) => a.id === 'continue')!) },
  ]
  const bubbleItems: MenuItem[] = [
    { id: 'ai', icon: 'sparkles', label: 'Ask AI', shortcut: 'Ctrl+J', run: (v) => openPicker(v) },
  ]

  return {
    name: 'ai',
    slashItems,
    bubbleItems,
    toolbarItems: ['|', { id: 'ai', icon: 'sparkles', label: 'Ask AI', shortcut: 'Ctrl+J', run: (v) => openPicker(v) }],
    plugins: () => [keymap({ 'Mod-j': (_s, _d, view) => { openPicker(view!); return true } })],
    onCreate: (ed) => { editor = ed },
    onDestroy: close,
  }
}
