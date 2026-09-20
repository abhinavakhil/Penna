import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const layout = readFileSync(join(process.cwd(), 'apps/site/src/layouts/Base.astro'), 'utf8')
const editorStyles = readFileSync(join(process.cwd(), 'packages/core/src/penna.css'), 'utf8')
const home = readFileSync(join(process.cwd(), 'apps/site/src/pages/index.astro'), 'utf8')
const docs = readFileSync(join(process.cwd(), 'apps/site/src/pages/docs.astro'), 'utf8')

describe('site typography and header', () => {
  it('uses the ClickUp font roles', () => {
    expect(layout).toContain('family=Inter:wght@400;500;600;700;800')
    expect(layout).toContain('family=Plus+Jakarta+Sans:wght@600;700;800')
    expect(layout).toContain('family=Sometype+Mono:wght@400;500;600')
    expect(layout).toMatch(/body \{[^}]*font-family: Inter/s)
    expect(layout).toMatch(/h1, h2, h3 \{[^}]*font-family: "Plus Jakarta Sans"/s)
    expect(layout).toMatch(/code, pre, kbd \{[^}]*font-family: "Sometype Mono"/s)
  })

  it('gives the shared header ClickUp-style secondary and primary actions', () => {
    expect(layout).toMatch(/nav\.main a:nth-child\(2\) \{[^}]*background: var\(--code\)/s)
    expect(layout).toMatch(/nav\.main a:last-child \{[^}]*background: var\(--fg\)/s)
    expect(layout).not.toMatch(/nav\.main a:last-child \{[^}]*linear-gradient/s)
    expect(layout).not.toMatch(/header\.site \{[^}]*border-bottom/s)
    expect(layout).not.toMatch(/header\.site \{[^}]*box-shadow/s)
  })

  it('applies the heading face inside editor content instead of inheriting Inter', () => {
    expect(editorStyles).toContain('--pn-heading-font: "Plus Jakarta Sans", Inter, sans-serif')
    expect(editorStyles).toMatch(/\.pn-editor :is\(h1,h2,h3\), \.penna-content :is\(h1,h2,h3\) \{ font-family: var\(--pn-heading-font\)/)
  })

  it('uses weight 700 for every heading level', () => {
    expect(layout).toMatch(/h1, h2, h3 \{[^}]*font-weight: 700/s)
    expect(home).not.toMatch(/(?:h1|h2|h3)[^{]*\{[^}]*(?:font-weight: (?!700))/s)
    expect(editorStyles.match(/\.pn-editor h[1-3][^{]*\{[^}]*font-weight: 700/g)).toHaveLength(3)
  })

  it('loads and documents the editor typography presets', () => {
    for (const font of ['DM+Sans', 'IBM+Plex+Sans', 'Lora', 'Manrope', 'Merriweather']) expect(layout).toContain(`family=${font}`)
    expect(docs).toContain('typography: {')
    expect(docs).toContain('fontFamilies:')
    expect(docs).toContain('headingFontFamily:')
    expect(docs).toContain('bodyFontFamily:')
  })
})
