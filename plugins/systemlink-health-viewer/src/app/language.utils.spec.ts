import { getSystemLinkLanguage } from './language.utils';

describe('getSystemLinkLanguage', () => {
  let getItem: jasmine.Spy;

  beforeEach(() => {
    getItem = spyOn(globalThis.localStorage, 'getItem').and.returnValue(null);
  });

  it('normalizes the primary stored language preference', () => {
    getItem.and.callFake((key: string) => (key === 'language' ? 'DE-de' : null));

    expect(getSystemLinkLanguage()).toBe('de');
  });

  it('uses a valid legacy preference when the primary value is unsupported', () => {
    getItem.and.callFake((key: string) => {
      if (key === 'language') {
        return 'unsupported';
      }
      return key === 'skyline-api-languages' ? 'FR-fr,en-US' : null;
    });

    expect(getSystemLinkLanguage()).toBe('fr');
  });

  it('prefers a valid primary preference over the legacy value', () => {
    getItem.and.callFake((key: string) => {
      if (key === 'language') {
        return 'ja-JP';
      }
      return key === 'skyline-api-languages' ? 'de-DE' : null;
    });

    expect(getSystemLinkLanguage()).toBe('ja');
  });

  it('falls back to the browser locale when stored preferences are unsupported', () => {
    getItem.and.returnValue('unsupported');
    spyOnProperty(globalThis.navigator, 'languages', 'get').and.returnValue(['zh-CN']);

    expect(getSystemLinkLanguage()).toBe('zh');
  });
});
