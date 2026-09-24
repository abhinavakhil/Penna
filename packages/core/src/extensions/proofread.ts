import { Plugin, PluginKey, type EditorState } from 'prosemirror-state'
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view'
import { h, place, onOutside } from '../ui/dom'
import { icons } from '../ui/icons'
import type { PennaEditor, PennaExtension } from '../editor'

export type ProofCategory = 'correctness' | 'clarity' | 'engagement' | 'delivery' | 'long'
export interface ProofRule { category: Exclude<ProofCategory, 'long'>; pattern: RegExp; replace: string; message: string }
export interface ProofIssue { from: number; to: number; text: string; category: ProofCategory; replace?: string; message: string }
export interface ProofSummary { score: number; issues: ProofIssue[]; counts: Record<ProofCategory, number> }

export const proofCategoryLabels: Record<ProofCategory, string> = { correctness: 'Correctness', clarity: 'Clarity', engagement: 'Engagement', delivery: 'Delivery', long: 'Hard-to-read sentences' }

const typos: Record<string, string> = { wich: 'which', definately: 'definitely', recieve: 'receive', seperate: 'separate', untill: 'until', alot: 'a lot', occured: 'occurred', accomodate: 'accommodate', tommorow: 'tomorrow', beleive: 'believe', teh: 'the', thier: 'their', wierd: 'weird', goverment: 'government', enviroment: 'environment', neccessary: 'necessary', occassion: 'occasion', publically: 'publicly' }

export const defaultProofRules: ProofRule[] = [
  ...Object.entries(typos).map(([w, fix]) => ({ category: 'correctness' as const, pattern: new RegExp(`\\b${w}\\b`, 'gi'), replace: fix, message: 'Possible spelling mistake' })),
  { category: 'correctness', pattern: /\b(\w+) \1\b/gi, replace: '$1', message: 'Repeated word' },
  { category: 'clarity', pattern: /\bin order to\b/gi, replace: 'to', message: '“In order to” is wordy. “To” says the same thing.' },
  { category: 'clarity', pattern: /\ba large number of\b/gi, replace: 'many', message: 'Shorter and friendlier.' },
  { category: 'clarity', pattern: /\bdue to the fact that\b/gi, replace: 'because', message: 'Wordy phrase.' },
  { category: 'clarity', pattern: /\bat this point in time\b/gi, replace: 'now', message: 'Wordy phrase.' },
  { category: 'clarity', pattern: /\bin the event that\b/gi, replace: 'if', message: 'Wordy phrase.' },
  { category: 'engagement', pattern: /\bvery big\b/gi, replace: 'huge', message: '“Very big” is weak. One strong word works better.' },
  { category: 'engagement', pattern: /\bvery important\b/gi, replace: 'vital', message: 'Use a stronger word.' },
  { category: 'engagement', pattern: /\bvery good\b/gi, replace: 'excellent', message: 'Use a stronger word.' },
  { category: 'engagement', pattern: /\bhelp out with\b/gi, replace: 'help with', message: '“Out” adds nothing here.' },
  { category: 'delivery', pattern: /\bjust wanted to say\b/gi, replace: 'want to say', message: '“Just wanted to” sounds apologetic. Say it directly.' },
  { category: 'delivery', pattern: /\bI think maybe /g, replace: '', message: 'Hedging makes the point sound unsure.' },
  { category: 'delivery', pattern: /\bSorry to ask, but /gi, replace: '', message: 'No need to apologise for asking.' },
  { category: 'delivery', pattern: /\bif possible,? /gi, replace: '', message: 'Softens a clear request. Drop it.' },
]

interface State { issues: ProofIssue[]; ignored: Set<string>; hidden: Set<ProofCategory> }
const key = new PluginKey<State>('pn-proofread')

