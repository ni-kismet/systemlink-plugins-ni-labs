import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import {
  NimbleBannerModule,
  NimbleButtonModule,
  NimbleDialogModule,
  NimbleIconArrowRotateRightModule,
  NimbleIconCheckModule,
  NimbleIconLockModule,
  NimbleIconMagnifyingGlassModule,
  NimbleIconXmarkModule,
  NimbleSpinnerModule,
  NimbleTextFieldModule,
  NimbleThemeProviderModule
} from '@ni/nimble-angular';
import { NimbleTableModule } from '@ni/nimble-angular/table';
import { NimbleTableColumnTextModule } from '@ni/nimble-angular/table-column/text';
import { NimbleTableColumnMappingModule } from '@ni/nimble-angular/table-column/mapping';
import { NimbleMappingIconModule } from '@ni/nimble-angular/mapping/icon';
import { OkFvSummaryPanelModule } from '@ni/ok-angular/fv/summary-panel';
import { OkFvSummaryPanelTileModule } from '@ni/ok-angular/fv/summary-panel-tile';
import { OkFvStickyHeaderModule } from '@ni/ok-angular/fv/sticky-header';

import { LinkTextColumnDirective, SeverityTextColumnDirective } from './custom-table-columns';

// Registers the custom design-system table columns (app-severity-text-column,
// app-link-text-column) as Nimble custom elements.
import './severity-text-column';

const NIMBLE_MODULES = [
  NimbleThemeProviderModule,
  NimbleTextFieldModule,
  NimbleButtonModule,
  NimbleBannerModule,
  NimbleSpinnerModule,
  NimbleDialogModule,
  NimbleTableModule,
  NimbleTableColumnTextModule,
  NimbleTableColumnMappingModule,
  NimbleMappingIconModule,
  NimbleIconCheckModule,
  NimbleIconXmarkModule,
  NimbleIconLockModule,
  NimbleIconMagnifyingGlassModule,
  NimbleIconArrowRotateRightModule,
  OkFvStickyHeaderModule,
  OkFvSummaryPanelModule,
  OkFvSummaryPanelTileModule
];

/**
 * Centralized feature module that exposes the Nimble Angular wrapper modules and
 * the custom table-column directives used across the app.
 */
@NgModule({
  imports: [CommonModule, FormsModule, ...NIMBLE_MODULES, SeverityTextColumnDirective, LinkTextColumnDirective],
  exports: [CommonModule, FormsModule, ...NIMBLE_MODULES, SeverityTextColumnDirective, LinkTextColumnDirective]
})
export class AppModule {}
