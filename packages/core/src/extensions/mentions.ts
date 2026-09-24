import { Plugin, PluginKey } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'
import { schema } from '../schema'
import { suggestPlugin } from '../ui/suggest'
import type { EditorView } from 'prosemirror-view'
import type { PennaEditor, PennaExtension } from '../editor'

const scroll = (ed: PennaEditor) => ed.root.querySelector('.pn-scroll') as HTMLElement
/** Type the trigger at the cursor (with a space before it if needed) so the suggestion menu opens. */
const typeTrigger = (v: EditorView, char: string) => {
  const before = v.state.doc.textBetween(Math.max(v.state.selection.$from.start(), v.state.selection.from - 1), v.state.selection.from)
  v.dispatch(v.state.tr.insertText(before && !/\s/.test(before) ? ` ${char}` : char))
}

export interface MentionItem { id: string; label: string; description?: string }

/** `@` mentions. `items` can hit your API; it's called with the text typed after the trigger. */
export function mentions(opts: { items: (query: string) => MentionItem[] | Promise<MentionItem[]>; char?: string; heading?: string }): PennaExtension {
  const char = opts.char ?? '@'
  return {
    name: 'mentions',
    plugins: (ed) => [suggestPlugin<MentionItem>(() => scroll(ed), {
      char,
      heading: opts.heading ?? 'People',
      items: opts.items,
      render: (it) => ({ title: it.label, description: it.description }),
      select: (view, it, { from, to }) => {
        view.dispatch(view.state.tr.replaceWith(from, to, [schema.nodes.mention.create({ id: it.id, label: it.label }), schema.text(' ')]))
      },
    })],
    toolbarItems: [{ id: 'mention', icon: 'at', label: 'Mention someone', run: (v) => typeTrigger(v, char) }],
  }
}

export interface MergeField { key: string; label?: string; description?: string }
const previewKey = new PluginKey<Record<string, string> | null>('pn-merge-preview')

/**
 * `{{` merge fields such as {{first_name}}. They save as `{{key}}` in Markdown and text,
 * and as `<span data-merge="key">` in HTML, ready for your email sender to fill in.
 */
export function mergeFields(opts: { fields: MergeField[]; char?: string; preview?: Record<string, string> | null }): PennaExtension & { setPreview(values: Record<string, string> | null): void } {
  let editor: PennaEditor | undefined
  const char = opts.char ?? '{{'
  return {
    name: 'mergeFields',
    onCreate: (ed) => { editor = ed },
    /** Show real values (e.g. one reader's first name) instead of the field labels. Pass null to go back. */
    setPreview(values) { editor?.view.dispatch(editor.view.state.tr.setMeta(previewKey, values)) },
    plugins: (ed) => [
      suggestPlugin<MergeField>(() => scroll(ed), {
        char,
        heading: 'Merge fields',
        items: (q) => opts.fields.filter((f) => `${f.key} ${f.label ?? ''}`.toLowerCase().includes(q.toLowerCase().replace(/}+$/, ''))),
        render: (f) => ({ title: f.label ?? f.key, description: f.description ?? `{{${f.key}}}` }),
        select: (view, f, { from, to }) => {
          view.dispatch(view.state.tr.replaceWith(from, to, [schema.nodes.merge_field.create({ key: f.key, label: f.label ?? null }), schema.text(' ')]))
        },
      }),
      new Plugin<Record<string, string> | null>({
        key: previewKey,
        state: { init: () => opts.preview ?? null, apply: (tr, prev) => (tr.getMeta(previewKey) !== undefined ? tr.getMeta(previewKey) : prev) },
        props: {
          decorations(state) {
            const values = previewKey.getState(state)
            if (!values) return null
            const decos: Decoration[] = []
            state.doc.descendants((node, pos) => {
              if (node.type === schema.nodes.merge_field && values[node.attrs.key] != null) decos.push(Decoration.node(pos, pos + node.nodeSize, { 'data-preview': values[node.attrs.key] }))
            })
            return DecorationSet.create(state.doc, decos)
          },
        },
      }),
    ],
    toolbarItems: [{ id: 'mergeField', icon: 'braces', label: 'Insert merge field', run: (v) => typeTrigger(v, char) }],
  }
}
