import { defineComponent, h, inject, onBeforeUnmount, onMounted, provide, ref, shallowRef, watch, type InjectionKey, type PropType, type Ref, type ShallowRef } from 'vue'
import { createEditor, renderToHTML, type PennaEditor, type PennaOptions } from '@abhinavakhil/penna-core'

export type { PennaEditor, PennaOptions }
export { renderToHTML }

const KEY: InjectionKey<ShallowRef<PennaEditor | null>> = Symbol('penna')

/**
 * <Penna v-model="html" placeholder="Write…" :options="{ onUpload }" />
 * v-model:json / v-model:markdown also work via `format`.
 */
export const Penna = defineComponent({
  name: 'Penna',
  props: {
    modelValue: { type: [String, Object] as PropType<string | Record<string, unknown>>, default: undefined },
    format: { type: String as PropType<'html' | 'markdown' | 'json'>, default: 'html' },
    placeholder: String,
    readonly: Boolean,
    theme: String as PropType<'light' | 'dark' | 'auto'>,
    options: { type: Object as PropType<PennaOptions>, default: () => ({}) },
  },
  emits: ['update:modelValue', 'change', 'ready', 'focus', 'blur'],
  setup(props, { emit, expose, slots }) {
    const host = ref<HTMLElement | null>(null)
    const editor = shallowRef<PennaEditor | null>(null)
    let lastEmitted: string | null = null
    provide(KEY, editor)

    const read = (ed: PennaEditor) => (props.format === 'markdown' ? ed.getMarkdown() : props.format === 'json' ? ed.getJSON() : ed.getHTML())

    onMounted(() => {
      const ed = createEditor(host.value!, {
        ...props.options,
        content: props.modelValue ?? props.options.content,
        contentFormat: props.format,
        placeholder: props.placeholder ?? props.options.placeholder,
        readonly: props.readonly || props.options.readonly,
        theme: props.theme ?? props.options.theme,
        onUpdate: (e) => {
          props.options.onUpdate?.(e)
          const v = read(e)
          lastEmitted = typeof v === 'string' ? v : JSON.stringify(v)
          emit('update:modelValue', v)
          emit('change', { html: e.getHTML(), json: e.getJSON(), markdown: e.getMarkdown() }, e)
        },
        onFocus: (e) => { props.options.onFocus?.(e); emit('focus', e) },
        onBlur: (e) => { props.options.onBlur?.(e); emit('blur', e) },
      })
      editor.value = ed
      emit('ready', ed)
    })
    onBeforeUnmount(() => { editor.value?.destroy(); editor.value = null })

    watch(() => props.modelValue, (v) => {
      if (!editor.value || v === undefined) return
      const incoming = typeof v === 'string' ? v : JSON.stringify(v)
      if (incoming === lastEmitted) return
      editor.value.setContent(v, props.format, false)
    })
    watch(() => props.readonly, (v) => { if (editor.value) editor.value.readonly = v })
    watch(() => props.theme, (v) => { if (editor.value && v) editor.value.theme = v })

    expose({ editor })
    return () => h('div', { ref: host }, slots.default?.())
  },
})

/** Inside <Penna>'s default slot: `const editor = usePenna()` (a shallowRef). */
export function usePenna(): ShallowRef<PennaEditor | null> {
  return inject(KEY, shallowRef(null))
}

/** Reactive selector: `const count = usePennaState(editor, e => e.wordCount())` */
export function usePennaState<T>(editor: ShallowRef<PennaEditor | null>, select: (e: PennaEditor) => T): Ref<T | null> {
  const out = ref<T | null>(null) as Ref<T | null>
  let offs: (() => void)[] = []
  watch(editor, (ed) => {
    offs.forEach((f) => f()); offs = []
    if (!ed) { out.value = null; return }
    out.value = select(ed)
    offs = [ed.on('update', (e) => (out.value = select(e))), ed.on('selection', (e) => (out.value = select(e)))]
  }, { immediate: true })
  onBeforeUnmount(() => offs.forEach((f) => f()))
  return out
}

/** Render saved content without an editor. */
export const PennaContent = defineComponent({
  name: 'PennaContent',
  props: { json: { type: Object as PropType<unknown>, default: undefined }, html: String, theme: String as PropType<'light' | 'dark'> },
  setup: (props) => () => h('div', { class: 'penna-content', 'data-theme': props.theme, innerHTML: props.html ?? (props.json ? renderToHTML(props.json) : '') }),
})
