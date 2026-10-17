# ML Pipeline — Road-Defect Risk for Manhattan Street Segments

## Status
Planned. Not yet implemented.

## Environment / constraints
- Python 3.11 goal; actual environment is 3.9.6 (venv created with system python3).
- LightGBM and XGBoost both fail to load: missing libomp.dylib, and brew is not available
  in this environment. So the gradient-boosted model uses **sklearn GradientBoostingClassifier**
  as the GB engine. This is a documented deviation. If libomp becomes available, swap the
  model module to XGBoost/LightGBM; the rest of the pipeline is unchanged.
- shap 0.49.1 is installed and supports sklearn, so SHAP feature attribution still works.
- OpenMP note kept in model_card.md.

## Data (verified live against NYC Open Data + Open-Meteo)

### 311 Service Requests — erm2-nwe9 (311 Service Requests from 2020 to Present)
- Provider: NYC Open Data (Socrata) — https://data.cityofnewyork.us/resource/erm2-nwe9.json
- Verified: 38,616 Manhattan pothole complaints 2020-01-01 to 2026-10-13 (Street Condition / Pothole).
- The spec asked for "roughly 2019 to present". This dataset starts 2020-01-01; the older
  311 dataset was not used. Document as a limitation: training window is 2020-present, not
  2019-present. Acceptable for an offline proof.
- Row fields used: created_date, street_name, cross_street_1, cross_street_2,
  incident_address, address_type, location (GeoJSON Point, present on ~25,623 of 38,616
  Manhattan pothole rows), status, resolution_description.
- Snapping plan: use `location` GeoJSON when present, fall back to street_name + cross
  streets. Snap each report to its nearest centerline segment by haversine distance.

### Street Centerline — ink-n-q76z (Centerline)
- Provider: NYC Open Data — https://data.cityofnewyork.us/resource/inkn-q76z.json
- Verified: 27,674 Manhattan blockface segments (boroughcode='3'), each a MultiLineString
  in GeoJSON (`the_geom`). Fields: full_street_name, segmentlength (feet),
  physicalid / objectid, posted_speed, number_total_lanes, trafdir, street_name.
- This is the segment geometry source. Each row = one street-segment (blockface).
- Geometry is MultiLineString in NYC State Plane (EPSG:2263, feet). Pipeline projects to
  WGS84 lat/lon for snapping and dashboard export (centroid + short polyline sample).
- Limitation: `the_geom` is MultiLineString; we take the first linestring's centroid.

### Historical Weather — Open-Meteo Archive API (no key)
- Provider: https://archive-api.open-meteo.com/v1/archive
- Verified: daily temperature_2m_max, temperature_2m_min, precipitation_sum, snowfall_sum
  for Manhattan (lat 40.78, lon -73.97). No key required.
- Used for trailing 7/14/30-day windows: freeze-thaw cycle count (days crossing 0C),
  precipitation totals, snowfall totals, mean min/max temps.
- Limitation: single Midtown grid point, city-wide proxy, not per-segment.

### Traffic Exposure — Automated Traffic Volume Counts — 7ym2-wayt
- Provider: NYC Open Data — https://data.cityofnewyork.us/resource/7ym2-wayt.json
- Verified: 343,555 Manhattan rows, each a point count: segmentid, street, fromst, tost,
  direction, vol (vehicle count), wktgeom (Point in State Plane).
- Years present: 2008 onward. This is the verifiably available NYC DOT traffic volume source.
- Use as volume proxy: aggregate each segmentid's median historical count. Where missing,
  fall back to road class (number_total_lanes, posted_speed, truck_route_type).
- Limitation: sparse, historical (2008-2013 mostly). Rough exposure proxy, not current AADT.

### Bus route presence (proxy flag)
- MTA GTFS Static Data (fgm6-ccue) on NYC Open Data is a href only, not SODA-accessible.
  Per spec fallback: use road class as a proxy for transit exposure rather than a true
  bus-route flag.

