import { NgModule, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  NimbleAnchorModule,
  NimbleBannerModule,
  NimbleIconArrowRightThinModule,
} from '@ni/nimble-angular';
import { NotificationBannerComponent } from './components/notification-banner/notification-banner.component';

/** Core module containing shared components and services. */
@NgModule({
  declarations: [NotificationBannerComponent],
  imports: [CommonModule, NimbleBannerModule, NimbleAnchorModule, NimbleIconArrowRightThinModule],
  exports: [NotificationBannerComponent],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class CoreModule {}
