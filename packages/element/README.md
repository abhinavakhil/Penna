# @abhinavakhil/penna-element

`<penna-editor>`: the [Penna](https://github.com/abhinavakhil/Penna#readme) editor as a web component. Works in plain HTML, Svelte, Solid, Lit, HTMX, anything. (Using Angular? [`penna-angular`](https://www.npmjs.com/package/@abhinavakhil/penna-angular) adds `ngModel` and reactive forms.)

```sh
npm i @abhinavakhil/penna-element @abhinavakhil/penna-core
```

```html
<script type="module">import '@abhinavakhil/penna-element'</script>
<link rel="stylesheet" href="node_modules/@abhinavakhil/penna-core/dist/penna.css" />

<penna-editor placeholder="Write…" theme="auto" dir="ltr" autosave-key="draft"></penna-editor>
<script>
  document.querySelector('penna-editor').addEventListener('change', (e) => console.log(e.detail.html))
</script>
```

Attributes: `value`, `placeholder`, `readonly`, `theme` (auto, light, dark, sepia), `dir`, `format` (html, markdown, json), `toolbar="false"`, `autosave-key`. Events: `change`, `ready`, `editor-focus`, `editor-blur`. Set `el.options = {...}` before it connects for extensions and other options; `el.editor` is the instance.

MIT
