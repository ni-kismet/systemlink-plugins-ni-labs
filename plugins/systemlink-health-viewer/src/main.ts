import { APP_BASE_HREF } from '@angular/common';
import { enableProdMode } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideHttpClient } from '@angular/common/http';
import { AppComponent } from './app/app.component';
import { environment } from './environments/environment';

if (environment.production) {
  enableProdMode();
}

bootstrapApplication(AppComponent, {
  providers: [
    provideHttpClient(),
    { provide: APP_BASE_HREF, useValue: '/' }
  ]
}).catch(err => console.error('Bootstrap error:', err));
