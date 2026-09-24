# @abhinavakhil/penna-ai

AI writing for the [Penna](https://github.com/abhinavakhil/Penna#readme) editor: continue writing, improve, fix grammar, shorten, change tone, translate, or ask anything. Rewrites show a word-level diff before you accept them. Works with free providers.

```sh
npm i @abhinavakhil/penna-ai @abhinavakhil/penna-core
```

```ts
import { createEditor } from '@abhinavakhil/penna-core'
import { ai } from '@abhinavakhil/penna-ai'

createEditor('#editor', {
  extensions: [ai({ provider: 'groq', apiKey: '…' })],
})
```

Providers: `groq`, `gemini`, `openrouter`, `together` (free tiers), `openai`, `mistral`, `ollama` (local), and `openai-compatible` with `baseUrl`. Optional `model`.

Open it with <kbd>Ctrl</kbd>+<kbd>J</kbd>, the ✦ button in the bubble or toolbar, or `/ai`. Pass `actions` to replace the built-in prompts.

> Keys used in the browser are visible to users. In production, point `openai-compatible` at your own proxy.

MIT
