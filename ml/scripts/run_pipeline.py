#!/usr/bin/env python3
"""Run the full ML pipeline end to end. Set REAL=1 to fetch live NYC data.

This is a self-contained driver: fetch (or surrogate), build segments, snap reports,
build the feature matrix with a strict time-based split, train a gradient boosting model,
evaluate vs baselines, and export risk_scores.json + model_card.md.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

import pandas as pd
import numpy as np

import ml.src.config as cfg
import ml.src.data as data
import ml.src.segments as seg
import ml.src.features as feat
import ml.src.model as model
import ml.src.export as export

REAL = True


def week_starts_between(start: str, end: str, freq: str = "7D") -> pd.Series:
    return pd.Series(pd.date_range(start, end, freq=freq))


def main() -> int:
    print("=== ML pipeline ===")
    cfg.RAW.mkdir(parents=True, exist_ok=True)
    cfg.OUT.mkdir(parents=True, exist_ok=True)

    # [1/5] Data
    print("[1/5] Fetching live NYC datasets...")
    try:
        c311 = data.fetch_311()
        centerline = data.fetch_centerline()
        weather = data.fetch_weather_daily()
        traffic = data.fetch_traffic_counts()
    except Exception as e:
        print(f"ERROR: Failed to fetch real data: {e}", file=sys.stderr)
        raise
    if len(c311) == 0 or len(centerline) == 0:
        raise RuntimeError(f"Real data missing: c311={len(c311)}, centerline={len(centerline)}")
    print(f"  311 rows: {len(c311)}, centerline rows: {len(centerline)}, weather rows: {len(weather)}, traffic rows: {len(traffic)}")

    # [2/5] Segments
    print("[2/5] Building segment table from centerline...")
    segments = seg.build_segments(centerline)
    print(f"  segments built: {len(segments)}")

    # [3/5] Snap
    print("[3/5] Snapping 311 reports to segments...")
    snapped_rows: list[dict] = []
    unmatched = 0
    for _, r in c311.iterrows():
        lat = r.get("lat")
        lon = r.get("lon")
        street = r.get("street_name") or ""
        s = seg.snap_report_to_segment(lat, lon, street, segments)
        if s is None:
            unmatched += 1
            continue
        row = {"created_date": r.get("created_date"), "segmentId": s["segmentId"], "street_name": street}
        snapped_rows.append(row)
    snapped = pd.DataFrame(snapped_rows)
    print(f"  snapped reports: {len(snapped)}, unmatched: {unmatched}")
    segments = seg.attach_cross_streets(segments, c311)

    # [4/5] Feature matrix + split
    print("[4/5] Building feature matrix (time-based split, no leakage)...")
    train_weeks = week_starts_between(cfg.TRAIN_START, cfg.TRAIN_END)
    val_weeks = week_starts_between(cfg.VAL_START, cfg.VAL_END)
    test_weeks = week_starts_between(cfg.TEST_START, cfg.TEST_END)
    all_weeks = pd.concat([train_weeks, val_weeks, test_weeks], ignore_index=True)
    print(f"  target weeks: {len(all_weeks)} (train {len(train_weeks)}, val {len(val_weeks)}, test {len(test_weeks)})")

    X, y, _weeks = feat.build_dataset(segments, snapped, weather, traffic, all_weeks)
    print(f"  feature matrix: {X.shape}")

    # Leakage check: for each row, defect_count_30d == count of snapped reports in [ws-30d, ws)
    leak_rows = 0
    for _, row in X.iterrows():
        ws = row["week_start"]
        seg_reps = snapped[(snapped["created_date"] >= ws - pd.Timedelta(days=30)) & (snapped["created_date"] < ws) & (snapped["segmentId"] == row["segmentId"])]
        if len(seg_reps) != row["defect_count_30d"]:
            leak_rows += 1
            print(f"  LEAKAGE? row seg={row['segmentId']} week={ws.date()}: expected c30={len(seg_reps)}, actual={row['defect_count_30d']}")
    print(f"  leakage check: {leak_rows} mismatched rows (expect 0)")

    # Build feature matrix without the meta columns (segmentId, week_start) for modeling.
    feature_cols = [c for c in X.columns if c not in ("segmentId", "week_start")]
    X_feat = X[feature_cols].reset_index(drop=True)
    y_reset = y.reset_index(drop=True)
    week_reset = X["week_start"].reset_index(drop=True)

    # Split by week (time-based). Use week_start to assign each row to train/val/test.
    train_set = set(train_weeks.dt.normalize().tolist())
    val_set = set(val_weeks.dt.normalize().tolist())
    test_set = set(test_weeks.dt.normalize().tolist())

    tr_idx, va_idx, te_idx = [], [], []
    for i, ws in enumerate(week_reset):
        key = ws.normalize()
        if key in train_set:
            tr_idx.append(i)
        elif key in val_set:
            va_idx.append(i)
        elif key in test_set:
            te_idx.append(i)
        else:
            # Assign by temporal order: before val start -> train, else test
            if key < val_weeks.min().normalize():
                tr_idx.append(i)
            else:
                te_idx.append(i)

    X_train = X_feat.iloc[tr_idx]
    y_train = y_reset.iloc[tr_idx]
    X_val = X_feat.iloc[va_idx] if va_idx else pd.DataFrame(columns=X_feat.columns)
    y_val = y_reset.iloc[va_idx] if va_idx else pd.Series(dtype=float)
    X_test = X_feat.iloc[te_idx]
    y_test = y_reset.iloc[te_idx]

    print(f"  split: train {len(X_train)}, val {len(X_val)}, test {len(X_test)}")

    # Baselines on val
    if len(X_train) > 0 and len(X_val) > 0:
        b1_val_pr, b1_val_roc, _ = model.baseline_30d_count(X_train, y_train, X_val, y_val)
        b2_val_pr, b2_val_roc, _ = model.baseline_historical_rate(X_train, y_train, X_val, y_val)
        print(f"  baseline 30d count (val): PR-AUC={b1_val_pr:.3f}, ROC-AUC={b1_val_roc:.3f}")
        print(f"  baseline historical rate (val): PR-AUC={b2_val_pr:.3f}, ROC-AUC={b2_val_roc:.3f}")
    else:
        b1_val_pr = b2_val_pr = b1_val_roc = b2_val_roc = float("nan")

    # Train on train+val, evaluate on test
    if len(X_train) + len(X_val) > 0 and len(X_test) > 0:
        X_trainval = pd.concat([X_train, X_val], ignore_index=True)
        y_trainval = pd.concat([y_train, y_val], ignore_index=True)
        gb_model, val_metrics, feat_imp, val_probs = model.train_gradient_boosting(X_trainval, y_trainval, X_test, y_test, seed=cfg.SEED)
        test_metrics, test_probs = model.evaluate_model(gb_model, X_test, y_test)
        print(f"  GB (test): PR-AUC={test_metrics['pr_auc_test']:.3f}, ROC-AUC={test_metrics['roc_auc_test']:.3f}, recall@5%={test_metrics['recall_top_5pct_test']:.3f}, recall@10%={test_metrics['recall_top_10pct_test']:.3f}")
        b1_test_pr, b1_test_roc, _ = model.baseline_30d_count(X_train, y_train, X_test, y_test) if len(X_train) > 0 else (float("nan"), float("nan"), None)
        b2_test_pr, b2_test_roc, _ = model.baseline_historical_rate(X_train, y_train, X_test, y_test) if len(X_train) > 0 else (float("nan"), float("nan"), None)
    else:
        gb_model = None
        test_metrics = {"pr_auc_test": float("nan"), "roc_auc_test": float("nan"), "recall_top_5pct_test": float("nan"), "recall_top_10pct_test": float("nan"), "calibration": []}
        test_probs = pd.Series([0.5] * len(X_test)) if len(X_test) > 0 else pd.Series(dtype=float)
        b1_test_pr = b1_test_roc = b2_test_pr = b2_test_roc = float("nan")

    baseline_metrics = {
        "baseline_30d_pr_auc_test": float(b1_test_pr),
        "baseline_30d_roc_auc_test": float(b1_test_roc),
        "baseline_rate_pr_auc_test": float(b2_test_pr),
        "baseline_rate_roc_auc_test": float(b2_test_roc),
    }

    # [5/5] Export
    print("[5/5] Exporting risk_scores.json + model_card.md...")
    if gb_model is not None and len(X_test) > 0:
        feature_names = model.feature_names_from_model(gb_model)
        out_json = export.export_risk_scores(
            segments, gb_model, feature_names, test_probs, test_weeks, train_weeks, val_weeks,
            test_metrics, baseline_metrics,
        )
        print(f"  risk_scores.json: {out_json} ({len(segments)} segments)")
        out_card = export.export_model_card(test_metrics, baseline_metrics, feat_imp)
        print(f"  model_card.md: {out_card}")
    else:
        print("  (skipped export — not enough data in this surrogate run)")

    # Console: unmatched segments count
    print(f"\n=== SEGMENT MATCHING SUMMARY ===")
    print(f"  total 311 reports processed: {len(c311)}")
    print(f"  snapped to a segment: {len(snapped)}")
    print(f"  unmatched (no segment found): {unmatched}")
    if len(segments) > 0:
        print(f"  distinct segments in Midtown subset: {len(segments)}")

    if (cfg.OUT / "risk_scores.json").exists():
        size_bytes = (cfg.OUT / "risk_scores.json").stat().st_size
        print(f"  risk_scores.json size: {size_bytes} bytes ({size_bytes/1024:.1f} KB) — target < 2MB")
        if size_bytes > 2_000_000:
            print("  WARNING: exceeds 2MB target")

    print("\n=== pipeline complete ===")
    return 0


if __name__ == "__main__":
    sys.exit(main())