function analyse(state: EditorState, rules: ProofRule[], longWords: number, ignored: Set<string>): ProofIssue[] {
  const out: ProofIssue[] = []
  state.doc.descendants((node, pos) => {
    if (!node.isTextblock) return true
    if (node.type.spec.code) return false
    // leaves count as one char, so string index == offset inside the block
    const text = node.textBetween(0, node.content.size, undefined, '￼')
    const start = pos + 1
    const found: ProofIssue[] = []
    for (const r of rules) {
      r.pattern.lastIndex = 0
      for (let m; (m = r.pattern.exec(text)); ) {
        if (!m[0]) { r.pattern.lastIndex++; continue }
        if (ignored.has(m[0].toLowerCase())) continue
        found.push({ from: start + m.index, to: start + m.index + m[0].length, text: m[0], category: r.category, replace: m[0].replace(new RegExp(r.pattern.source, r.pattern.flags.replace('g', '')), r.replace), message: r.message })
      }
    }
    found.sort((a, b) => a.from - b.from).forEach((f) => { const last = out[out.length - 1]; if (!last || f.from >= last.to) out.push(f) })
    for (let m, re = /[^.!?]+[.!?]*\s*/g; (m = re.exec(text)) && m[0]; ) {
      if (m[0].trim().split(/\s+/).length > longWords) out.push({ from: start + m.index, to: start + m.index + m[0].trimEnd().length, text: m[0], category: 'long', message: 'Very hard to read. Try splitting this sentence.' })
    }
    return false
  })
  return out
}

export function summarize(issues: ProofIssue[]): ProofSummary {
  const counts = { correctness: 0, clarity: 0, engagement: 0, delivery: 0, long: 0 }
  issues.forEach((i) => counts[i.category]++)
  const score = Math.max(0, Math.min(100, 100 - (issues.length - counts.long) * 3 - counts.long * 6))
  return { score, issues, counts }
}

export interface ProofreadOptions {
  rules?: ProofRule[]
  /** Sentences longer than this many words get flagged (default 28). */
  longSentenceWords?: number
  /** Categories hidden at start. */
  hidden?: ProofCategory[]
  onChange?: (summary: ProofSummary) => void
}

export interface ProofreadExtension extends PennaExtension {
  summary(): ProofSummary
  setCategory(category: ProofCategory, visible: boolean): void
  apply(issue: ProofIssue): void
  fixAll(category?: ProofCategory): void
}

