/**
 * Equipment catalog for the My Bag wizard. Each model lists the options a golfer picks from:
 * lofts for woods/wedges, individual clubs for iron sets, head shapes for putters.
 * Current-generation lineups; availability of specific lofts varies by region/custom order.
 */

export type Category = 'Drivers' | 'Fairways' | 'Hybrids' | 'Irons' | 'Wedges' | 'Putters';
export const CATEGORIES: Category[] = ['Drivers', 'Fairways', 'Hybrids', 'Irons', 'Wedges', 'Putters'];

export interface Model {
  name: string;
  category: Category;
  options: string[];
}

export type Brand =
  | 'Titleist' | 'TaylorMade' | 'Callaway' | 'Ping' | 'Cobra' | 'Mizuno'
  | 'PXG' | 'Srixon' | 'Cleveland' | 'Wilson';

// --- option builders ---
const deg = (...l: number[]) => l.map((n) => `${Number.isInteger(n) ? n.toFixed(1) : n}°`);
const wedge = (from: number, to: number, step = 2) => {
  const out: string[] = [];
  for (let d = from; d <= to; d += step) out.push(`${d}°`);
  return out;
};
const IRON_ORDER = ['2i', '3i', '4i', '5i', '6i', '7i', '8i', '9i', 'PW', 'W', 'AW', 'GW', 'SW'];
/** Iron set from `first` to `last` inclusive, e.g. irons('4i', 'W'). */
const irons = (first: string, last: string) => IRON_ORDER.slice(IRON_ORDER.indexOf(first), IRON_ORDER.indexOf(last) + 1);

const m = (category: Category, name: string, options: string[]): Model => ({ name, category, options });

const DRIVER_STD = deg(9, 10.5, 12);
const DRIVER_LOW = deg(8, 9, 10.5);

