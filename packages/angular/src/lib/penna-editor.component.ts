import {
  ChangeDetectorRef, Component, ElementRef, EventEmitter, forwardRef, HostBinding, Inject, InjectionToken, Input, NgZone, Optional, Output, PLATFORM_ID,
  type AfterViewInit, type OnChanges, type OnDestroy, type Provider, type SimpleChanges,
} from '@angular/core'
import { isPlatformBrowser } from '@angular/common'
import { NG_VALUE_ACCESSOR, type ControlValueAccessor } from '@angular/forms'
import { createEditor, type PennaContent, type PennaEditor, type PennaOptions, type PennaTheme } from '@abhinavakhil/penna-core'

export type PennaFormat = 'html' | 'markdown' | 'json'
export type PennaDir = NonNullable<PennaOptions['dir']>
export type { PennaTheme }
export interface PennaChange { html: string; json: Record<string, unknown>; markdown: string }

/** App-wide defaults: `providers: [providePenna({ theme: 'dark', extensions: [ai()] })]` */
export const PENNA_CONFIG = new InjectionToken<Partial<PennaOptions>>('PENNA_CONFIG')
export function providePenna(config: Partial<PennaOptions>): Provider {
  return { provide: PENNA_CONFIG, useValue: config }
}

// changing any of these after init recreates the editor (content is kept)
const STRUCTURAL = ['options', 'placeholder', 'toolbar', 'bubbleMenu', 'slashMenu', 'dragHandle', 'statusBar', 'borderless', 'typography', 'extensions', 'onUpload', 'autosave']

/**
 * <ngx-penna [(ngModel)]="html" placeholder="Write…" />
 * Also works with formControl / formControlName, or `[(value)]` without forms.
 */
@Component({
  selector: 'ngx-penna',
  standalone: true,
  template: '',
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => PennaEditorComponent), multi: true }],
})
export class PennaEditorComponent implements ControlValueAccessor, AfterViewInit, OnChanges, OnDestroy {
  @Input() value: PennaContent
  @Input() format: PennaFormat = 'html'
  @Input() placeholder?: string
  @Input() readonly?: boolean
  @Input() theme?: PennaTheme
  @Input() @HostBinding('attr.dir') dir?: PennaDir
  @Input() toolbar?: PennaOptions['toolbar']
  @Input() bubbleMenu?: PennaOptions['bubbleMenu']
  @Input() slashMenu?: PennaOptions['slashMenu']
  @Input() dragHandle?: boolean
  @Input() statusBar?: boolean
  @Input() borderless?: boolean
  @Input() autofocus?: boolean
  @Input() typography?: PennaOptions['typography']
  @Input() extensions?: PennaOptions['extensions']
  @Input() onUpload?: PennaOptions['onUpload']
  @Input() autosave?: PennaOptions['autosave']
  /** Full options escape hatch; individual inputs win over it. */
  @Input() options: PennaOptions = {}

  @Output() ready = new EventEmitter<PennaEditor>()
  @Output() valueChange = new EventEmitter<string | Record<string, unknown>>()
  @Output() contentChange = new EventEmitter<PennaChange>()
  @Output() focused = new EventEmitter<PennaEditor>()
  @Output() blurred = new EventEmitter<PennaEditor>()
  @Output() selectionChange = new EventEmitter<PennaEditor>()

  private ed: PennaEditor | null = null
  private lastEmitted: string | null = null
  private silent = false
  private disabled = false
  private onChange: (v: unknown) => void = () => {}
  private onTouched: () => void = () => {}
  private readonly browser: boolean

  constructor(
    private host: ElementRef<HTMLElement>,
    private zone: NgZone,
    private cdr: ChangeDetectorRef,
    @Inject(PLATFORM_ID) platformId: object,
    @Optional() @Inject(PENNA_CONFIG) private config: Partial<PennaOptions> | null,
  ) {
    this.browser = isPlatformBrowser(platformId)
  }

  get editor(): PennaEditor | null { return this.ed }

  ngAfterViewInit() { this.create(this.value) }

