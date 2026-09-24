import { describe, it, expect } from 'vitest'
import { TextSelection } from 'prosemirror-state'
import { createEditor, type PennaOptions } from './editor'
import { renderToHTML } from './render'
import { fromMarkdown, toMarkdown } from './markdown'
import { diffWords, diffHTML, readability } from './text'
import { mentions, mergeFields } from './extensions/mentions'
import { proofread } from './extensions/proofread'
import { focusMode } from './extensions/focus'
import { versionHistory } from './extensions/history'
import { comments } from './extensions/comments'
import { turnIntoItems } from './ui/bubble'
import { shortcuts, fundraisingShortcuts } from './extensions/shortcuts'
import { formatHotkey } from './ui/slash'

// jsdom has no layout; popups only need a rect to position against
Range.prototype.getClientRects = () => [] as unknown as DOMRectList
Range.prototype.getBoundingClientRect = () => new DOMRect()
Element.prototype.scrollIntoView = () => {}

const make = (opts: PennaOptions) => createEditor(document.body.appendChild(document.createElement('div')), opts)
const tick = () => new Promise((r) => setTimeout(r, 0))
const selectText = (ed: ReturnType<typeof make>, needle: string) => {
  let from = -1
  ed.state.doc.descendants((n, pos) => { if (from < 0 && n.isText && n.text!.includes(needle)) from = pos + n.text!.indexOf(needle) })
  ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, from, from + needle.length)))
}

describe('inline nodes', () => {
  it('merge fields round-trip through markdown, HTML, text and SSR', () => {
    const md = 'Thank you, {{first_name}}!'
    expect(toMarkdown(fromMarkdown(md))).toBe(md)
    const ed = make({ content: md, contentFormat: 'markdown' })
    expect(ed.getText()).toBe('Thank you, {{first_name}}!')
    expect(ed.getHTML()).toContain('data-merge="first_name"')
    expect(renderToHTML(ed.getJSON())).toBe(ed.getHTML())
    ed.setHTML(ed.getHTML())
    expect(ed.getMarkdown()).toBe(md)
  })
  it('mentions and comments keep SSR parity; clear formatting keeps comments', () => {
    const html = '<p>Hi <span class="pn-mention" data-mention="u1" data-label="Aisha">@Aisha</span>, <span class="pn-comment" data-comment="t1">check this</span></p>'
    const ed = make({ content: html })
    expect(ed.getHTML()).toBe(html)
    expect(renderToHTML(ed.getJSON())).toBe(html)
    expect(ed.getMarkdown().trim()).toBe('Hi @Aisha, check this')
    ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, 1, ed.state.doc.content.size - 1)))
    ed.exec(ed.commands.clearFormatting)
    expect(ed.getHTML()).toContain('data-comment="t1"')
  })
})

describe('commands', () => {
  it('insertStarter drops a paragraph and selects the blank', () => {
    const ed = make({ content: '<p>Intro</p>' })
    ed.exec(ed.commands.insertStarter('My name is ___ and I am raising money for ___.'))
    const { from, to } = ed.state.selection
    expect(ed.state.doc.textBetween(from, to)).toBe('___')
    expect(ed.state.doc.childCount).toBeGreaterThanOrEqual(2)
  })
  it('turn into Text unwraps a list', () => {
    const ed = make({ content: '<ul><li><p>item</p></li></ul>' })
    ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, 3)))
    turnIntoItems.find((t) => t.id === 'paragraph')!.run(ed.view)
    expect(ed.getHTML()).toBe('<p>item</p><p></p>') // trailing paragraph added after the old list
  })
})

describe('text utils', () => {
  it('diffs words', () => {
    expect(diffWords('the quick fox', 'the slow fox')).toEqual([{ type: 'same', text: 'the ' }, { type: 'del', text: 'quick' }, { type: 'add', text: 'slow' }, { type: 'same', text: ' fox' }])
    expect(diffHTML('a <b>', 'a <i>')).toBe('a <del class="pn-diff">&lt;b&gt;</del><ins class="pn-diff">&lt;i&gt;</ins>')
  })
  it('scores readability', () => {
    expect(readability('The cat sat. It was warm.').grade).toBeLessThan(3)
    expect(readability('Notwithstanding considerable institutional complexity, organisational transformation necessitates comprehensive stakeholder engagement.').grade).toBeGreaterThan(12)
    expect(readability('').words).toBe(0)
  })
})

