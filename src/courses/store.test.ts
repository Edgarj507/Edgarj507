import 'fake-indexeddb/auto';
import { deleteCourse, loadLibrary, saveCourse, saveHomeIds } from './store';
import { SOMERBY_DATA } from '../data/course';

it('persists downloaded courses and home ids in IndexedDB', async () => {
  expect(await loadLibrary()).toEqual({ courses: [], homeIds: [] });
  await saveCourse({ ...SOMERBY_DATA, id: 'osm-way-1', downloadedAt: 1 });
  await saveHomeIds(['osm-way-1', 'osm-way-2']);
  const lib = await loadLibrary();
  expect(lib.courses.map((c) => c.id)).toEqual(['osm-way-1']);
  expect(lib.homeIds).toEqual(['osm-way-1', 'osm-way-2']);
  await deleteCourse('osm-way-1');
  expect((await loadLibrary()).courses).toEqual([]);
});
