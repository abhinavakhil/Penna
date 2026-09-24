import { keydownHandler } from 'prosemirror-keymap'
import { Plugin, TextSelection } from 'prosemirror-state'
import { DOMParser, DOMSerializer } from 'prosemirror-model'
import type { EditorView } from 'prosemirror-view'
import { schema } from '../schema'
import { fromMarkdown } from '../markdown'
import { prompt } from '../ui/dom'
import type { SlashItem } from '../ui/slash'
import type { PennaEditor, PennaExtension } from '../editor'

export interface Shortcut {
  id: string
  title: string
  description?: string
  /** HTML (default) or Markdown. Inserted as normal, editable content. */
  content: string
  format?: 'html' | 'markdown'
  keywords?: string[]
  /** Optional hotkey, ProseMirror style: 'Mod-Alt-b'. */
  hotkey?: string
  /** Icon name from Penna's set, or an emoji. */
  icon?: string
}

/** Ready-made blocks from the Impact Blocks / Story Coach prototypes. Plain nodes, so every cell stays editable. */
export const fundraisingShortcuts: Shortcut[] = [
  { id: 'budget', title: 'Budget breakdown', description: 'Costs that add up to your goal', icon: '💷', keywords: ['money', 'cost', 'goal'], hotkey: 'Mod-Alt-b',
    content: '<h3>Where the money goes</h3><table><tr><th><p>Item</p></th><th><p>Cost</p></th></tr><tr><td><p>Physiotherapy (12 sessions)</p></td><td><p>£2,400</p></td></tr><tr><td><p>Equipment</p></td><td><p>£900</p></td></tr><tr><td><p>Travel to appointments</p></td><td><p>£300</p></td></tr><tr><td><p><strong>Total</strong></p></td><td><p><strong>£3,600</strong></p></td></tr></table>' },
  { id: 'impact', title: 'Impact tiers', description: '“£50 pays for…” gift levels', icon: '🎯', keywords: ['tiers', 'gift', 'amount', 'donate'], hotkey: 'Mod-Alt-i',
    content: '<h3>What your gift does</h3><table><tr><th><p>Gift</p></th><th><p>What it pays for</p></th></tr><tr><td><p><strong>£20</strong></p></td><td><p>A week of travel to the clinic</p></td></tr><tr><td><p><strong>£50</strong></p></td><td><p>One hour of physiotherapy</p></td></tr><tr><td><p><strong>£150</strong></p></td><td><p>A home exercise kit</p></td></tr></table>' },
  { id: 'milestones', title: 'Milestones', description: 'Timeline donors can follow', icon: '🚩', keywords: ['timeline', 'dates', 'plan'], hotkey: 'Mod-Alt-m',
    content: '<h3>Milestones</h3><ul data-task=""><li data-checked="true"><p><strong>1 Sep</strong> · Campaign launched</p></li><li data-checked="false"><p><strong>6 Oct</strong> · First assessment</p></li><li data-checked="false"><p><strong>Nov</strong> · Rehab kit delivered</p></li><li data-checked="false"><p><strong>Jan</strong> · Back on his feet</p></li></ul>' },
  { id: 'story', title: 'Story starter', description: 'Who, why, and how to help', icon: '✍️', keywords: ['intro', 'story', 'template'],
    content: '<p>My name is ___ and I’m raising money for ___.</p><p>This matters because ___.</p><p>Your gift will pay for ___. Every share helps too.</p>' },
  { id: 'thanks', title: 'Thank-you note', description: 'Update for supporters', icon: '💌', keywords: ['update', 'thanks'],
    content: '<p>Thank you, <span data-merge="first_name" data-label="first name"></span>. We’re at <strong>£___</strong>, which means ___.</p>' },
]

export interface ShortcutsOptions {
  /** Built-in shortcuts (e.g. `fundraisingShortcuts`). */
  items?: Shortcut[]
  /** Let people save the selection as their own shortcut (default true). */
  allowCreate?: boolean
  /** Where custom shortcuts live. Default: localStorage under `penna-shortcuts`. Pass `null` to keep them in memory. */
  storageKey?: string | null
  storage?: Storage
  /** Fires whenever custom shortcuts change, so you can sync them to your backend. */
  onChange?: (custom: Shortcut[]) => void
}

export interface ShortcutsExtension extends PennaExtension {
  list(): Shortcut[]
  insert(id: string): boolean
  /** Save content (default: the current selection) as a custom shortcut. Same title overwrites. */
  create(title: string, content?: string, extra?: Partial<Shortcut>): Shortcut | null
  remove(id: string): void
}

const slug = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'shortcut'