describe('extensions', () => {
  it('proofread flags, fixes and dismisses without touching saved HTML', () => {
    let score = -1
    const pr = proofread({ onChange: (s) => { score = s.score } })
    const ed = make({ content: '<p>We definately need help in order to finish.</p>', extensions: [pr] })
    const before = ed.getHTML()
    const s = pr.summary()
    expect(s.counts.correctness).toBe(1)
    expect(s.counts.clarity).toBe(1)
    expect(ed.root.querySelectorAll('.pn-proof').length).toBe(2)
    expect(ed.getHTML()).toBe(before)
    pr.fixAll()
    expect(ed.getText()).toBe('We definitely need help to finish.')
    expect(pr.summary().issues).toHaveLength(0)
    expect(score).toBe(100)
    ed.setHTML('<p>I think maybe we go.</p>')
    pr.fixAll()
    expect(ed.getText()).toBe('We go.')
    pr.setCategory('long', false)
    ed.setHTML(`<p>${'word '.repeat(40)}end.</p>`)
    expect(pr.summary().counts.long).toBe(0)
    pr.setCategory('long', true)
    expect(pr.summary().counts.long).toBe(1)
  })
  it('focus mode dims everything but the current sentence', () => {
    const fm = focusMode({ typewriter: false })
    const ed = make({ content: '<p>One. Two three.</p><p>Other.</p>', extensions: [fm] })
    ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, 8)))
    const dims = ed.root.querySelectorAll('.pn-dim')
    expect([...dims].map((d) => d.textContent)).toEqual(['One. ', 'Other.'])
    fm.setLevel('off')
    expect(ed.root.querySelectorAll('.pn-dim').length).toBe(0)
  })
  it('version history snapshots, compares and restores', () => {
    const vh = versionHistory({ idleMs: 0 })
    const ed = make({ content: '<p>first draft</p>', extensions: [vh] })
    vh.save('v1')
    ed.setHTML('<p>second draft</p>')
    const v1 = vh.list().find((v) => v.name === 'v1')!
    expect(vh.compare(v1.id)).toContain('<del class="pn-diff">first</del><ins class="pn-diff">second</ins>')
    vh.restore(v1.id)
    expect(ed.getText()).toBe('first draft')
    expect(vh.list()[0].name).toBe('Before restore')
    vh.toggle(true)
    expect(ed.root.querySelector('.pn-history')).toBeTruthy()
  })
  it('comments anchor, list and resolve', () => {
    let added = ''
    const cm = comments({ onAdd: (c) => { added = c.quote } })
    const ed = make({ content: '<p>Please verify this claim today.</p>', extensions: [cm] })
    selectText(ed, 'this claim')
    const id = cm.add()!
    expect(added).toBe('this claim')
    expect(cm.list()).toEqual([expect.objectContaining({ id, quote: 'this claim' })])
    cm.resolve(id)
    expect(cm.list()).toHaveLength(0)
    expect(ed.getHTML()).toBe('<p>Please verify this claim today.</p>')
  })
  it('@ opens the mention menu and Enter inserts a mention', async () => {
    const ed = make({ content: '<p>Hi</p>', extensions: [mentions({ items: (q) => [{ id: 'u1', label: 'Aisha Khan' }, { id: 'u2', label: 'Tom' }].filter((u) => u.label.toLowerCase().includes(q.toLowerCase())) })] })
    ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, 3)))
    for (const ch of ' @ai') ed.view.dispatch(ed.state.tr.insertText(ch))
    await tick()
    expect(ed.root.querySelector('.pn-suggest')?.textContent).toContain('Aisha Khan')
    ed.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(ed.getHTML()).toBe('<p>Hi <span class="pn-mention" data-mention="u1" data-label="Aisha Khan">@Aisha Khan</span> </p>')
    expect(ed.root.querySelector('.pn-suggest')).toBeNull()
  })
  it('merge field preview swaps labels for values', async () => {
    const mf = mergeFields({ fields: [{ key: 'first_name', label: 'first name' }] })
    const ed = make({ content: 'Hi {{first_name}}', contentFormat: 'markdown', extensions: [mf] })
    mf.setPreview({ first_name: 'Aisha' })
    expect(ed.root.querySelector('.pn-merge')?.getAttribute('data-preview')).toBe('Aisha')
    expect(ed.getHTML()).not.toContain('Aisha')
    mf.setPreview(null)
    expect(ed.root.querySelector('.pn-merge')?.hasAttribute('data-preview')).toBe(false)
  })
})

