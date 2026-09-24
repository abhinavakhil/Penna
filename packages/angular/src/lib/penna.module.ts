import { NgModule } from '@angular/core'
import { PennaEditorComponent } from './penna-editor.component'
import { PennaContentComponent } from './penna-content.component'

/** For NgModule-based apps; standalone apps can import the components directly. */
@NgModule({
  imports: [PennaEditorComponent, PennaContentComponent],
  exports: [PennaEditorComponent, PennaContentComponent],
})
export class PennaModule {}
