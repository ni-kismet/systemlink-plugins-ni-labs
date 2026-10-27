import { TestBed } from '@angular/core/testing';
import { Theme } from '@ni/nimble-angular';
import { readLocalStorage } from './core/utils/language.utils';
import { AppComponent } from './app.component';

describe('theme preferences', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ declarations: [AppComponent] }).overrideComponent(
      AppComponent,
      { set: { template: '' } },
    );
  });

  for (const blockedAccess of ['getter', 'getItem'] as const) {
    it(`starts and keeps watching theme changes when storage ${blockedAccess} is denied`, () => {
      const storage = window.localStorage;
      const getter = spyOnProperty(window, 'localStorage', 'get').and.returnValue(storage);
      const getItem = spyOn(Storage.prototype, 'getItem').and.returnValue(null);
      const warning = spyOn(console, 'warn');
      function deny(): never {
        throw new DOMException('Access denied', 'SecurityError');
      }
      if (blockedAccess === 'getter') {
        getter.and.callFake(deny);
      } else {
        getItem.and.callFake(deny);
      }

      const fixture = TestBed.createComponent(AppComponent);
      fixture.detectChanges();
      expect(fixture.componentInstance.theme).toBe(Theme.dark);
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'theme',
          oldValue: Theme.light,
          newValue: Theme.dark,
        }),
      );
      expect(warning).toHaveBeenCalledTimes(2);

      getter.and.returnValue(storage);
      getItem.and.returnValue(Theme.light);
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'theme',
          oldValue: Theme.dark,
          newValue: Theme.light,
        }),
      );
      expect(fixture.componentInstance.theme).toBe(Theme.light);
      expect(fixture.componentInstance.colorScheme).toBe('light');
    });
  }

  it('does not silently hide unexpected storage errors', () => {
    spyOn(Storage.prototype, 'getItem').and.throwError('unexpected');
    expect(() => readLocalStorage('theme')).toThrowError('unexpected');
  });

  it('retains the default theme for an unrecognized preference', () => {
    spyOn(Storage.prototype, 'getItem').and.returnValue('unrecognized');
    const fixture = TestBed.createComponent(AppComponent);
    expect(fixture.componentInstance.theme).toBe(Theme.dark);
  });
});
