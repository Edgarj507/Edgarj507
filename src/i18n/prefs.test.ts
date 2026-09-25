import { convert, detectPrefs } from './prefs';
import { LANGUAGES, translate } from './strings';

describe('detectPrefs', () => {
  it.each([
    [['en-US'], 'en', 'yards'],
    [['en-GB'], 'en', 'yards'],
    [['en-AU'], 'en', 'meters'],
    [['es-ES', 'en'], 'es', 'meters'],
    [['es-US'], 'es', 'yards'],
    [['es_MX'], 'es', 'meters'],
    [['fr-CA'], 'fr', 'yards'],
    [['de'], 'de', 'meters'],
    [['ja-JP', 'es-ES'], 'es', 'meters'], // first *supported* language wins
    [['ja-JP'], 'en', 'meters'], // unsupported: English text, region still sets units
    [[], 'en', 'yards'],
  ])('%j → %s / %s', (locales, lang, units) => expect(detectPrefs(locales)).toEqual({ lang, units }));
});

describe('strings', () => {
  it('falls back to English for missing keys', () => {
    expect(translate('pt', 'putt.confirmCup')).toBe('Confirm cup position');
    expect(translate('es', 'hud.logShot')).toBe('Registrar golpe');
  });
  it('Spanish is complete', () => {
    const en = Object.keys(LANGUAGES.en.dict);
    expect(en.filter((k) => !(k in LANGUAGES.es.dict))).toEqual([]);
  });
});

it('converts yards to meters for display', () => {
  expect(Math.round(convert(164, 'meters'))).toBe(150);
  expect(convert(164, 'yards')).toBe(164);
});
