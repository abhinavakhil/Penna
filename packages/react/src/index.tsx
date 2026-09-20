import { createContext, forwardRef, useContext, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createEditor, type PennaEditor, type PennaOptions } from '@abhinavakhil/penna-core'

export type { PennaEditor, PennaOptions }

export interface PennaProps extends Omit<PennaOptions, 'content' | 'onUpdate'> {
  /** Controlled/initial content (HTML by default; set `contentFormat`). Changing it from outside resets the editor. */
  value?: PennaOptions['content']
  /** Uncontrolled initial content. */
  defaultValue?: PennaOptions['content']
  onChange?: (value: { html: string; json: Record<string, unknown>; markdown: string }, editor: PennaEditor) => void
  onReady?: (editor: PennaEditor) => void
  className?: string
  style?: CSSProperties
}

const Ctx = createContext<PennaEditor | null>(null)

/** `<Penna value={html} onChange={({ html }) => setHtml(html)} />` */
export const Penna = forwardRef<PennaEditor | null, PennaProps>(function Penna({ value, defaultValue, onChange, onReady, className, style, ...options }, ref) {
  const host = useRef<HTMLDivElement>(null)
  const [editor, setEditor] = useState<PennaEditor | null>(null)
  const latest = useRef({ onChange, options, value })
  latest.current = { onChange, options, value }
  const lastEmitted = useRef<string | null>(null)

  useLayoutEffect(() => {
    const ed = createEditor(host.current!, {
      ...latest.current.options,
      content: value ?? defaultValue,
      onUpdate: (e) => {
        const html = e.getHTML()
        lastEmitted.current = html
        latest.current.onChange?.({ html, json: e.getJSON(), markdown: e.getMarkdown() }, e)
        latest.current.options.onSelectionChange?.(e)
      },
    })
    setEditor(ed)
    onReady?.(ed)
    return () => { ed.destroy(); setEditor(null) }
    // Options are captured at mount; use the editor ref / imperative API for later changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // controlled value: only reset when the parent changed it to something we didn't emit
  useEffect(() => {
    if (!editor || value === undefined) return
    const incoming = typeof value === 'string' ? value : JSON.stringify(value)
    if (incoming === lastEmitted.current) return
    editor.setContent(value, latest.current.options.contentFormat, false)
    lastEmitted.current = editor.getHTML()
  }, [value, editor])

  useEffect(() => { if (editor && options.readonly !== undefined) editor.readonly = options.readonly }, [options.readonly, editor])
  useEffect(() => { if (editor && options.theme) editor.theme = options.theme }, [options.theme, editor])

  useImperativeHandle(ref, () => editor as PennaEditor, [editor])

  return <Ctx.Provider value={editor}><div ref={host} className={className} style={style} /></Ctx.Provider>
})

/** Access the editor from children rendered inside <Penna> (e.g. a custom toolbar). */
export function usePenna(): PennaEditor | null {
  return useContext(Ctx)
}

/** Subscribe to editor changes and re-render: `const { words } = usePennaState(editor, e => e.wordCount())` */
export function usePennaState<T>(editor: PennaEditor | null, select: (e: PennaEditor) => T): T | null {
  const [v, setV] = useState<T | null>(() => (editor ? select(editor) : null))
  useEffect(() => {
    if (!editor) return
    setV(select(editor))
    const off1 = editor.on('update', (e) => setV(select(e)))
    const off2 = editor.on('selection', (e) => setV(select(e)))
    return () => { off1(); off2() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor])
  return v
}

/** Render saved content without an editor (client or server). */
export function PennaContent({ json, html, className, theme }: { json?: unknown; html?: string; className?: string; theme?: 'light' | 'dark' }) {
  const out = html ?? (json ? renderToHTML(json) : '')
  return <div className={`penna-content ${className ?? ''}`} data-theme={theme} dangerouslySetInnerHTML={{ __html: out }} />
}
import { renderToHTML } from '@abhinavakhil/penna-core'
export { renderToHTML }
