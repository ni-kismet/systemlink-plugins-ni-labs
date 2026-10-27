import { ChangeDetectionStrategy, Component, input, output, viewChild } from '@angular/core';
import { DrawerLocation, NimbleDrawerDirective, NimbleTabsDirective } from '@ni/nimble-angular';
import { IGridColumn } from '../../models/grid-column-config.models';
import { GridColumnConfigComponent } from '../grid-column-config/grid-column-config.component';
import { GridGroupingConfigComponent } from '../grid-grouping-config/grid-grouping-config.component';

/** Slideout drawer that hosts the grid column and grouping configuration tabs. */
@Component({
  selector: 'app-grid-config-slideout',
  templateUrl: './grid-config-slideout.component.html',
  styleUrl: './grid-config-slideout.component.scss',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GridConfigSlideoutComponent {
  public readonly allColumns = input<IGridColumn[]>([]);
  public readonly visibleColumnIds = input<string[]>([]);
  public readonly groupByIds = input<string[]>([]);
  public readonly configUpdated = output<{ columns: string[]; groupBy: string[] }>();
  protected readonly drawerLocation = DrawerLocation.right;
  private readonly drawerDirective = viewChild.required('drawer', { read: NimbleDrawerDirective });
  private readonly tabsDirective = viewChild.required('tabs', { read: NimbleTabsDirective });
  private readonly columnConfig = viewChild.required(GridColumnConfigComponent);
  private readonly groupingConfig = viewChild.required(GridGroupingConfigComponent);

  /** Opens the drawer and resets both child configs. */
  public openPanel(): void {
    this.tabsDirective().activeid = 'columns-tab';
    this.columnConfig().reset();
    this.groupingConfig().reset();
    void this.drawerDirective().show();
  }

  /** Discards unsaved changes in both child configs and closes the drawer. */
  public closePanel(): void {
    this.columnConfig().reset();
    this.groupingConfig().reset();
    this.drawerDirective().close(undefined);
  }

  /** Collects values from both child configs, emits a single combined update, and closes the drawer. */
  public saveAndClose(): void {
    this.configUpdated.emit({
      columns: this.columnConfig().getSelectedColumns(),
      groupBy: this.groupingConfig().getSelectedGroups(),
    });
    this.drawerDirective().close(undefined);
  }
}
