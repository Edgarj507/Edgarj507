import { clubFromOption, deriveBag, parseLoft } from './bag';
import { EQUIPMENT, optionId } from '../data/equipment';
import { recommendClub } from './caddie';

const model = (brand: keyof typeof EQUIPMENT, name: string) => EQUIPMENT[brand].find((m) => m.name === name)!;
const pick = (brand: keyof typeof EQUIPMENT, name: string, opts: string[]) => opts.map((o) => optionId(brand, model(brand, name), o));
const fallback = [{ label: 'X', carry: 100 }];

describe('clubFromOption', () => {
  it('maps lofts, irons and putters', () => {
    expect(clubFromOption(model('Titleist', 'GT2'), '9.0°')).toEqual({ label: 'Dr 9°', carry: 267 });
    expect(clubFromOption(model('Titleist', 'GT2 Fairway'), '15.0°')?.label).toBe('3W 15°');
    expect(clubFromOption(model('Titleist', 'GT2 Hybrid'), '21.0°')?.label).toBe('Hy 21°');
    expect(clubFromOption(model('Titleist', 'T100'), '7i')).toEqual({ label: '7i', carry: 165 });
    expect(clubFromOption(model('Titleist', 'Vokey SM10'), '56°')).toEqual({ label: '56°', carry: 90 });
    expect(clubFromOption(model('Ping', 'PLD Milled'), 'Anser')).toEqual({ label: 'Putter', carry: 0 });
  });
  it('parses lofts embedded in names', () => {
    expect(parseLoft('S (58°)')).toBe(58);
    expect(parseLoft('Anser')).toBeNull();
  });
});

describe('deriveBag', () => {
  const gear = {
    brands: ['Titleist', 'Ping'],
    models: [],
    options: [
      ...pick('Titleist', 'GT2', ['9.0°']),
      ...pick('Titleist', 'T100', ['6i', '7i', '8i']),
      ...pick('Titleist', 'Vokey SM10', ['52°', '58°']),
      ...pick('Ping', 'PLD Milled', ['Anser']),
      ...pick('Ping', 'i230', ['7i']), // duplicate label: first brand wins
    ],
  };

  it('builds a sorted, de-duplicated club list from gear', () => {
    const bag = deriveBag(gear, {}, fallback);
    expect(bag.map((c) => c.label)).toEqual(['Dr 9°', '6i', '7i', '8i', '52°', '58°', 'Putter']);
    expect(bag.find((c) => c.label === '7i')?.source).toBe('Titleist T100');
  });

  it('applies carry overrides and drives recommendations', () => {
    const bag = deriveBag(gear, { '7i': 172 }, fallback);
    expect(bag.find((c) => c.label === '7i')).toMatchObject({ carry: 172, estimated: false });
    expect(recommendClub(170, bag)?.label).toBe('7i');
  });

  it('ignores options from deselected brands and falls back when empty', () => {
    expect(deriveBag({ ...gear, brands: [] }, {}, fallback).map((c) => c.label)).toEqual(['X']);
  });
});
