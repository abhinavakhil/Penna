# @abhinavakhil/penna-vue

Vue 3 bindings for the [Penna](https://github.com/abhinavakhil/Penna#readme) editor.

```sh
npm i @abhinavakhil/penna-vue @abhinavakhil/penna-core
```

```vue
<script setup>
import { ref } from 'vue'
import { Penna, PennaContent } from '@abhinavakhil/penna-vue'
import '@abhinavakhil/penna-core/penna.css'
const html = ref('<p>Hello</p>')
</script>

<template>
  <Penna v-model="html" placeholder="Write…" theme="auto" dir="ltr" :options="{ extensions: [] }" />
  <PennaContent :html="html" />
</template>
```

`format="markdown"` or `format="json"` changes what `v-model` holds. `readonly`, `theme` and `dir` update live. Events: `change`, `ready`, `focus`, `blur`.

MIT
