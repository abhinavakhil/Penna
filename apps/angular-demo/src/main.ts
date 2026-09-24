import { bootstrapApplication } from '@angular/platform-browser'
import { provideZonelessChangeDetection } from '@angular/core'
import { providePenna } from '@abhinavakhil/penna-angular'
import { AppComponent } from './app/app.component'

bootstrapApplication(AppComponent, {
  providers: [provideZonelessChangeDetection(), providePenna({ placeholder: 'Type something, or press / …' })],
}).catch((err) => console.error(err))
