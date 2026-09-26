import { caddiePhrase, clubWords } from './voiceCaddie';

it('speaks clubs naturally', () => {
  expect(clubWords('8i')).toBe('8 iron');
  expect(clubWords('Dr 9°')).toBe('driver');
  expect(clubWords('3W 15°')).toBe('3 wood');
  expect(clubWords('52°')).toBe('52 degree wedge');
});

it('builds the caddie line', () => {
  expect(caddiePhrase({ pin: 164, playsLike: 168, club: '8i', unit: 'yards', lang: 'en' })).toBe('164 to pin, plays like 168, recommend 8 iron.');
  expect(caddiePhrase({ pin: 150, playsLike: 150, unit: 'meters', lang: 'en' })).toBe('150 meters to pin.');
  expect(caddiePhrase({ pin: 150, playsLike: 154, club: 'PW', unit: 'meters', lang: 'es' })).toBe('150 metros a la bandera, juega como 154, recomiendo pitching wedge.');
  expect(caddiePhrase({ pin: 532, line: 250, playsLike: 248, club: 'Dr 9°', unit: 'yards', lang: 'en' })).toBe('532 to pin. Layup 250, plays like 248, recommend driver.');
});
