import { createStore, del, get, keys, set, type UseStore } from 'idb-keyval';
import type { CourseData } from '../data/course';

/**
 * Downloaded courses live in IndexedDB (course geometry is tens of KB each — too big to keep
 * piling into localStorage). Home-course ids are stored alongside.
 */
let store: UseStore | null = null;
const db = () => (store ??= createStore('exclusive-golf', 'courses'));
const HOME = 'meta:home';
const key = (id: string) => `course:${id}`;

const isCourseData = (x: unknown): x is CourseData => {
  const c = x as CourseData;
  return !!c && typeof c.id === 'string' && typeof c.name === 'string' && Array.isArray(c.holes) && Array.isArray(c.center);
};

export async function loadLibrary(): Promise<{ courses: CourseData[]; homeIds: string[] }> {
  try {
    const all = (await keys(db())).filter((k): k is string => typeof k === 'string' && k.startsWith('course:'));
    const courses = (await Promise.all(all.map((k) => get(k, db())))).filter(isCourseData);
    const home = await get(HOME, db());
    return { courses, homeIds: Array.isArray(home) ? home.filter((h) => typeof h === 'string') : [] };
  } catch {
    return { courses: [], homeIds: [] }; // IndexedDB blocked (private mode) — run in memory
  }
}

export async function saveCourse(c: CourseData) {
  try { await set(key(c.id), c, db()); } catch { /* blocked */ }
}
export async function deleteCourse(id: string) {
  try { await del(key(id), db()); } catch { /* blocked */ }
}
export async function saveHomeIds(ids: string[]) {
  try { await set(HOME, ids, db()); } catch { /* blocked */ }
}
