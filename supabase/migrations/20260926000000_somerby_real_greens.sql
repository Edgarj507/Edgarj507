-- Real green centres for Somerby Golf Club (Byron, MN), replacing the demo seed.
-- Source: OpenStreetMap golf=green polygons via scripts/import-course-osm.mjs
-- (© OpenStreetMap contributors, ODbL 1.0). Keep in sync with src/data/courses/somerby.json.
-- Pin reports made against the old placeholder coordinates are no longer meaningful.

delete from public.pin_positions where course_name = 'Somerby Golf Club';
delete from public.pin_reports where course_name = 'Somerby Golf Club';

update public.course_greens g
   set lat = v.lat, lng = v.lng
  from (values
  (1, 44.050588, -92.637405),
  (2, 44.050624, -92.63398),
  (3, 44.051801, -92.637939),
  (4, 44.051994, -92.631061),
  (5, 44.051187, -92.632599),
  (6, 44.047475, -92.630851),
  (7, 44.043993, -92.629354),
  (8, 44.042725, -92.630245),
  (9, 44.046534, -92.632116),
  (10, 44.050465, -92.638264),
  (11, 44.046092, -92.640836),
  (12, 44.049639, -92.639982),
  (13, 44.050059, -92.642905),
  (14, 44.050813, -92.638853),
  (15, 44.047808, -92.636939),
  (16, 44.043655, -92.63681),
  (17, 44.042709, -92.635664),
  (18, 44.047703, -92.635703)
  ) as v(hole, lat, lng)
 where g.course_name = 'Somerby Golf Club' and g.hole = v.hole;