/** Put block content at the cursor. An empty paragraph is replaced rather than left behind. */
function insertBlocks(view: EditorView, s: Shortcut) {
  const doc = s.format === 'markdown' ? fromMarkdown(s.content) : DOMParser.fromSchema(schema).parse(Object.assign(document.createElement('div'), { innerHTML: s.content }))
  const { $from } = view.state.selection
  const empty = $from.parent.isTextblock && $from.parent.content.size === 0 && $from.depth > 0
  if (!empty) { view.dispatch(view.state.tr.replaceSelection(doc.slice(0)).scrollIntoView()); view.focus(); return }
  const start = $from.before()
  const end = start + doc.content.size
  const tr = view.state.tr.replaceWith(start, $from.after(), doc.content)
  // fill-in-the-blank snippets select their first ___, everything else leaves you on a fresh line below
  let blank: [number, number] | null = null
  tr.doc.nodesBetween(start, end, (n, pos) => { const i = n.isText ? n.text!.indexOf('___') : -1; if (!blank && i >= 0) blank = [pos + i, pos + i + 3]; return !blank })
  if (blank) tr.setSelection(TextSelection.create(tr.doc, ...(blank as [number, number])))
  else {
    if (!tr.doc.resolve(end).nodeAfter?.isTextblock) tr.insert(end, schema.nodes.paragraph.create())
    tr.setSelection(TextSelection.create(tr.doc, end + 1))
  }
  view.dispatch(tr.scrollIntoView())
  view.focus()
}

/**
 * Slash-menu shortcuts: type `/budget`, `/impact` or any saved snippet to drop in editable content.
 * People can save their own from the selection bubble ("Save as shortcut").
 */
export function shortcuts(opts: ShortcutsOptions = {}): ShortcutsExtension {
  const storageKey = opts.storageKey === undefined ? 'penna-shortcuts' : opts.storageKey
  const storage = storageKey ? opts.storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined) : undefined
  let custom: Shortcut[] = []
  try { custom = JSON.parse(storage?.getItem(storageKey!) ?? '[]') } catch { custom = [] }
  let editor: PennaEditor | undefined
  const persist = () => { try { storage?.setItem(storageKey!, JSON.stringify(custom)) } catch { /* quota */ } opts.onChange?.(custom) }
  const all = () => [...(opts.items ?? []), ...custom]

  const ext: ShortcutsExtension = {
    name: 'shortcuts',
    list: all,
    insert: (id) => { const s = all().find((x) => x.id === id); if (!s || !editor) return false; insertBlocks(editor.view, s); return true },
    create: (title, content, extra = {}) => {
      if (!editor || !title.trim()) return null
      if (content == null) {
        const { from, to, empty } = editor.state.selection
        if (empty) return null
        const el = document.createElement('div')
        el.append(DOMSerializer.fromSchema(schema).serializeFragment(editor.state.doc.slice(from, to).content))
        content = el.innerHTML
      }
      const id = `my-${slug(title)}`
      const s: Shortcut = { id, title: title.trim(), description: 'My shortcut', icon: '⭐', ...extra, content }
      custom = [...custom.filter((c) => c.id !== id), s]
      persist()
      return s
    },
    remove: (id) => { custom = custom.filter((c) => c.id !== id); persist() },
    // getter: the slash menu re-reads this every time it opens, so new shortcuts show up at once
    get slashItems(): SlashItem[] {
      const items: SlashItem[] = all().map((s) => ({
        id: `shortcut-${s.id}`, title: s.title, description: s.description, icon: s.icon ?? 'plus', group: s.id.startsWith('my-') ? 'My shortcuts' : 'Shortcuts',
        keywords: [s.id, ...(s.keywords ?? [])], hotkey: s.hotkey, run: (v) => insertBlocks(v, s),
      }))
      if (opts.allowCreate !== false && custom.length) {
        items.push({ id: 'shortcut-remove', title: 'Remove a shortcut…', description: custom.map((c) => c.title).join(', '), icon: 'trash', group: 'My shortcuts', keywords: ['delete', 'shortcut'],
          run: async (v) => { const name = await prompt(`Remove which shortcut? (${custom.map((c) => c.title).join(', ')})`); const hit = custom.find((c) => c.title.toLowerCase() === name?.trim().toLowerCase()); if (hit) ext.remove(hit.id); v.focus() } })
      }
      return items
    },
    bubbleItems: opts.allowCreate === false ? [] : [{ id: 'saveShortcut', icon: 'plus', label: 'Save as shortcut', run: async (v) => {
      const title = await prompt('Name this shortcut (you’ll type /name to insert it)')
      if (title) ext.create(title)
      v.focus()
    } }],
    onCreate: (ed) => { editor = ed },
    // built per keypress from the live list, so a shortcut saved a moment ago already has its hotkey
    plugins: () => [new Plugin({ props: { handleKeyDown: (view, e) => keydownHandler(Object.fromEntries(all().filter((s) => s.hotkey).map((s) => [s.hotkey!, () => (insertBlocks(view, s), true)])))(view, e) } })],
  }
  return ext
}