## Feature set
Each row = one street segment (centerline blockface) × one target week.

### Target
`y = 1` if at least one pothole/street-condition report was filed against the segment in the
following 30 days after the week start. Framed honestly as "likelihood of reported defects".

### Features (documented)
- defect_count_30d / defect_count_90d / defect_count_365d — trailing pothole counts
- days_since_last_report — recency
- freeze_thaw_7d / freeze_thaw_14d / freeze_thaw_30d — days crossing 0C
- precip_7d / precip_14d / precip_30d — trailing precipitation (mm)
- snow_7d / snow_14d / snow_30d — trailing snowfall (cm)
- temp_min_mean_7d / temp_max_mean_7d — mean daily min/max over 7d
- road_class — arterial / local / collector, from lanes + speed + truck_route_type
- segment_length_ft — centerline segmentlength (feet)
- bus_proxy — 1 if number_total_lanes >= 3 or truck_route_type indicates bus/truck route
- volume_proxy — median historical count, or road-class estimate when missing
- month_sin / month_cos — cyclical month
- season — winter / spring / summer / fall bucket

## Model
- Baselines: (1) previous-30-day count (calibrated to probability via isotonic calibration),
  (2) segment historical rate (365d count / 365).
- Gradient boosting: sklearn GradientBoostingClassifier (n_estimators=300, learning_rate=0.05,
  max_depth=4, subsample=0.8, random_state=42). Documented substitute for XGBoost/LightGBM
  due to missing libomp.dylib.
- Strict time-based split: train 2020-01 to 2023-12, validate 2024-01 to 2024-06,
  test 2024-07 to 2024-12 (most recent 6 months). No random splits.
- Leakage checks: no future features; target is next-30-days only; weather is historical
  archive; no global rescaling across time; log feature lookup boundaries and assert none
  use data after the row's week start.
- Metrics: PR-AUC, ROC-AUC, recall@top-5% and top-10% of segments, calibration curve.
  Reported in a table vs baselines.
- Feature importance: GradientBoosting feature_importances_ (gain equivalent) + SHAP summary
  on validation set. Plain-English interpretation in model_card.md.

## Outputs
- /ml/outputs/risk_scores.json — Midtown subset (34th to 59th St, river to river): for each
  segment {segmentId, streetName, fromCross, toCross, centroid {lat,lon}, polyline sample,
  riskScore 0-1, topFactors[3]}. Plus metadata {modelVersion, trainedOn, dateRange, metrics,
  disclaimer}. Target < 2MB.
- /ml/outputs/model_card.md — purpose, data sources + verified URLs, feature table, metrics
  vs baselines, limitations, what real dashcam/sensor data would improve.

## Reproducibility
- Fixed seed 42 for XGBoost and split shuffling. Results cached via Makefile / driver script.
- make fetch, make features, make train, make evaluate, make export. Or ml/scripts/run_all.py.

## Quality
- Type hints, small modules under ml/src/: data.py, segments.py, features.py, model.py,
  export.py, config.py.
- Tests under ml/tests/: test_time_split.py, test_snapping.py.
- Notebook (ml/notebooks/explore.ipynb) fine for exploration only; all logic in modules.

## Known limitations / deviations from spec (documented in model_card.md)
1. Training window is 2020-present, not 2019-present.
2. Gradient boosting via sklearn GradientBoostingClassifier, not XGBoost/LightGBM (both fail
   to load: missing libomp.dylib; brew not available). SHAP still works on the sklearn model.
3. Bus route flag is a road-class proxy, not real GTFS.
4. Traffic volume uses legacy 2008-2013 counts as a rough exposure proxy.
5. Weather is a single Midtown grid point, not per-segment.
6. Segment geometry uses the first linestring centroid of MultiLineString rows.
7. "Likelihood of reported defects" — reporting proxy, not true defect incidence.
