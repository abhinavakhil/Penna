import type { NodeView, EditorView } from 'prosemirror-view'
import { NodeSelection } from 'prosemirror-state'
import type { Node as PMNode } from 'prosemirror-model'
import { h } from './dom'
import { icons } from './icons'

/** Image / video with drag-to-resize handles, alignment + alt text toolbar when selected. */
export class MediaView implements NodeView {
  dom: HTMLElement
  private media: HTMLImageElement | HTMLVideoElement
  private bar: HTMLElement

  constructor(private node: PMNode, private view: EditorView, private getPos: () => number | undefined) {
    const isImg = node.type.name === 'image'
    this.media = isImg ? h('img', { src: node.attrs.src, alt: node.attrs.alt, title: node.attrs.title, draggable: 'false' }) : h('video', { src: node.attrs.src, controls: '' })
    this.dom = h('figure', { class: isImg ? 'pn-image' : 'pn-video', 'data-align': node.attrs.align ?? 'center' }, this.media)
    this.bar = h('div', { class: 'pn-menu pn-media-bar', contenteditable: 'false' })
    if (isImg) {
      for (const [a, icon] of [['left', 'alignLeft'], ['center', 'alignCenter'], ['right', 'alignRight']] as const)
        this.bar.append(h('button', { type: 'button', class: 'pn-btn', 'aria-label': `Align ${a}`, title: `Align ${a}`, html: icons[icon], onmousedown: (e: Event) => e.preventDefault(), onclick: () => this.update_({ align: a }) }))
      this.bar.append(h('button', { type: 'button', class: 'pn-btn', 'aria-label': 'Alt text', title: 'Alt text', html: icons.text, onmousedown: (e: Event) => e.preventDefault(), onclick: () => { const alt = window.prompt('Alt text', node.attrs.alt); if (alt != null) this.update_({ alt }) } }))
    }
    this.bar.append(h('button', { type: 'button', class: 'pn-btn', 'aria-label': 'Reset size', title: 'Reset size', html: icons.refresh, onmousedown: (e: Event) => e.preventDefault(), onclick: () => this.update_({ width: null }) }))
    this.bar.append(h('button', { type: 'button', class: 'pn-btn', 'aria-label': 'Delete', title: 'Delete', html: icons.trash, onmousedown: (e: Event) => e.preventDefault(), onclick: () => { const p = getPos(); if (p != null) view.dispatch(view.state.tr.delete(p, p + this.node.nodeSize)) } }))
    for (const side of ['left', 'right'] as const) {
      const handle = h('span', { class: `pn-resize pn-resize-${side}`, contenteditable: 'false' })
      handle.addEventListener('mousedown', (e) => this.startResize(e, side))
      this.dom.append(handle)
    }
    this.applyWidth()
  }

  private applyWidth() {
    const w = this.node.attrs.width
    this.media.style.width = w ? `${w}px` : ''
    this.media.removeAttribute('width')
    if (w) this.media.setAttribute('width', String(w))
  }

  private update_(attrs: Record<string, unknown>) {
    const pos = this.getPos()
    if (pos == null) return
    this.view.dispatch(this.view.state.tr.setNodeMarkup(pos, undefined, { ...this.node.attrs, ...attrs }))
  }

  private startResize(e: MouseEvent, side: 'left' | 'right') {
    e.preventDefault()
    const startX = e.clientX, startW = this.media.getBoundingClientRect().width
    const max = this.view.dom.clientWidth
    const move = (ev: MouseEvent) => {
      const delta = (ev.clientX - startX) * (side === 'right' ? 1 : -1) * (this.node.attrs.align === 'center' ? 2 : 1)
      const w = Math.max(60, Math.min(max, Math.round(startW + delta)))
      this.media.style.width = `${w}px`
    }
    const up = () => {
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup', up)
      this.update_({ width: Math.round(this.media.getBoundingClientRect().width) })
    }
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)
  }

  selectNode() { this.dom.classList.add('pn-selected'); this.dom.append(this.bar) }
  deselectNode() { this.dom.classList.remove('pn-selected'); this.bar.remove() }
  update(node: PMNode) {
    if (node.type !== this.node.type) return false
    this.node = node
    this.dom.dataset.align = node.attrs.align ?? 'center'
    if (this.media.getAttribute('src') !== node.attrs.src) this.media.setAttribute('src', node.attrs.src)
    if (this.media instanceof HTMLImageElement) { this.media.alt = node.attrs.alt ?? ''; if (node.attrs.title) this.media.title = node.attrs.title }
    this.applyWidth()
    return true
  }
  stopEvent(e: Event) { return e.type.startsWith('mouse') && (e.target as HTMLElement).closest('.pn-resize, .pn-media-bar') != null }
  ignoreMutation() { return true }
}

export const selectMedia = (view: EditorView, pos: number) => view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)))
