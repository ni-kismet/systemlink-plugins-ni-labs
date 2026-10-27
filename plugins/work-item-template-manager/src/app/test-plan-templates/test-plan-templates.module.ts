import { NgModule, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { DragDropModule } from '@angular/cdk/drag-drop';
import {
  NimbleButtonModule,
  NimbleCheckboxModule,
  NimbleComboboxModule,
  NimbleDialogModule,
  NimbleDrawerModule,
  NimbleIconAddModule,
  NimbleIconCheckModule,
  NimbleIconCloneModule,
  NimbleIconFilterModule,
  NimbleIconFolderOpenModule,
  NimbleIconFourDotsSquareModule,
  NimbleIconCalendarDayModule,
  NimbleIconInfoCircleModule,
  NimbleIconPencilModule,
  NimbleIconThreeVerticalLinesModule,
  NimbleIconMagnifyingGlassModule,
  NimbleIconXmarkModule,
  NimbleListOptionModule,
  NimbleNumberFieldModule,
  NimbleSelectModule,
  NimbleTextAreaModule,
  NimbleTextFieldModule,
  NimbleSpinnerModule,
  NimbleTabModule,
  NimbleTabPanelModule,
  NimbleTabsModule,
  NimbleTooltipModule,
} from '@ni/nimble-angular';
import { NimbleTableModule } from '@ni/nimble-angular/table';
import { NimbleChipModule } from '@ni/nimble-angular/chip';
import { NimbleStepModule } from '@ni/nimble-angular/step';
import { NimbleStepperModule } from '@ni/nimble-angular/stepper';
import { NimbleTableColumnTextModule } from '@ni/nimble-angular/table-column/text';
import { NimbleTableColumnDateTextModule } from '@ni/nimble-angular/table-column/date-text';
import { TestplanTemplateTableComponent } from './components/testplan-template-table/testplan-template-table.component';
import { GridConfigSlideoutComponent } from './components/grid-config-slideout/grid-config-slideout.component';
import { GridColumnConfigComponent } from './components/grid-column-config/grid-column-config.component';
import { GridGroupingConfigComponent } from './components/grid-grouping-config/grid-grouping-config.component';
import { TestplanFiltersComponent } from './components/testplan-filters/testplan-filters.component';
import { TestplanCreateEditSlideoutComponent } from './components/testplan-create-edit-slideout/testplan-create-edit-slideout.component';
import { TestplanDuplicateSlideoutComponent } from './components/testplan-duplicate-slideout/testplan-duplicate-slideout.component';
import { LabelForIdPipe } from './pipes/label-for-id.pipe';

/** Module for test plan template feature components and functionality. */
@NgModule({
  declarations: [
    TestplanTemplateTableComponent,
    GridConfigSlideoutComponent,
    GridColumnConfigComponent,
    GridGroupingConfigComponent,
    TestplanFiltersComponent,
    TestplanCreateEditSlideoutComponent,
    TestplanDuplicateSlideoutComponent,
    LabelForIdPipe,
  ],
  imports: [
    CommonModule,
    DragDropModule,
    ReactiveFormsModule,
    NimbleButtonModule,
    NimbleCheckboxModule,
    NimbleChipModule,
    NimbleComboboxModule,
    NimbleDialogModule,
    NimbleDrawerModule,
    NimbleIconAddModule,
    NimbleIconCheckModule,
    NimbleIconCloneModule,
    NimbleIconFilterModule,
    NimbleIconFolderOpenModule,
    NimbleIconFourDotsSquareModule,
    NimbleIconCalendarDayModule,
    NimbleIconInfoCircleModule,
    NimbleIconPencilModule,
    NimbleIconThreeVerticalLinesModule,
    NimbleIconMagnifyingGlassModule,
    NimbleIconXmarkModule,
    NimbleListOptionModule,
    NimbleNumberFieldModule,
    NimbleSelectModule,
    NimbleSpinnerModule,
    NimbleTextAreaModule,
    NimbleTextFieldModule,
    NimbleTabModule,
    NimbleTabPanelModule,
    NimbleTabsModule,
    NimbleTooltipModule,
    NimbleStepModule,
    NimbleStepperModule,
    NimbleTableModule,
    NimbleTableColumnTextModule,
    NimbleTableColumnDateTextModule,
  ],
  exports: [TestplanTemplateTableComponent, TestplanFiltersComponent],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class TestplanTemplatesModule {}
