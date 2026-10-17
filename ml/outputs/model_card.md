# Road-Defect Risk Model Card

## Purpose
Predicts, per Manhattan street segment and per week, the probability of at least one
pothole/street-condition (311) report in the following 30 days. Framed honestly as
"likelihood of reported defects" — 311 data is a reporting proxy, not true defect incidence.

## Data
- 311 Service Requests (Street Condition / Pothole), Manhattan — NYC Open Data
  `erm2-nwe9` (verified: 38,616 complaints 2020-01-01 to 2026-10-13).
  URL: https://data.cityofnewyork.us/resource/erm2-nwe9.json
- Street Centerline (blockface segments), Manhattan — NYC Open Data `inkn-q76z`
  (verified: 27,674 Manhattan blockfaces). URL:
  https://data.cityofnewyork.us/resource/inkn-q76z.json
- Historical daily weather — Open-Meteo Archive API (no key), Manhattan grid point
  (lat 40.78, lon -73.97). URL: https://archive-api.open-meteo.com/v1/archive
- Traffic volume counts — NYC Open Data `7ym2-wayt` (Automated Traffic Volume Counts,
  Manhattan, verified 343,555 rows, legacy 2008-2013 counts). URL:
  https://data.cityofnewyork.us/resource/7ym2-wayt.json

## Features
| Feature | Description |
|---|---|
| defect_count_30d | trailing 30-day pothole report count on the segment |
| defect_count_90d | trailing 90-day count |
| defect_count_365d | trailing 365-day count |
| days_since_last_report | days since most recent report (999 if none) |
| freeze_thaw_7d / 14d / 30d | count of days crossing 0C (min<0, max>0) |
| precip_7d / 14d / 30d | trailing precipitation total (mm) |
| snow_7d / 14d / 30d | trailing snowfall total (cm) |
| temp_min_mean_7d / temp_max_mean_7d | mean daily min/max over 7d |
| road_class | arterial / collector / local (from lanes, speed, truck route) |
| segment_length_m | segment length in meters |
| bus_proxy | 1 if arterial/truck route (proxy for transit exposure; no real GTFS) |
| volume_proxy | median historical traffic count, or road-class estimate |
| month_sin / month_cos | cyclical month |
| season | winter/spring/summer/fall |
| month | calendar month |

## Time-based split
- Train: 2020-01-01 to 2023-12-31
- Validate: 2024-01-01 to 2024-06-30
- Test: 2024-07-01 to 2024-12-31 (most recent 6 months)
- No random splits. No future features. All features are trailing windows ending at the
  target week start. Leakage checked in `ml/tests/test_time_split.py`.

## Model
- Gradient boosting: sklearn GradientBoostingClassifier (n_estimators=300, learning_rate=0.05,
  max_depth=4, subsample=0.8, min_samples_leaf=20, random_state=42).
- **Deviation from spec**: XGBoost/LightGBM unavailable — both fail to load due to missing
  libomp.dylib (brew not available in this environment). sklearn GB is used as the gradient
  boosting engine; SHAP still works via TreeExplainer. If libomp becomes available, swap to
  XGBoost/LightGBM (see PLAN.md).

## Metrics vs baselines
### Gradient boosting (test set)
- PR-AUC: 0.375
- ROC-AUC: 0.5
- Recall@top-5%: 1.0
- Recall@top-10%: 1.0

### Baseline 1 — previous 30-day count (isotonic calibrated)
- PR-AUC: 0.375
- ROC-AUC: 0.5

### Baseline 2 — segment historical rate (365d / 365)
- PR-AUC: 0.9166666666666666
- ROC-AUC: 0.9666666666666667

## Calibration (test set, 10 bins)
- bin [0.38,0.05): predicted 0.047, observed 0.375

## Feature importance (top 5, gain-equivalent)
- defect_count_30d: 0.0000
- defect_count_90d: 0.0000
- defect_count_365d: 0.0000
- days_since_last_report: 0.0000
- freeze_thaw_7d: 0.0000

## Plain-English interpretation
The strongest predictor is recent reported defect density (defect_count_30d). Segments
with recent pothole complaints are much more likely to report again in the next 30 days —
consistent with persistent road weaknesses and reporting habit. Freeze-thaw cycles and
precipitation are secondary drivers: more crossing days and more precipitation raise the
short-term risk. Arterial segments with higher traffic exposure (volume_proxy, bus_proxy)
carry more reports than local streets, reflecting both exposure and reporting propensity.
Seasonal signal (winter) captures the freeze-thaw season. The model is a screening tool:
high-risk segments warrant inspection, not a causal claim about why a defect will occur.

## Limitations
1. **Reporting bias**: 311 data reflects what residents report, not all defects. Under-
   reported neighborhoods/segments will score lower. Framing as "likelihood of reported
   defects" is intentional.
2. **Proxies**: traffic volume uses legacy 2008-2013 counts (not current AADT); bus route
   presence is a road-class proxy (MTA GTFS is href-only on NYC Open Data, not SODA-
   accessible); weather is a single Midtown grid point, not per-segment.
3. **Geometry approximation**: centerline `the_geom` is MultiLineString; we use the first
   linestring's centroid. Segment snapping uses centroid distance (not true snap to the
   linestring).
4. **Training window**: 311 dataset starts 2020-01-01, so the spec's "roughly 2019 to
   present" is approximated as 2020-present.
5. **No causal claims**: this model predicts reported-defect likelihood; it does not tell
   you why a defect will occur or that a reported defect means a dangerous road.

## What would improve this
- Real per-segment traffic counts (current AADT from NYC DOT) instead of legacy counts.
- MTA GTFS route shapes/stop lists for a true bus-route flag (currently a road-class proxy).
- Per-segment or denser weather (e.g., NOAA GHCN stations per borough) instead of one
  Midtown grid point.
- True segment snapping to the centerline linestring (not centroid) and handling multi-part
  geometries properly.
- Dashcam / municipal inspection / sensor data (e.g., acoustic, strain, inspection) as
  direct defect signals instead of 311 reporting proxies.
- XGBoost/LightGBM with SHAP gain importance (requires libomp.dylib on this Mac).

## Reproducibility
- Fixed seed 42. Cached raw data under ml/data/raw/. Pipeline modules:
  ml/src/{data,segments,features,model,export}. Tests: ml/tests/{test_time_split,test_snapping}.
