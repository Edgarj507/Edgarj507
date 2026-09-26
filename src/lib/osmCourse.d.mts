export interface ImportedHole { number: number; par: number; parSource: 'osm' | 'manual' | 'estimated'; yards: number; path: [number, number][]; green: [number, number] }
export interface ImportedCourse { name: string; source: string; attribution: string; license: string; holes: ImportedHole[] }
export function buildCourse(name: string, elements: unknown[], parOverrides?: Record<number, number>): ImportedCourse;
export function estimatePar(yards: number): number;
export function dist(a: [number, number], b: [number, number]): number;
