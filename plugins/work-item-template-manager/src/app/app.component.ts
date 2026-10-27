import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { Theme } from '@ni/nimble-angular';
import { readLocalStorage } from './core/utils/language.utils';

const THEME_STORAGE_KEY = 'theme';

/** Root application component. Bootstraps the theme. */
@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  standalone: false,
  styleUrl: './app.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent implements OnInit, OnDestroy {
  public theme: Theme = this.loadThemeFromStorage();

  /**
   * CSS `color-scheme` for the app root so native browser controls (e.g. the datetime picker popup)
   * render in the correct light/dark palette. Nimble's `color` theme is dark-based, so it maps to dark.
   */
  public get colorScheme(): 'light' | 'dark' {
    return this.theme === Theme.light ? 'light' : 'dark';
  }

  private readonly onStorage = (event: StorageEvent): void => {
    if (event.key === THEME_STORAGE_KEY && event.newValue !== event.oldValue) {
      this.applyThemeFromStorage();
    }
  };

  private readonly onVisibilityOrFocus = (): void => {
    if (!document.hidden) {
      this.applyThemeFromStorage();
    }
  };

  public constructor(private readonly changeDetectorRef: ChangeDetectorRef) {}

  /** Watch for theme changes in the application */
  public ngOnInit(): void {
    this.watchThemeChanges();
  }

  public ngOnDestroy(): void {
    window.removeEventListener('storage', this.onStorage);
    window.removeEventListener('focus', this.onVisibilityOrFocus);
    document.removeEventListener('visibilitychange', this.onVisibilityOrFocus);
  }

  /** Reads the stored theme key from local storage and returns it if valid, else dark. */
  private loadThemeFromStorage(): Theme {
    const storedTheme = readLocalStorage(THEME_STORAGE_KEY);

    if (storedTheme) {
      const validThemes = Object.values(Theme) as string[];

      if (validThemes.includes(storedTheme)) {
        return storedTheme as Theme;
      }
    }

    return Theme.dark;
  }

  /** Applies the current local-storage theme to the theme provider, if changed. */
  private applyThemeFromStorage(): void {
    const nextTheme = this.loadThemeFromStorage();
    if (this.theme === nextTheme) {
      return;
    }

    this.theme = nextTheme;
    this.changeDetectorRef.markForCheck();
  }

  /** Listens for theme changes in storage and page activation to keep theme synced without reloads. */
  private watchThemeChanges(): void {
    window.addEventListener('storage', this.onStorage);
    window.addEventListener('focus', this.onVisibilityOrFocus);
    document.addEventListener('visibilitychange', this.onVisibilityOrFocus);
  }
}
