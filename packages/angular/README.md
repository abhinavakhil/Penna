# @abhinavakhil/penna-angular

Angular bindings for [Penna](https://github.com/abhinavakhil/Penna). Standalone components, `ControlValueAccessor` (ngModel / reactive forms), SSR-safe, runs the editor outside the Angular zone.

```bash
npm i @abhinavakhil/penna-angular @abhinavakhil/penna-core
```

Add the stylesheet once, e.g. in `angular.json`:

```json
"styles": ["node_modules/@abhinavakhil/penna-core/dist/penna.css", "src/styles.css"]
```

(or `@import '@abhinavakhil/penna-core/penna.css';` in `styles.css`)

## Standalone

```ts
import { Component } from '@angular/core'
import { PennaEditorComponent } from '@abhinavakhil/penna-angular'

@Component({
  selector: 'app-post',
  standalone: true,
  imports: [PennaEditorComponent],
  template: `<ngx-penna [(value)]="html" placeholder="Write…" (ready)="editor = $event" />`,
})
export class PostComponent {
  html = '<p>Hello</p>'
  editor?: import('@abhinavakhil/penna-angular').PennaEditor
}
```

## ngModel

```html
<ngx-penna [(ngModel)]="html" />
<ngx-penna [(ngModel)]="markdown" format="markdown" />
<ngx-penna [(ngModel)]="doc" format="json" />
```

`format` controls what the editor emits and what it expects back (`html` by default). Setting the bound value from outside resets the editor, but values the editor itself just emitted are ignored, so typing never jumps the cursor.

## Reactive forms

```ts
form = new FormGroup({ body: new FormControl('', { validators: Validators.required }) })
```

```html
<form [formGroup]="form">
  <ngx-penna formControlName="body" />
</form>
```

`control.disable()` makes the editor read-only; blur marks the control as touched.

## App-wide defaults: `providePenna`

```ts
import { providePenna } from '@abhinavakhil/penna-angular'
import { ai } from '@abhinavakhil/penna-ai'

bootstrapApplication(AppComponent, {
  providers: [
    providePenna({
      theme: 'auto',
      typography: { bodyFontFamily: 'Lora' },
      extensions: [ai({ provider: 'groq', apiKey: environment.groqKey })],
    }),
  ],
})
```

Precedence: `providePenna` config < `[options]` input < individual inputs.

## Inputs and outputs

| Input | Notes |
| --- | --- |
| `value` | Content in `format`. Use `[(value)]` without forms. |
| `format` | `'html' \| 'markdown' \| 'json'`, default `'html'` |
| `readonly`, `theme`, `dir` | Update live. `theme`: `'auto' \| 'light' \| 'dark' \| 'sepia'`. `dir`: `'ltr' \| 'rtl' \| 'auto'` |
| `placeholder`, `toolbar`, `bubbleMenu`, `slashMenu`, `dragHandle`, `statusBar`, `borderless`, `autofocus`, `typography`, `extensions`, `onUpload`, `autosave` | Same as `PennaOptions`. Changing one after init recreates the editor, keeping its content. |
| `options` | Full `PennaOptions` escape hatch. |

Outputs: `ready` (the `PennaEditor`), `valueChange`, `contentChange` (`{ html, json, markdown }`), `focused`, `blurred`, `selectionChange`.

Get the instance with a view query: `@ViewChild(PennaEditorComponent) penna!: PennaEditorComponent` then `this.penna.editor?.getMarkdown()`.

## Rendering saved content

```html
<ngx-penna-content [json]="post.body" theme="light" />
```

Renders `renderToHTML(json)` into `<div class="penna-content">` with no editor. Pass `[html]` instead for stored HTML (goes through Angular's sanitizer).

## Theming

Pick a built-in theme with the `theme` input, or override the CSS variables:

```css
.penna, .penna-content {
  --pn-font: 'Inter', sans-serif;
  --pn-accent: #0ea5e9;
  --pn-radius: 12px;
}
```

## NgModule apps

```ts
import { PennaModule } from '@abhinavakhil/penna-angular'

@NgModule({ imports: [PennaModule, FormsModule] })
export class AppModule {}
```

## SSR

On the server the component renders an empty host and creates the editor only in the browser.

MIT