  ngOnChanges(ch: SimpleChanges) {
    const ed = this.ed
    if (!ed) return
    if (STRUCTURAL.some((k) => ch[k])) {
      const json = ed.getJSON()
      ed.destroy()
      this.ed = null
      this.create(json, 'json')
      return
    }
    if (ch['value'] && this.value !== undefined) this.set(this.value)
    if (ch['readonly']) ed.readonly = this.isReadonly()
    if (ch['theme']) ed.theme = this.theme ?? 'auto'
    if (ch['dir']) ed.dir = this.dir ?? 'ltr'
  }

  ngOnDestroy() { this.ed?.destroy(); this.ed = null }

  // ControlValueAccessor
  writeValue(v: PennaContent) {
    if (this.ed) this.set(v ?? '')
    else this.value = v
  }
  registerOnChange(fn: (v: unknown) => void) { this.onChange = fn }
  registerOnTouched(fn: () => void) { this.onTouched = fn }
  setDisabledState(disabled: boolean) {
    this.disabled = disabled
    if (this.ed) this.ed.readonly = this.isReadonly()
  }

  private read(ed: PennaEditor) {
    return this.format === 'markdown' ? ed.getMarkdown() : this.format === 'json' ? ed.getJSON() : ed.getHTML()
  }
  private isReadonly() { return !!(this.disabled || (this.readonly ?? this.config?.readonly ?? this.options.readonly)) }

  // only reset when the parent passes something the editor did not emit
  private set(v: PennaContent) {
    const incoming = typeof v === 'string' ? v : JSON.stringify(v)
    if (!this.ed || incoming === this.lastEmitted) return
    this.silent = true
    try { this.ed.setContent(v, this.format, false) } finally { this.silent = false }
    this.lastEmitted = incoming
  }

  private create(content: PennaContent, format: PennaFormat = this.format) {
    if (!this.browser) return
    const base = { ...this.config, ...this.options }
    const own = {
      placeholder: this.placeholder, theme: this.theme, dir: this.dir, toolbar: this.toolbar, bubbleMenu: this.bubbleMenu,
      slashMenu: this.slashMenu, dragHandle: this.dragHandle, statusBar: this.statusBar, borderless: this.borderless,
      autofocus: this.autofocus, typography: this.typography, extensions: this.extensions, onUpload: this.onUpload, autosave: this.autosave,
    }
    for (const [k, v] of Object.entries(own)) if (v !== undefined) (base as Record<string, unknown>)[k] = v
    const relay = (out: EventEmitter<PennaEditor>, fn?: (e: PennaEditor) => void) => (e: PennaEditor) => { fn?.(e); this.zone.run(() => { out.emit(e); this.cdr.markForCheck() }) }

    this.ed = this.zone.runOutsideAngular(() => createEditor(this.host.nativeElement, {
      ...(base as PennaOptions),
      content: content ?? base.content,
      contentFormat: content != null ? format : base.contentFormat,
      readonly: this.isReadonly(),
      onUpdate: (e) => {
        base.onUpdate?.(e)
        if (this.silent) return
        const v = this.read(e)
        this.lastEmitted = typeof v === 'string' ? v : JSON.stringify(v)
        this.zone.run(() => {
          this.onChange(v)
          this.valueChange.emit(v)
          this.contentChange.emit({ html: e.getHTML(), json: e.getJSON(), markdown: e.getMarkdown() })
          this.cdr.markForCheck() // zoneless apps: form state changed outside a template event
        })
      },
      onSelectionChange: relay(this.selectionChange, base.onSelectionChange),
      onFocus: relay(this.focused, base.onFocus),
      onBlur: relay(this.blurred, (e) => { base.onBlur?.(e); this.onTouched() }),
    }))
    const ed = this.ed
    const v = this.read(ed)
    this.lastEmitted = typeof v === 'string' ? v : JSON.stringify(v)
    // next microtask so a (ready) handler can update bindings without NG0100
    queueMicrotask(() => this.zone.run(() => this.ready.emit(ed)))
  }
}
