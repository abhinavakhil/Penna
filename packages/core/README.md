# @abhinavakhil/penna-core

The Penna editor: a framework-agnostic WYSIWYG editor with slash commands, Markdown, tables, media, typography controls, light / dark / sepia themes, RTL, and opt-in extensions. Built on ProseMirror.

```sh
npm i @abhinavakhil/penna-core
```

```ts
import { createEditor } from '@abhinavakhil/penna-core'
import '@abhinavakhil/penna-core/penna.css'

const editor = createEditor('#editor', {
  content: '<p>Hello</p>',          // HTML, Markdown (contentFormat: 'markdown') or JSON
  placeholder: 'Write something…',
  theme: 'auto',                    // 'auto' | 'light' | 'dark' | 'sepia'
  dir: 'ltr',                       // 'rtl' for Arabic, Urdu, Hebrew…
  onUpdate: (ed) => save(ed.getJSON()),
})

editor.getHTML(); editor.getMarkdown(); editor.getJSON(); editor.getText()
```

On `auto` the editor follows a `data-theme="dark"` or `.dark` ancestor, then the OS setting. Every color is a `--pn-*` CSS variable.

## Extensions

```ts
import { shortcuts, fundraisingShortcuts, proofread, mentions, mergeFields, comments, versionHistory, focusMode } from '@abhinavakhil/penna-core'

createEditor('#editor', { extensions: [
  shortcuts({ items: fundraisingShortcuts }),        // /budget, /impact… + hotkeys; select text → + to save your own
  proofread({ onChange: (s) => showScore(s.score) }),
  mentions({ items: (q) => api.people(q) }),         // @Name
  mergeFields({ fields: [{ key: 'first_name' }] }),  // {{first_name}}
  comments({ onAdd: (c) => api.createThread(c) }),
  versionHistory({ key: 'post-42' }),
  focusMode(),
] })
```

## Render without the editor

```ts
import { renderToHTML } from '@abhinavakhil/penna-core'
const html = renderToHTML(savedJson) // same markup as the editor, no DOM needed (SSR-safe)
```

Framework wrappers: [`penna-react`](https://www.npmjs.com/package/@abhinavakhil/penna-react), [`penna-vue`](https://www.npmjs.com/package/@abhinavakhil/penna-vue), [`penna-angular`](https://www.npmjs.com/package/@abhinavakhil/penna-angular), [`penna-element`](https://www.npmjs.com/package/@abhinavakhil/penna-element). Free AI: [`penna-ai`](https://www.npmjs.com/package/@abhinavakhil/penna-ai).

Full docs: https://github.com/abhinavakhil/Penna#readme · MIT
