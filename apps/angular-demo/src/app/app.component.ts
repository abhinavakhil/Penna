import { Component } from '@angular/core'
import { JsonPipe } from '@angular/common'
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms'
import { PennaContentComponent, PennaEditorComponent, type PennaChange, type PennaTheme } from '@abhinavakhil/penna-angular'

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [FormsModule, ReactiveFormsModule, JsonPipe, PennaEditorComponent, PennaContentComponent],
  template: `
    <h1>Penna for Angular</h1>
    <div class="bar">
      Theme:
      @for (t of themes; track t) {
        <label><input type="radio" name="theme" [value]="t" [(ngModel)]="theme" /> {{ t }}</label>
      }
      <label><input type="checkbox" [(ngModel)]="rtl" /> RTL</label>
    </div>

    <section>
      <h2>ngModel</h2>
      <ngx-penna [(ngModel)]="html" [theme]="theme" [dir]="rtl ? 'rtl' : 'ltr'" (contentChange)="saved = $event.json" />
      <h3>HTML output</h3>
      <pre>{{ html }}</pre>
    </section>

    <section>
      <h2>Reactive forms</h2>
      <form [formGroup]="form">
        <div class="bar">
          <button type="button" (click)="toggle()">{{ form.controls.body.disabled ? 'Enable' : 'Disable' }}</button>
          <span>status: {{ status }}</span>
          @if (form.controls.body.touched && form.controls.body.hasError('required')) { <span class="err">Required</span> }
        </div>
        <ngx-penna formControlName="body" format="markdown" [theme]="theme" [dir]="rtl ? 'rtl' : 'ltr'" (valueChange)="status = form.status" />
      </form>
      <h3>Markdown value</h3>
      <pre>{{ form.value | json }}</pre>
    </section>

    <section>
      <h2>ngx-penna-content (saved JSON)</h2>
      <ngx-penna-content [json]="saved" [theme]="theme === 'auto' ? undefined : theme" />
    </section>
  `,
})
export class AppComponent {
  themes: PennaTheme[] = ['auto', 'light', 'dark', 'sepia']
  theme: PennaTheme = 'auto'
  rtl = false
  html = '<h2>Hello Angular</h2><p>Edit me — this is bound with <strong>[(ngModel)]</strong>.</p>'
  saved: PennaChange['json'] | undefined
  form = new FormGroup({ body: new FormControl('', { nonNullable: true, validators: Validators.required }) })
  status = this.form.status

  toggle() {
    const c = this.form.controls.body
    c.disabled ? c.enable() : c.disable()
    this.status = this.form.status
  }
}
