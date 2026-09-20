import { describe, it, expect } from 'vitest'
import { createEditor } from './editor'
import { renderToHTML } from './render'
import { toMarkdown, fromMarkdown } from './markdown'
import { embedSrc, schema } from './schema'
import { TextSelection } from 'prosemirror-state'

const html = `<h1>Title</h1><p>Hello <strong>bold <em>both</em></strong> and <a href="https://x.io" target="_blank" rel="noopener noreferrer">link</a>.</p><ul><li><p>one</p></li><li><p>two</p></li></ul><ul data-task="" class="pn-task-list"><li data-checked="true" class="pn-task-item"><label contenteditable="false"><input type="checkbox" checked="checked"></label><div><p>done</p></div></li></ul><blockquote><p>quote</p></blockquote><pre data-language="js"><code class="language-js">let x = 1</code></pre><hr><figure class="pn-image" data-align="center"><img src="/a.png" alt="A"></figure><table><tbody><tr><th><p>h</p></th></tr><tr><td><p>c</p></td></tr></tbody></table>`

describe('core', () => {
  const ed = createEditor(document.body.appendChild(document.createElement('div')), { content: html })

  it('html round trip', () => {
    expect(ed.getHTML()).toBe(html.replace('<table><tbody>', '<table><tbody>'))
  })
  it('json round trip', () => {
    ed.setHTML(html) // trailing-node plugin normalises the doc
    const json = ed.getJSON()
    ed.setJSON(json)
    expect(ed.getJSON()).toEqual(json)
  })
  it('keeps old JSON compatible and preserves block typography', () => {
    const old = schema.nodeFromJSON({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'old' }] }] })
    expect(old.firstChild?.attrs).toMatchObject({ align: null, fontFamily: null, fontSize: null, lineHeight: null })

    ed.setHTML('<h1 style="font-family: Manrope; font-size: 42px; line-height: 1.1">Title</h1><p style="font-family: Lora; font-size: 18px; line-height: 1.6">Body</p>')
    expect(ed.getJSON()).toMatchObject({ content: [
      { attrs: { level: 1, fontFamily: 'Manrope', fontSize: '42px', lineHeight: '1.1' } },
      { attrs: { fontFamily: 'Lora', fontSize: '18px', lineHeight: '1.6' } },
    ] })
    expect(ed.getHTML()).toContain('data-font-family="Manrope"')
    expect(renderToHTML(ed.getJSON())).toBe(ed.getHTML())
    ed.setHTML(html)
  })
  it('renderToHTML matches editor HTML (SSR parity)', () => {
    expect(renderToHTML(ed.getJSON())).toBe(ed.getHTML())
  })
  it('markdown round trip', () => {
    const md = '# Title\n\nHello **bold** and [link](https://x.io).\n\n* one\n* two\n\n- [x] done\n\n> quote\n\n```js\nlet x = 1\n```\n\n---\n\n![A](/a.png)\n\n| h |\n| --- |\n| c |\n'
    const doc = fromMarkdown(md)
    expect(toMarkdown(doc)).toBe(md)
  })
  it('word count', () => {
    expect(ed.wordCount().words).toBeGreaterThan(5)
  })
  it('commands', () => {
    ed.setHTML('<p>abc</p>')
    ed.exec(ed.commands.heading(2))
    expect(ed.getHTML()).toBe('<h2>abc</h2>')
    ed.exec(ed.commands.table(2, 2))
    expect(ed.getHTML()).toContain('<table>')
  })
  it('applies typography to the current block and across a range', () => {
    ed.setHTML('<p>one</p><h2>two</h2><blockquote><p>three</p></blockquote>')
    ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, 2)))
    ed.exec(ed.commands.fontFamily('Lora'))
    expect((ed.getJSON() as any).content[0].attrs).toMatchObject({ fontFamily: 'Lora' })

    ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, 1, ed.state.doc.content.size - 1)))
    ed.exec(ed.commands.fontSize('20px'))
    ed.exec(ed.commands.lineHeight('1.5'))
    const json = ed.getJSON() as any
    expect(json.content[0].attrs).toMatchObject({ fontSize: '20px', lineHeight: '1.5' })
    expect(json.content[1].attrs).toMatchObject({ fontSize: '20px', lineHeight: '1.5' })
    expect(json.content[2]).not.toHaveProperty('attrs')
    expect(json.content[2].content[0].attrs).toMatchObject({ fontSize: '20px', lineHeight: '1.5' })
    ed.setHTML(html)
  })
  it('renders configured typography controls and applies their values', () => {
    const mount = document.body.appendChild(document.createElement('div'))
    const custom = createEditor(mount, {
      content: '<p>custom</p>',
      typography: { fontFamilies: [{ label: 'Brand Sans', value: 'Brand Sans' }], fontSizes: ['17px'], lineHeights: ['1.4'] },
    })
    const font = custom.root.querySelector<HTMLSelectElement>('select[aria-label="Font family"]')
    const size = custom.root.querySelector<HTMLSelectElement>('select[aria-label="Font size"]')
    const line = custom.root.querySelector<HTMLSelectElement>('select[aria-label="Line height"]')
    expect(Array.from(font?.options ?? []).map((option) => option.value)).toContain('Brand Sans')
    expect(Array.from(size?.options ?? []).map((option) => option.value)).toContain('17px')
    expect(Array.from(line?.options ?? []).map((option) => option.value)).toContain('1.4')
    font!.value = 'Brand Sans'
    font!.dispatchEvent(new Event('change'))
    expect((custom.getJSON() as any).content[0].attrs.fontFamily).toBe('Brand Sans')
    custom.destroy()
    mount.remove()
  })
  it('readonly', () => {
    ed.readonly = true
    expect(ed.view.editable).toBe(false)
    ed.readonly = false
  })
  it('embedSrc', () => {
    expect(embedSrc('https://youtu.be/dQw4w9WgXcQ')).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ')
    expect(embedSrc('https://example.com')).toBe('https://example.com')
  })
})
