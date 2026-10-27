import { NgModule, CUSTOM_ELEMENTS_SCHEMA, LOCALE_ID } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { NimbleThemeProviderModule } from '@ni/nimble-angular';
import { NimbleLabelProviderCoreModule } from '@ni/nimble-angular/label-provider/core';
import { NimbleLabelProviderTableModule } from '@ni/nimble-angular/label-provider/table';

import { AppComponent } from './app.component';
import { CoreModule } from './core/core.module';
import { TestplanTemplatesModule } from './test-plan-templates/test-plan-templates.module';
import { defaultHeadersInterceptor } from './core/interceptors/default-headers.interceptor';
import { exponentialRetryInterceptor } from './core/interceptors/exponential-retry.interceptor';
import { getSystemLinkLanguage } from './core/utils/language.utils';

/** Root module for the Work Item Template Manager application. */
@NgModule({
  declarations: [AppComponent],
  imports: [
    BrowserModule,
    CoreModule,
    TestplanTemplatesModule,
    NimbleThemeProviderModule,
    NimbleLabelProviderCoreModule,
    NimbleLabelProviderTableModule,
  ],
  providers: [
    // Same as SystemLink: formatting follows the UI language (e.g. 'de'), not the OS region.
    { provide: LOCALE_ID, useFactory: getSystemLinkLanguage },
    provideHttpClient(withInterceptors([defaultHeadersInterceptor, exponentialRetryInterceptor])),
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  bootstrap: [AppComponent],
})
export class AppModule {}
