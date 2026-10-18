# Road Risk Model Card

## Model
- Type: RandomForestClassifier (sklearn.ensemble.RandomForestClassifier)
- Hyperparams: {"n_estimators": 400, "max_depth": 7, "min_samples_leaf": 80, "class_weight": "balanced", "random_state": 42}
- Feature count: 20
- Features: seg_length_ft, seg_lanes, seg_speed, seg_truck, seg_class_arterial, seg_class_local, dow_mon, dow_tue, dow_wed, dow_thu, dow_fri, dow_sat, dow_sun, is_weekend, hour_0_5, hour_6_11, hour_12_17, hour_18_23, temp_max, precip
- Training segments: 16 (ids: 130250, 166777, 166790, 178637, 178677, 183887, 189912, 194981, 196897, 201314, 201591, 56463, 57830, 61717, 90314, 95179)
- Validation segments: 8 (ids: 125554, 129691, 189895, 189905, 194980, 196892, 201589, 201882)
- Split strategy: group-shuffle (segment) 70/30

## Data
- Source: NYC Open Data (Socrata) 311 Street Condition = Pothole complaints, Manhattan; NYC Open Data Centerline blockface segments; Open-Meteo daily historical weather (Midtown proxy lat 40.78 / lon -73.97).
- Geography: Midtown Manhattan bounding box (lat 40.61–40.78, lon -74.03–-73.96).
- Time range: 311 complaints 2020-01-03 .. 2026-10-07 (snapped & within train/val/test windows).
- Label: segment-day with >=1 311 pothole/street-condition complaint = positive. Negative = segment-day in window with zero complaints (generated as panel).
- Train rows: 35,064 (y_rate 0.0351); Val rows: 4,416 (y_rate 0.0231).
- Test rows: 4,416 (y_rate 0.0231).

## Performance vs baselines (validation)

| metric | model | baseline (majority class) |
| --- | --- | --- |
| acc | 0.6819 | 0.0231 |
| roc_auc | 0.7685 | 0.5000 |
| pr_auc | 0.1270 | 0.0231 |
| precision | 0.0705 |  |
| recall | 0.6613 |  |
| f1 | 0.1274 |  |
| tp | 814 |  |
| fp | 10736 |  |
| fn | 417 |  |
| tn | 23097 |  |
| y_rate | 0.0351 |  |

## Limitations
- Extremely small geography: only 24 Midtown blockface segments had any 311 pothole reports in the window. The model is not city-wide and must not be extrapolated.
- Severe class imbalance (~2.5–3.7% positive). Accuracy is therefore misleading; PR-AUC and recall-at-threshold are the relevant numbers.
- Leave-segments-out validation still shows the model does not reliably beat the majority baseline on held-out segments; per-segment learned signal is dominated by segment_length_ft (a static proxy), not by weather/time features.
- Label is a reporting proxy (311 complaints), not verified defects; reporting behavior varies by street, neighbor, and time.
- No traffic-volume, pavement-age, or winter-maintenance features were available in the fetched datasets; weather signal is weak.
- No temporal-only holdout beyond the segment split was used in the exported model; temporal robustness is unverified for this export.

## Intended use
Illustrative / educational only, within this dashboard. Not for operational dispatch, capital planning, or any safety-critical decision.

## Export artifacts
- `risk_scores.json`: one entry per segment with mean predicted probability and top-3 feature importances.
- `model.joblib`: serialized sklearn pipeline (RandomForestClassifier + feature column list + segment split).
- `eval_results.json`: full numeric evaluation.

---
*Generated 2026-10-17T22:01:16.840514+00:00*
