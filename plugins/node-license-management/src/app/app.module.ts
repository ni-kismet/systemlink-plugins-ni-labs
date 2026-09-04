import { APP_BASE_HREF, CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';

import {
  NimbleBannerModule,
  NimbleButtonModule,
  NimbleIconArrowRotateRightModule,
  NimbleIconDownloadModule,
  NimbleSpinnerModule,
  NimbleThemeProviderModule,
  NimbleTooltipModule,
} from '@ni/nimble-angular';
import { NimbleLabelProviderCoreModule } from '@ni/nimble-angular/label-provider/core';
import { NimbleMappingIconModule } from '@ni/nimble-angular/mapping/icon';
import { NimbleTableModule } from '@ni/nimble-angular/table';
import { NimbleTableColumnAnchorModule } from '@ni/nimble-angular/table-column/anchor';
import { NimbleTableColumnMappingModule } from '@ni/nimble-angular/table-column/mapping';
import { NimbleTableColumnTextModule } from '@ni/nimble-angular/table-column/text';
import { OkFvStickyHeaderModule } from '@ni/ok-angular/fv/sticky-header';
import { OkFvSummaryPanelModule } from '@ni/ok-angular/fv/summary-panel';
import { OkFvSummaryPanelTileModule } from '@ni/ok-angular/fv/summary-panel-tile';

// Registers the <nimble-icon-circle-filled> element used by the status mapping columns.
import '@ni/nimble-components/dist/esm/icons/circle-filled';

import { AppRoutingModule } from './app-routing.module';
import { HomePageComponent } from './features/home/home-page.component';
import { EmptyStateComponent } from './shared/components/empty-state.component';
import { ErrorBannerComponent } from './shared/components/error-banner.component';
import { LoadingStateComponent } from './shared/components/loading-state.component';

@NgModule({
  declarations: [
    HomePageComponent,
    LoadingStateComponent,
    ErrorBannerComponent,
    EmptyStateComponent,
  ],
  imports: [
    CommonModule,
    AppRoutingModule,
    NimbleThemeProviderModule,
    NimbleLabelProviderCoreModule,
    NimbleBannerModule,
    NimbleButtonModule,
    NimbleIconArrowRotateRightModule,
    NimbleIconDownloadModule,
    NimbleSpinnerModule,
    NimbleTableModule,
    NimbleTooltipModule,
    NimbleTableColumnTextModule,
    NimbleTableColumnAnchorModule,
    NimbleTableColumnMappingModule,
    NimbleMappingIconModule,
    OkFvStickyHeaderModule,
    OkFvSummaryPanelModule,
    OkFvSummaryPanelTileModule,
  ],
  providers: [{ provide: APP_BASE_HREF, useValue: '/' }],
})
export class AppModule {}