/** Grammarly-style underlines. Pure decorations: the saved document never changes unless you accept a fix. */
export function proofread(opts: ProofreadOptions = {}): ProofreadExtension {
  const rules = opts.rules ?? defaultProofRules
  const longWords = opts.longSentenceWords ?? 28
  let editor: PennaEditor | undefined
  let card: HTMLElement | null = null
  let offOutside: (() => void) | null = null
  const closeCard = () => { offOutside?.(); offOutside = null; card?.remove(); card = null }
  const visible = (s: State) => s.issues.filter((i) => !s.hidden.has(i.category))

  const applyIssue = (view: EditorView, i: ProofIssue) => {
    if (i.replace == null || i.category === 'long') return
    let fix = i.replace
    if (/^[A-Z]/.test(i.text) && fix) fix = fix[0].toUpperCase() + fix.slice(1)
    const tr = view.state.tr.insertText(fix, i.from, i.to)
    // removed a leading phrase: capitalise what now starts the sentence
    if (!fix) {
      const before = view.state.doc.textBetween(view.state.doc.resolve(i.from).start(), i.from)
      const next = tr.doc.textBetween(i.from, Math.min(i.from + 1, tr.doc.resolve(i.from).end()))
      if ((!before.trim() || /[.!?]\s*$/.test(before)) && /[a-z]/.test(next)) tr.insertText(next.toUpperCase(), i.from, i.from + 1)
    }
    view.dispatch(tr)
  }

  const showCard = (view: EditorView, i: ProofIssue) => {
    closeCard()
    const root = editor!.root.querySelector('.pn-scroll') as HTMLElement
    const canFix = i.category !== 'long' && i.replace != null
    card = h('div', { class: 'pn-menu pn-proof-card', role: 'dialog', 'aria-label': proofCategoryLabels[i.category] },
      h('div', { class: `pn-proof-cat pn-proof-${i.category}` }, h('i'), proofCategoryLabels[i.category]),
      canFix ? h('div', { class: 'pn-proof-fix' }, h('del', { class: 'pn-diff' }, i.text.trim()), ' ', i.replace ? h('ins', { class: 'pn-diff' }, i.replace) : h('em', {}, 'remove')) : null,
      h('p', {}, i.message),
      h('div', { class: 'pn-ai-row' },
        canFix ? h('button', { type: 'button', class: 'pn-btn pn-btn-text pn-btn-primary', html: icons.check + '<span>Accept</span>', onclick: () => { applyIssue(view, i); closeCard(); view.focus() } }) : null,
        h('button', { type: 'button', class: 'pn-btn pn-btn-text', html: '<span>Dismiss</span>', onclick: () => { view.dispatch(view.state.tr.setMeta(key, { ignore: i.text.toLowerCase() })); closeCard(); view.focus() } }),
      ),
    )
    root.append(card)
    const a = view.coordsAtPos(i.from), b = view.coordsAtPos(i.to)
    place(card, new DOMRect(a.left, a.top, Math.max(1, b.right - a.left), a.bottom - a.top), root)
    offOutside = onOutside(card, closeCard)
  }

  const ext: ProofreadExtension = {
    name: 'proofread',
    onCreate: (ed) => { editor = ed; opts.onChange?.(ext.summary()) },
    onDestroy: closeCard,
    summary: () => summarize(editor ? visible(key.getState(editor.view.state)!) : []),
    setCategory: (category, show) => editor?.view.dispatch(editor.view.state.tr.setMeta(key, { [show ? 'show' : 'hide']: category })),
    apply: (i) => editor && applyIssue(editor.view, i),
    fixAll: (category) => {
      if (!editor) return
      const s = key.getState(editor.view.state)!
      // right to left so earlier positions stay valid
      visible(s).filter((i) => i.category !== 'long' && (!category || i.category === category)).reverse().forEach((i) => applyIssue(editor!.view, i))
    },
    plugins: () => [new Plugin<State>({
      key,
      state: {
        init: (_c, state) => { const s = { ignored: new Set<string>(), hidden: new Set(opts.hidden ?? []), issues: [] as ProofIssue[] }; s.issues = analyse(state, rules, longWords, s.ignored); return s },
        apply(tr, prev, _old, state) {
          const meta = tr.getMeta(key) as { ignore?: string; show?: ProofCategory; hide?: ProofCategory } | undefined
          if (!meta && !tr.docChanged) return prev
          const next = { ...prev, ignored: new Set(prev.ignored), hidden: new Set(prev.hidden) }
          if (meta?.ignore) next.ignored.add(meta.ignore)
          if (meta?.show) next.hidden.delete(meta.show)
          if (meta?.hide) next.hidden.add(meta.hide)
          next.issues = analyse(state, rules, longWords, next.ignored)
          return next
        },
      },
      view: () => ({ update: (view, old) => { if (key.getState(view.state) !== key.getState(old)) opts.onChange?.(summarize(visible(key.getState(view.state)!))) } }),
      props: {
        decorations(state) {
          const s = key.getState(state)!
          return DecorationSet.create(state.doc, visible(s).map((i) => Decoration.inline(i.from, i.to, { class: `pn-proof pn-proof-${i.category}`, title: i.message })))
        },
        handleDOMEvents: {
          click(view, e) {
            const el = (e.target as HTMLElement).closest?.('.pn-proof')
            if (!el) { closeCard(); return false }
            const pos = view.posAtDOM(el, 0)
            const s = key.getState(view.state)!
            const hit = visible(s).filter((i) => pos >= i.from && pos <= i.to).sort((a, b) => (a.category === 'long' ? 1 : 0) - (b.category === 'long' ? 1 : 0))[0]
            if (hit) showCard(view, hit)
            return false
          },
        },
      },
    })],
  }
  return ext
}
