import { describe, it, expect } from 'vitest'
import './index'

describe('<penna-editor>', () => {
  it('keeps trailing whitespace when a framework echoes change back into value', () => {
    const el = document.body.appendChild(document.createElement('penna-editor'))
    el.value = '<p>Hi</p>'
    const ed = el.editor!
    ed.view.dispatch(ed.view.state.tr.insertText(' there ', ed.view.state.doc.content.size - 1))
    const html = el.value
    expect(html).toBe('<p>Hi there </p>')
    el.value = html // Angular-style [value]="html" (change)="html = $event.detail.html"
    expect(el.value).toBe('<p>Hi there </p>')
  })
})
