import { BRANDS, EQUIPMENT, optionId, type Brand } from './equipment';

const find = (brand: Brand, name: string) => EQUIPMENT[brand].find((m) => m.name === name);

describe('equipment catalog', () => {
  it('covers all ten brands', () => {
    expect(BRANDS).toEqual(['Titleist', 'TaylorMade', 'Callaway', 'Ping', 'Cobra', 'Mizuno', 'PXG', 'Srixon', 'Cleveland', 'Wilson']);
  });

  it('every model has options and ids are unique', () => {
    const ids = new Set<string>();
    for (const brand of BRANDS) {
      for (const model of EQUIPMENT[brand]) {
        expect(model.options.length, `${brand} ${model.name}`).toBeGreaterThan(0);
        for (const o of model.options) {
          const id = optionId(brand, model, o);
          expect(ids.has(id), id).toBe(false);
          ids.add(id);
        }
      }
    }
  });

  it('includes the requested lines', () => {
    expect(find('Titleist', 'Vokey SM10')?.options).toEqual(['46°', '48°', '50°', '52°', '54°', '56°', '58°', '60°', '62°']);
    for (const n of ['GT2', 'GT3', 'GT4', 'T100', 'T150', 'T200', 'T250', 'T350', 'T400', '620 MB', '620 CB']) expect(find('Titleist', n), n).toBeDefined();
    for (const n of ['Qi10', 'Qi10 Max', 'Qi10 LS', 'Qi10 Fairway', 'P790', 'P770', 'P7MC', 'P7MB', 'P7CB', 'MG4', 'Hi-Toe 3', 'Spider Tour']) expect(find('TaylorMade', n), n).toBeDefined();
    expect(find('Callaway', 'Jaws Raw')?.options.at(0)).toBe('48°');
    expect(find('Callaway', 'Jaws Raw')?.options.at(-1)).toBe('64°');
    for (const n of ['Apex Pro', 'Apex CB', 'Apex MB', 'Apex DCB', 'Opus']) expect(find('Callaway', n), n).toBeDefined();
    for (const n of ['G430 Max', 'G430 LST', 'G430 SFT', 'Blueprint S', 'Blueprint T', 'i230', 'i530', 'G730', 's159', 'PLD Milled']) expect(find('Ping', n), n).toBeDefined();
    expect(find('Titleist', 'T100')?.options).toContain('7i');
  });
});
