export type DiffOp = { type: 'same' | 'add' | 'del'; text: string }

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Word-level diff (LCS over words + whitespace). Fine for paragraphs and short docs. */
export function diffWords(before: string, after: string): DiffOp[] {
  const a = before.match(/\s+|[^\s]+/g) ?? []
  const b = after.match(/\s+|[^\s]+/g) ?? []
  // ponytail: O(n·m) table; switch to Myers if you diff whole books.
  const dp = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1))
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
  const ops: DiffOp[] = []
  const push = (type: DiffOp['type'], text: string) => { const last = ops[ops.length - 1]; if (last?.type === type) last.text += text; else ops.push({ type, text }) }
  let i = 0, j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { push('same', a[i]); i++; j++ } else if (dp[i + 1][j] >= dp[i][j + 1]) push('del', a[i++]); else push('add', b[j++])
  }
  while (i < a.length) push('del', a[i++])
  while (j < b.length) push('add', b[j++])
  return ops
}

/** Diff as escaped HTML with <ins>/<del class="pn-diff">. */
export function diffHTML(before: string, after: string): string {
  return diffWords(before, after).map((o) => o.type === 'same' ? escape(o.text) : `<${o.type === 'add' ? 'ins' : 'del'} class="pn-diff">${escape(o.text)}</${o.type === 'add' ? 'ins' : 'del'}>`).join('')
}

const syllables = (word: string) => {
  const w = word.toLowerCase().replace(/[^a-z]/g, '')
  if (w.length <= 3) return w ? 1 : 0
  return Math.max(1, (w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '').match(/[aeiouy]{1,2}/g) ?? []).length)
}

/** Flesch–Kincaid grade and reading age. English heuristics; good enough for a "keep it simple" nudge. */
export function readability(text: string): { grade: number; readingAge: number; sentences: number; words: number; longSentences: number } {
  const sentences = text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean)
  const words = text.match(/[\p{L}\p{N}'’-]+/gu) ?? []
  if (!words.length) return { grade: 0, readingAge: 0, sentences: 0, words: 0, longSentences: 0 }
  const syl = words.reduce((n, w) => n + syllables(w), 0)
  const grade = Math.max(0, Math.round((0.39 * (words.length / Math.max(1, sentences.length)) + 11.8 * (syl / words.length) - 15.59) * 10) / 10)
  const longSentences = sentences.filter((s) => s.split(/\s+/).length > 28).length
  return { grade, readingAge: Math.round(grade + 5), sentences: sentences.length, words: words.length, longSentences }
}
