import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { buildCourseModel, SOMERBY, type CourseData, type CourseModel } from '../data/course';
import { deleteCourse, loadLibrary, saveCourse, saveHomeIds } from './store';

interface Library {
  loaded: boolean;
  /** Every course available offline (downloaded + the bundled sample). */
  courses: CourseModel[];
  /** Courses the golfer marked as their home/frequent courses, in their order. */
  homeIds: string[];
  get: (id: string | undefined) => CourseModel;
  has: (id: string) => boolean;
  add: (data: CourseData) => Promise<void>;
  remove: (id: string) => Promise<void>;
  setHome: (ids: string[]) => Promise<void>;
}

const Ctx = createContext<Library | null>(null);

export function CourseLibraryProvider({ children }: { children: ReactNode }) {
  const [loaded, setLoaded] = useState(false);
  const [data, setData] = useState<Map<string, CourseData>>(new Map());
  const [homeIds, setHomeIds] = useState<string[]>([]);

  useEffect(() => {
    loadLibrary().then(({ courses, homeIds }) => {
      setData(new Map(courses.map((c) => [c.id, c])));
      setHomeIds(homeIds);
      setLoaded(true);
    });
  }, []);

  const models = useMemo(() => {
    const m = new Map<string, CourseModel>([[SOMERBY.id, SOMERBY]]);
    for (const c of data.values()) m.set(c.id, buildCourseModel(c));
    return m;
  }, [data]);

  const add = useCallback(async (c: CourseData) => {
    await saveCourse(c);
    setData((d) => new Map(d).set(c.id, c));
  }, []);
  const remove = useCallback(async (id: string) => {
    await deleteCourse(id);
    setData((d) => { const n = new Map(d); n.delete(id); return n; });
  }, []);
  const setHome = useCallback(async (ids: string[]) => {
    await saveHomeIds(ids);
    setHomeIds(ids);
  }, []);

  const value = useMemo<Library>(() => ({
    loaded,
    courses: [...models.values()],
    homeIds,
    get: (id) => (id && models.get(id)) || SOMERBY,
    has: (id) => models.has(id),
    add, remove, setHome,
  }), [loaded, models, homeIds, add, remove, setHome]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCourses() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useCourses must be used inside <CourseLibraryProvider>');
  return v;
}
