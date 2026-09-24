import { Component, Input, type OnChanges } from '@angular/core'
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser'
import { renderToHTML } from '@abhinavakhil/penna-core'
import type { PennaTheme } from './penna-editor.component'

/** Render saved content without an editor: <ngx-penna-content [json]="doc" /> */
@Component({
  selector: 'ngx-penna-content',
  standalone: true,
  template: '<div class="penna-content" [attr.data-theme]="theme" [innerHTML]="safe"></div>',
})
export class PennaContentComponent implements OnChanges {
  @Input() json?: unknown
  @Input() html?: string
  @Input() theme?: PennaTheme
  safe: SafeHtml = ''

  constructor(private sanitizer: DomSanitizer) {}

  ngOnChanges() {
    // renderToHTML only emits schema-defined tags/attrs with escaped text, so bypassing is safe there;
    // the default sanitizer would strip embeds (iframes) and inline styles (colors, alignment, font sizes).
    // A raw `html` input is passed through the normal sanitizer since it may come from anywhere.
    this.safe = this.html != null ? this.html : this.json ? this.sanitizer.bypassSecurityTrustHtml(renderToHTML(this.json)) : ''
  }
}
