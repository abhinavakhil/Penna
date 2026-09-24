# @abhinavakhil/penna-react

React bindings for the [Penna](https://github.com/abhinavakhil/Penna#readme) editor.

```sh
npm i @abhinavakhil/penna-react @abhinavakhil/penna-core
```

```tsx
import { Penna, PennaContent, usePenna, usePennaState } from '@abhinavakhil/penna-react'
import '@abhinavakhil/penna-core/penna.css'

function Editor() {
  const [html, setHtml] = useState('<p>Hello</p>')
  return <Penna value={html} onChange={({ html }) => setHtml(html)} placeholder="Write…" theme="auto" />
}

// render saved content without an editor
<PennaContent json={post.content} theme="dark" />
```

Every `PennaOptions` field is a prop (`extensions`, `typography`, `onUpload`, `dir`…). `readonly`, `theme` and `dir` update live. Get the instance with a `ref`, or `usePenna()` inside `<Penna>`.

MIT
