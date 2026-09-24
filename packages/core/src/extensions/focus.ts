import { Plugin, PluginKey } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'
import type { PennaEditor, PennaExtension } from '../editor'

export type FocusLevel = 'sentence' | 'paragraph' | 'off'
interface State { level: FocusLevel; typewriter: boolean }
const key = new PluginKey<State>('pn-focus')

export interface FocusModeExtension extends PennaExtension {
  setLevel(level: FocusLevel): void
  setTypewriter(on: boolean): void
}

/**
 * iA Writer-style focus: everything but the current sentence (or paragraph) fades,
 * the caret line stays near the middle, and the toolbar hides while you type.
 */
export function focusMode(opts: { level?: FocusLevel; typewriter?: boolean; hideChromeWhileTyping?: boolean } = {}): FocusModeExtension {
  let editor: PennaEditor | undefined
  let idle = 0
  const set = (patch: Partial<State>) => editor?.view.dispatch(editor.view.state.tr.setMeta(key, patch))
  const wake = () => { editor?.root.classList.remove('pn-typing') }
  const typing = () => {
    if (opts.hideChromeWhileTyping === false || !editor) return
    editor.root.classList.add('pn-typing')
    clearTimeout(idle)
    idle = window.setTimeout(wake, 2500)
  }

  return {
    name: 'focusMode',
    setLevel: (level) => set({ level }),
    setTypewriter: (typewriter) => set({ typewriter }),
    onCreate: (ed) => { editor = ed; ed.root.classList.add('pn-focus-mode'); ed.root.addEventListener('mousemove', wake); ed.view.dom.addEventListener('keydown', typing) },
    onDestroy: (ed) => { clearTimeout(idle); ed.root.removeEventListener('mousemove', wake); ed.view.dom.removeEventListener('keydown', typing) },
    plugins: () => [new Plugin<State>({
      key,
      state: {
        init: () => ({ level: opts.level ?? 'sentence', typewriter: opts.typewriter ?? true }),
        apply: (tr, prev) => ({ ...prev, ...tr.getMeta(key) }),
      },
      props: {
        decorations(state) {
          const { level } = key.getState(state)!
          if (level === 'off') return null
          const { $head } = state.selection
          if ($head.depth < 1) return null
          const current = $head.before(1)
          const decos: Decoration[] = []
          state.doc.forEach((node, pos) => { if (pos !== current) decos.push(Decoration.node(pos, pos + node.nodeSize, { class: 'pn-dim' })) })
          const block = $head.parent
          if (level === 'sentence' && block.isTextblock && block.content.size) {
            const text = block.textBetween(0, block.content.size, undefined, '￼')
            const at = $head.parentOffset
            let s = 0, e = text.length
            for (let m, re = /[.!?]+["”’)]*\s+/g; (m = re.exec(text)); ) {
              const end = m.index + m[0].length
              if (end <= at) s = end; else { e = end; break }
            }
            const base = $head.start()
            if (s > 0) decos.push(Decoration.inline(base, base + s, { class: 'pn-dim' }))
            if (e < text.length) decos.push(Decoration.inline(base + e, base + text.length, { class: 'pn-dim' }))
          }
          return DecorationSet.create(state.doc, decos)
        },
      },
      view: () => ({
        update(view, prev) {
          const { typewriter } = key.getState(view.state)!
          if (!typewriter || !view.hasFocus() || prev.selection.eq(view.state.selection)) return
          const caret = view.coordsAtPos(view.state.selection.head)
          const scroller = view.dom.closest('.pn-scroll') as HTMLElement
          const own = scroller.scrollHeight > scroller.clientHeight
          const box = own ? scroller.getBoundingClientRect() : new DOMRect(0, 0, window.innerWidth, window.innerHeight)
          const delta = caret.top - (box.top + box.height * 0.45)
          if (Math.abs(delta) < 4) return
          const behavior = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
          ;(own ? scroller : window).scrollBy({ top: delta, behavior })
        },
      }),
    })],
  }
}