describe('shortcuts', () => {
  const typeIn = (ed: ReturnType<typeof make>, text: string) => { for (const ch of text) ed.view.dispatch(ed.state.tr.insertText(ch)) }
  it('/budget in the slash menu drops in an editable table, replacing the empty line', () => {
    const ed = make({ content: '<p>Intro</p><p></p>', extensions: [shortcuts({ items: fundraisingShortcuts, storageKey: null })] })
    ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, 8)))
    typeIn(ed, '/budget')
    expect(ed.root.querySelector('.pn-slash')?.textContent).toContain('Budget breakdown')
    expect(ed.root.querySelector('.pn-menu-kbd')?.textContent).toMatch(/Alt/)
    ed.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(ed.getHTML()).toMatch(/^<p>Intro<\/p><h3>Where the money goes<\/h3><table>/)
    expect(ed.getHTML()).not.toContain('/budget')
    // cursor lands on a fresh line after the table, so the next hotkey doesn't nest inside it
    expect(ed.state.selection.$from.parent.type.name).toBe('paragraph')
    expect(ed.state.selection.$from.depth).toBe(1)
  })
  it('fill-in-the-blank shortcuts select the first ___', () => {
    const ed = make({ content: '<p></p>', extensions: [shortcuts({ items: fundraisingShortcuts, storageKey: null })] })
    ;(ed.options.extensions![0] as ReturnType<typeof shortcuts>).insert('story')
    const { from, to } = ed.state.selection
    expect(ed.state.doc.textBetween(from, to)).toBe('___')
  })
  it('hotkeys insert shortcuts', () => {
    const sc = shortcuts({ items: fundraisingShortcuts, storageKey: null })
    const ed = make({ content: '<p></p>', extensions: [sc] })
    ed.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'i', ctrlKey: true, altKey: true, bubbles: true }))
    expect(ed.getHTML()).toContain('What your gift does')
  })
  it('people can save the selection as their own shortcut, reuse, persist and remove it', () => {
    const store = new Map<string, string>()
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) } as unknown as Storage
    const sc = shortcuts({ storage })
    const ed = make({ content: '<p>Our <strong>bank details</strong> are below.</p><p></p>', extensions: [sc] })
    ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, 1, 17))) // "Our bank details"
    const saved = sc.create('Bank', undefined, { hotkey: 'Mod-Alt-k' })!
    expect(saved.content).toBe('Our <strong>bank details</strong>')
    expect(sc.slashItems!.map((i) => i.title)).toContain('Bank')
    ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, ed.state.doc.content.size - 1)))
    ed.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, altKey: true, bubbles: true }))
    expect(ed.getHTML()).toBe('<p>Our <strong>bank details</strong> are below.</p><p>Our <strong>bank details</strong></p><p></p>')
    expect(shortcuts({ storage }).list().map((s) => s.title)).toEqual(['Bank'])
    sc.remove(saved.id)
    expect(shortcuts({ storage }).list()).toEqual([])
  })
  it('formats hotkeys for display', () => {
    expect(formatHotkey('Mod-Alt-t')).toBe('Ctrl+Alt+T')
  })
})

describe('theme and direction', () => {
  it('accepts sepia and rtl', () => {
    const ed = make({ theme: 'sepia', dir: 'rtl' })
    expect(ed.root.dataset.theme).toBe('sepia')
    expect(ed.root.dir).toBe('rtl')
    ed.theme = 'auto'
    expect(ed.root.hasAttribute('data-theme')).toBe(false)
  })
})
