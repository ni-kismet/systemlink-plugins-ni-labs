import { Component } from '@angular/core';

import { NimbleThemeProviderModule } from '@ni/nimble-angular';
import { NimbleLabelProviderCoreModule } from '@ni/nimble-angular/label-provider/core';
import { NimbleLabelProviderTableModule } from '@ni/nimble-angular/label-provider/table';

import { ThemeSyncService } from './core/systemlink/theme-sync.service';
import { AppShellComponent } from './core/layout/app-shell.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [NimbleThemeProviderModule, NimbleLabelProviderCoreModule, NimbleLabelProviderTableModule, AppShellComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  constructor(public readonly themeSync: ThemeSyncService) {}
}
