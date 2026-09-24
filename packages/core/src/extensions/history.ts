import { h } from '../ui/dom'
import { icons } from '../ui/icons'
import { diffHTML } from '../text'
import type { PennaEditor, PennaExtension } from '../editor'

export interface Version { id: string; at: number; name?: string; author?: string; auto: boolean; json: Record<string, unknown>; text: string }

export interface VersionHistoryOptions {
  /** Persist versions in localStorage (or `storage`) under this key. Omit to keep them in memory. */
  key?: string
  storage?: Storage
  /** Autosave after this long without typing (ms, default 2000). 0 disables autosave. */
  idleMs?: number
  /** Keep at most this many versions; oldest autosaves go first (default 50). */
  max?: number
  author?: string
  onChange?: (versions: Version[]) => void
}

export interface VersionHistoryExtension extends PennaExtension {
  list(): Version[]
  save(name?: string): Version | undefined
  rename(id: string, name: string): void
  /** Word diff between a version and the current text, as HTML with <ins>/<del>. */
  compare(id: string): string
  /** Restoring saves the current state first, so a restore can itself be undone. */
  restore(id: string): void
  toggle(open?: boolean): void
}

const ago = (t: number) => {
  const s = Math.round((Date.now() - t) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  return new Date(t).toLocaleDateString()
}

/** Google Docs-style version history with a built-in panel (toolbar clock button). */
export function versionHistory(opts: VersionHistoryOptions = {}): VersionHistoryExtension {
  const storage = opts.key ? opts.storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined) : undefined
  const storeKey = `penna-history:${opts.key}`
  const max = opts.max ?? 50
  let versions: Version[] = []
  try { versions = JSON.parse(storage?.getItem(storeKey) ?? '[]') } catch { versions = [] }
  let editor: PennaEditor | undefined
  let timer = 0
  let panel: HTMLElement | null = null
  let preview: HTMLElement | null = null
  let selected: string | null = null
  let off: (() => void) | undefined

  const persist = () => {
    try { storage?.setItem(storeKey, JSON.stringify(versions)) } catch { /* quota */ }
    opts.onChange?.(versions)
    renderPanel()
  }
  const snapshot = (name: string | undefined, auto: boolean): Version | undefined => {
    if (!editor) return
    const text = editor.getText()
    if (auto && versions[0]?.text === text) return
    const v: Version = { id: Math.random().toString(36).slice(2, 10), at: Date.now(), name, author: opts.author, auto, json: editor.getJSON(), text }
    versions.unshift(v)
    while (versions.length > max) {
      const i = versions.map((x) => x.auto).lastIndexOf(true)
      versions.splice(i >= 0 ? i : versions.length - 1, 1)
    }
    persist()
    return v
  }
  const byId = (id: string) => versions.find((v) => v.id === id)

  const showPreview = (id: string | null) => {
    selected = id
    preview?.remove(); preview = null
    editor?.root.classList.toggle('pn-history-previewing', !!id)
    const v = id ? byId(id) : undefined
    if (v && editor) {
      preview = h('div', { class: 'pn-history-preview', 'aria-live': 'polite' },
        h('div', { class: 'pn-history-note' }, `Showing changes from ${v.name ?? 'Autosave'} (${ago(v.at)}) to now. `, h('ins', { class: 'pn-diff' }, 'Added since'), ' ', h('del', { class: 'pn-diff' }, 'Removed since')),
        h('div', { class: 'pn-history-diff', html: diffHTML(v.text, editor.getText()) }))
      editor.root.querySelector('.pn-scroll')!.append(preview)
    }
    renderPanel()
  }

  const renderPanel = () => {
    if (!panel || !editor) return
    panel.innerHTML = ''
    const name = h('input', { type: 'text', class: 'pn-input', placeholder: 'Name this version…', 'aria-label': 'Version name' })
    const saveNamed = () => { snapshot(name.value.trim() || 'Named version', false) }
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveNamed() })
    panel.append(...([
      h('div', { class: 'pn-history-head' }, h('b', {}, 'Version history'), h('button', { type: 'button', class: 'pn-btn', 'aria-label': 'Close history', html: icons.x, onclick: () => ext.toggle(false) })),
      h('div', { class: 'pn-ai-row' }, name, h('button', { type: 'button', class: 'pn-btn pn-btn-text', onclick: saveNamed }, 'Save')),
      h('button', { type: 'button', class: 'pn-history-item' + (selected ? '' : ' pn-selected'), onclick: () => showPreview(null) }, h('b', {}, 'Now'), h('small', {}, 'Current version')),
      ...versions.map((v) => h('button', { type: 'button', class: 'pn-history-item' + (v.id === selected ? ' pn-selected' : '') + (v.auto ? '' : ' pn-named'), onclick: () => showPreview(v.id) },
        h('b', {}, v.name ?? 'Autosave'), h('small', {}, [ago(v.at), v.author].filter(Boolean).join(' · ')))),
      selected ? h('button', { type: 'button', class: 'pn-btn pn-btn-text pn-btn-primary', html: icons.undo + '<span>Restore this version</span>', onclick: () => ext.restore(selected!) }) : null,
    ].filter(Boolean) as HTMLElement[]))
  }

  const ext: VersionHistoryExtension = {
    name: 'versionHistory',
    list: () => versions,
    save: (name) => snapshot(name, !name),
    rename: (id, name) => { const v = byId(id); if (v) { v.name = name; v.auto = false; persist() } },
    compare: (id) => { const v = byId(id); return v && editor ? diffHTML(v.text, editor.getText()) : '' },
    restore: (id) => {
      const v = byId(id)
      if (!v || !editor) return
      snapshot('Before restore', false)
      editor.setContent(v.json, 'json')
      showPreview(null)
    },
    toggle: (open) => {
      if (!editor) return
      const want = open ?? !panel
      if (!want) { panel?.remove(); panel = null; showPreview(null); return }
      if (panel) return
      panel = h('aside', { class: 'pn-history', role: 'complementary', 'aria-label': 'Version history' })
      editor.root.append(panel)
      renderPanel()
    },
    toolbarItems: ['|', { id: 'history', icon: 'history', label: 'Version history', isActive: () => !!panel, run: () => ext.toggle() }],
    onCreate: (ed) => {
      editor = ed
      if (!versions.length) snapshot('Opened', true)
      if (opts.idleMs !== 0) off = ed.on('update', () => { clearTimeout(timer); timer = window.setTimeout(() => snapshot(undefined, true), opts.idleMs ?? 2000) })
    },
    onDestroy: () => { clearTimeout(timer); off?.(); panel?.remove(); preview?.remove() },
  }
  return ext
}