export const EQUIPMENT: Record<Brand, Model[]> = {
  Titleist: [
    m('Drivers', 'GT1', deg(9, 10.5, 12)),
    m('Drivers', 'GT2', deg(8, 9, 10, 11)),
    m('Drivers', 'GT3', deg(8, 9, 10, 11)),
    m('Drivers', 'GT4', deg(8, 9, 10)),
    m('Drivers', 'TSR2', deg(8, 9, 10, 11)),
    m('Drivers', 'TSR3', deg(8, 9, 10, 11)),
    m('Drivers', 'TSR4', deg(8, 9, 10)),
    m('Fairways', 'GT2 Fairway', deg(13.5, 15, 16.5, 18, 21)),
    m('Fairways', 'GT3 Fairway', deg(13.5, 15, 16.5, 18)),
    m('Fairways', 'TSR1 Fairway', deg(15, 18, 20, 23)),
    m('Fairways', 'TSR2 Fairway', deg(13, 15, 16.5, 18, 21)),
    m('Fairways', 'TSR3 Fairway', deg(13.5, 15, 16.5, 18)),
    m('Hybrids', 'GT2 Hybrid', deg(17, 19, 21, 23)),
    m('Hybrids', 'GT3 Hybrid', deg(18, 20, 22)),
    m('Hybrids', 'TSR2 Hybrid', deg(18, 21, 24)),
    m('Hybrids', 'TSR3 Hybrid', deg(18, 20, 22)),
    m('Irons', 'T100', irons('3i', 'W')),
    m('Irons', 'T150', irons('3i', 'W')),
    m('Irons', 'T200', irons('3i', 'W')),
    m('Irons', 'T250', irons('4i', 'W')),
    m('Irons', 'T350', irons('4i', 'AW')),
    m('Irons', 'T400', irons('5i', 'AW')),
    m('Irons', '620 MB', irons('3i', 'PW')),
    m('Irons', '620 CB', irons('3i', 'PW')),
    m('Irons', 'U505 Utility', ['1i', ...irons('2i', '4i')]),
    m('Wedges', 'Vokey SM10', wedge(46, 62)),
    m('Wedges', 'Vokey WedgeWorks', wedge(50, 62)),
    m('Putters', 'Scotty Cameron Super Select', ['Newport', 'Newport Plus', 'Newport 2', 'Newport 2 Plus', 'Newport 2.5', 'Del Mar', 'Squareback 2', 'Fastback 1.5', 'GOLO 6.5']),
    m('Putters', 'Scotty Cameron Phantom', ['Phantom 5', 'Phantom 5.5', 'Phantom 7', 'Phantom 7.5', 'Phantom 9', 'Phantom 11', 'Phantom 11.5']),
    m('Putters', 'Scotty Cameron Special Select', ['Newport', 'Newport 2', 'Newport 2.5', 'Del Mar', 'Squareback 2', 'Fastback 1.5', 'Flowback 5']),
    m('Putters', 'Scotty Cameron Studio Style', ['Newport', 'Newport 2', 'Newport 2.5', 'Fastback 1.5']),
  ],

  TaylorMade: [
    m('Drivers', 'Qi35', DRIVER_STD),
    m('Drivers', 'Qi35 Max', DRIVER_STD),
    m('Drivers', 'Qi35 LS', DRIVER_LOW),
    m('Drivers', 'Qi10', DRIVER_STD),
    m('Drivers', 'Qi10 Max', DRIVER_STD),
    m('Drivers', 'Qi10 LS', DRIVER_LOW),
    m('Fairways', 'Qi35 Fairway', deg(15, 16.5, 18, 21)),
    m('Fairways', 'Qi10 Fairway', deg(15, 16.5, 18, 21)),
    m('Fairways', 'Qi10 Max Fairway', deg(15, 16, 18, 21, 24)),
    m('Fairways', 'Qi10 Tour Fairway', deg(13.5, 15, 18)),
    m('Hybrids', 'Qi35 Rescue', deg(19, 22, 25, 28)),
    m('Hybrids', 'Qi10 Rescue', deg(19, 22, 25, 28)),
    m('Irons', 'P790', irons('3i', 'AW')),
    m('Irons', 'P770', irons('3i', 'AW')),
    m('Irons', 'P7MC', irons('3i', 'PW')),
    m('Irons', 'P7MB', irons('3i', 'PW')),
    m('Irons', 'P7CB', irons('3i', 'PW')),
    m('Irons', 'Qi Irons', irons('4i', 'SW')),
    m('Wedges', 'MG4', wedge(46, 60)),
    m('Wedges', 'Hi-Toe 3', wedge(50, 64)),
    m('Putters', 'Spider Tour', ['Spider Tour', 'Spider Tour X', 'Spider Tour Z', 'Spider Tour V', 'Spider Tour Black']),
    m('Putters', 'TP Reserve', ['B11', 'B13', 'M21', 'M27', 'M47']),
  ],

  Callaway: [
    m('Drivers', 'Elyte', DRIVER_STD),
    m('Drivers', 'Elyte X', DRIVER_STD),
    m('Drivers', 'Elyte Triple Diamond', DRIVER_LOW),
    m('Drivers', 'Paradym Ai Smoke Max', DRIVER_STD),
    m('Drivers', 'Paradym Ai Smoke Max D', DRIVER_STD),
    m('Drivers', 'Paradym Ai Smoke Max Fast', DRIVER_STD),
    m('Drivers', 'Paradym Ai Smoke Triple Diamond', DRIVER_LOW),
    m('Drivers', 'Paradym Ai Smoke Triple Diamond Max', DRIVER_LOW),
    m('Fairways', 'Elyte Fairway', deg(15, 16.5, 18, 21)),
    m('Fairways', 'Paradym Ai Smoke Max Fairway', deg(15, 16.5, 18, 21, 24)),
    m('Fairways', 'Paradym Ai Smoke Triple Diamond Fairway', deg(13.5, 15, 16.5, 18)),
    m('Hybrids', 'Paradym Ai Smoke Hybrid', deg(18, 21, 24, 27)),
    m('Hybrids', 'Apex UW', deg(17, 19, 21, 23)),
    m('Irons', 'Apex Pro', irons('3i', 'AW')),
    m('Irons', 'Apex CB', irons('3i', 'PW')),
    m('Irons', 'Apex MB', irons('3i', 'PW')),
    m('Irons', 'Apex DCB', irons('4i', 'AW')),
    m('Irons', 'Apex Ai200', irons('4i', 'AW')),
    m('Irons', 'Apex Ai300', irons('4i', 'AW')),
    m('Wedges', 'Opus', wedge(48, 60)),
    m('Wedges', 'Opus Platinum', wedge(50, 60)),
    m('Wedges', 'Jaws Raw', wedge(48, 64)),
    m('Putters', 'Odyssey Ai-ONE', ['#1', '#7', 'Double Wide', 'Jailbird Mini', 'Rossie S', 'Seven S', 'Square 2 Square']),
    m('Putters', 'Odyssey Ai-ONE Milled', ['One T', 'Two T', 'Three T', 'Seven T', 'Eight T', 'Eleven T']),
    m('Putters', 'Odyssey White Hot OG', ['#1', '#2', '#5', '#7', 'Rossie', 'Double Wide', 'Seven S']),
  ],

  Ping: [
    m('Drivers', 'G440 Max', DRIVER_STD),
    m('Drivers', 'G440 LST', DRIVER_LOW),
    m('Drivers', 'G440 SFT', deg(10.5, 12)),
    m('Drivers', 'G440 K', DRIVER_STD),
    m('Drivers', 'G430 Max', DRIVER_STD),
    m('Drivers', 'G430 Max 10K', DRIVER_STD),
    m('Drivers', 'G430 LST', DRIVER_LOW),
    m('Drivers', 'G430 SFT', deg(10.5, 12)),
    m('Fairways', 'G440 Max Fairway', deg(15, 18, 20.5, 23.5)),
    m('Fairways', 'G430 Max Fairway', deg(15, 18, 20.5, 23.5, 26.5)),
    m('Fairways', 'G430 LST Fairway', deg(14.5, 17)),
    m('Fairways', 'G430 SFT Fairway', deg(16, 19, 22)),
    m('Hybrids', 'G440 Hybrid', deg(17, 19, 22, 26)),
    m('Hybrids', 'G430 Hybrid', deg(17, 19, 22, 26, 30)),
    m('Irons', 'Blueprint S', irons('3i', 'PW')),
    m('Irons', 'Blueprint T', irons('3i', 'PW')),
    m('Irons', 'i230', irons('3i', 'W')),
    m('Irons', 'i530', irons('3i', 'W')),
    m('Irons', 'G730', irons('4i', 'SW')),
    m('Irons', 'G430', irons('4i', 'SW')),
    m('Wedges', 's159', wedge(46, 62)),
    m('Wedges', 'Glide 4.0', wedge(46, 62)),
    m('Putters', 'PLD Milled', ['Anser', 'Anser 2D', 'DS72', 'Oslo 4', 'Prime Tyne 4', 'Ally Blue 4']),
    m('Putters', 'PING 2024', ['Anser', 'Anser 2D', 'Kushin 4', 'Tomcat 14', 'Tyne G', 'Mundy', 'Ketsch G']),
  ],

  Cobra: [
    m('Drivers', 'DS-Adapt X', DRIVER_STD),
    m('Drivers', 'DS-Adapt LS', DRIVER_LOW),
    m('Drivers', 'DS-Adapt Max-K', DRIVER_STD),
    m('Drivers', 'Darkspeed X', DRIVER_STD),
    m('Drivers', 'Darkspeed LS', DRIVER_LOW),
    m('Drivers', 'Darkspeed Max', DRIVER_STD),
    m('Fairways', 'DS-Adapt Fairway', deg(15, 18, 21, 24)),
    m('Fairways', 'Darkspeed Fairway', deg(15, 18, 21, 24)),
    m('Hybrids', 'DS-Adapt Hybrid', deg(17, 19, 21, 24)),
    m('Irons', 'King Tour', irons('3i', 'PW')),
    m('Irons', 'King Tour MB', irons('3i', 'PW')),
    m('Irons', 'King Forged Tec', irons('4i', 'GW')),
    m('Irons', 'King Forged Tec X', irons('4i', 'GW')),
    m('Irons', 'DS-Adapt Irons', irons('5i', 'SW')),
    m('Wedges', 'King Snakebite', wedge(50, 60)),
    m('Wedges', 'King MIM Wedge', wedge(50, 60)),
    m('Putters', 'King 3D Printed', ['Agera', 'Grandsport-35', 'Nova', 'Supernova', 'Stingray', 'Vintage Sport-45']),
  ],

  Mizuno: [
    m('Drivers', 'ST-Max 230', DRIVER_STD),
    m('Drivers', 'ST-Z 230', DRIVER_LOW),
    m('Drivers', 'ST-X 230', DRIVER_STD),
    m('Drivers', 'ST-G', DRIVER_LOW),
    m('Fairways', 'ST-Max 230 Fairway', deg(15, 18, 21)),
    m('Fairways', 'ST-Z 230 Fairway', deg(15, 18)),
    m('Hybrids', 'ST-Max 230 Hybrid', deg(18, 22, 25)),
    m('Irons', 'Pro 241', irons('3i', 'PW')),
    m('Irons', 'Pro 243', irons('3i', 'PW')),
    m('Irons', 'Pro 245', irons('3i', 'GW')),
    m('Irons', 'JPX925 Forged', irons('4i', 'GW')),
    m('Irons', 'JPX925 Hot Metal', irons('4i', 'SW')),
    m('Irons', 'JPX925 Hot Metal Pro', irons('4i', 'GW')),
    m('Irons', 'JPX925 Tour', irons('4i', 'PW')),
    m('Wedges', 'T24', wedge(46, 62)),
    m('Wedges', 'Pro Fly-Hi', wedge(50, 60)),
    m('Putters', 'M.Craft OMOI', ['Type I', 'Type III', 'Type IV', 'Type VI']),
  ],

  PXG: [
    m('Drivers', 'Black Ops', DRIVER_STD),
    m('Drivers', 'Black Ops Tour-1', DRIVER_LOW),
    m('Drivers', 'Black Ops Ultra Lite', deg(10.5, 12)),
    m('Drivers', '0311 GEN6 XF', DRIVER_STD),
    m('Fairways', 'Black Ops Fairway', deg(15, 18, 21)),
    m('Fairways', 'Black Ops Tour-1 Fairway', deg(15, 18)),
    m('Hybrids', 'Black Ops Hybrid', deg(19, 22, 25)),
    m('Irons', '0311 P GEN7', irons('4i', 'GW')),
    m('Irons', '0311 T GEN7', irons('3i', 'PW')),
    m('Irons', '0311 XP GEN7', irons('4i', 'GW')),
    m('Irons', '0311 ST GEN6', irons('3i', 'PW')),
    m('Irons', '0317 ST', irons('3i', 'PW')),
    m('Wedges', '0311 Sugar Daddy III', wedge(46, 62)),
    m('Wedges', '0311 Forged Wedge', wedge(50, 60)),
    m('Putters', 'Battle Ready II', ['Blackjack', 'Bat Attack', 'Brandon', 'Closer', 'Drone', 'One and Done', 'Operator']),
    m('Putters', 'Allan', ['Allan', 'Allan Tour']),
  ],

  Srixon: [
    m('Drivers', 'ZXi', DRIVER_STD),
    m('Drivers', 'ZXi LS', DRIVER_LOW),
    m('Drivers', 'ZXi Max', DRIVER_STD),
    m('Drivers', 'ZXi TR', DRIVER_LOW),
    m('Fairways', 'ZXi Fairway', deg(15, 18, 21)),
    m('Fairways', 'ZXi TR Fairway', deg(13.5, 15, 18)),
    m('Hybrids', 'ZXi Hybrid', deg(16, 19, 22, 25)),
    m('Irons', 'ZXi4', irons('4i', 'AW')),
    m('Irons', 'ZXi5', irons('3i', 'AW')),
    m('Irons', 'ZXi7', irons('3i', 'PW')),
    m('Irons', 'Z-Forged II', irons('3i', 'PW')),
    m('Irons', 'ZXiU Utility', irons('2i', '4i')),
  ],

  Cleveland: [
    m('Hybrids', 'Launcher XL Halo', deg(18, 21, 24, 27)),
    m('Irons', 'Launcher XL Irons', irons('5i', 'SW')),
    m('Wedges', 'RTX 6 ZipCore', wedge(46, 64)),
    m('Wedges', 'RTX Full-Face 2', wedge(50, 64)),
    m('Wedges', 'CBX 4 ZipCore', wedge(44, 60)),
    m('Wedges', 'Smart Sole Full-Face', ['S (58°)', 'G (50°)', 'C (42°)', 'L (64°)']),
    m('Putters', 'Frontline Elite', ['#1', '#8', '#11', 'Cero', 'Elevado', 'Rho']),
    m('Putters', 'HB Soft 2', ['#1', '#8', '#10', '#11', '#15']),
  ],

  Wilson: [
    m('Drivers', 'Dynapower', DRIVER_STD),
    m('Drivers', 'Dynapower LS', DRIVER_LOW),
    m('Drivers', 'Dynapower Titanium', DRIVER_STD),
    m('Fairways', 'Dynapower Fairway', deg(15, 18, 21)),
    m('Hybrids', 'Dynapower Hybrid', deg(19, 22, 25)),
    m('Irons', 'Staff Model Blade', irons('3i', 'PW')),
    m('Irons', 'Staff Model CB', irons('3i', 'PW')),
    m('Irons', 'Staff Model Utility', irons('2i', '4i')),
    m('Irons', 'Dynapower Forged', irons('4i', 'GW')),
    m('Wedges', 'Staff Model Hi-Toe', wedge(50, 60)),
    m('Wedges', 'Staff Model R', wedge(48, 62)),
    m('Putters', 'Staff Model', ['BL22', 'MT22', 'TM22', 'CT22']),
    m('Putters', 'Infinite', ['Buckingham', 'Bean', 'Grant Park', 'Windy City', 'South Side']),
  ],
};

export const BRANDS = Object.keys(EQUIPMENT) as Brand[];

/** Stable id for a model across brands (model names repeat, e.g. "Fairway"). */
export const modelId = (brand: Brand, model: Model) => `${brand}::${model.name}`;
/** Stable id for a chosen option of a model. */
export const optionId = (brand: Brand, model: Model, option: string) => `${modelId(brand, model)}|${option}`;
