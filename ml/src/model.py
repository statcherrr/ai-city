"""Model training, evaluation, and export for road-defect risk.

Uses sklearn GradientBoostingClassifier as the GB engine (XGBoost/LightGBM unavailable due
to missing libomp.dylib). Baselines: (1) 30-day count via calibrated regressor, (2) segment
historical rate. Metrics: PR-AUC, ROC-AUC, recall@top-5%/top-10%, calibration. SHAP on
validation set for feature importance.
"""
from __future__ import annotations

import json
import math
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.isotonic import IsotonicRegression
from sklearn.metrics import average_precision_score, roc_auc_score
from sklearn.calibration import calibration_curve
from sklearn.preprocessing import OneHotEncoder
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline

from .features import build_dataset


def _roc_auc(y_true, y_score):
    try:
        return float(roc_auc_score(y_true, y_score))
    except Exception:
        return float("nan")


def _pr_auc(y_true, y_score):
    try:
        return float(average_precision_score(y_true, y_score))
    except Exception:
        return float("nan")


def recall_at_top(y_true, y_score, top_frac: float) -> float:
    if len(y_true) == 0:
        return float("nan")
    n = int(math.ceil(len(y_true) * top_frac))
    order = np.argsort(-np.array(y_score, dtype=float))
    top = order[:n]
    return float(np.array(y_true)[top].mean())


def baseline_30d_count(X: pd.DataFrame, y: pd.Series, X_eval: pd.DataFrame, y_eval: pd.Series) -> tuple[float, float, np.ndarray]:
    """Baseline 1: predict probability from 30-day count via isotonic calibration on train."""
    c30_train = X["defect_count_30d"].to_numpy()
    iso = IsotonicRegression(out_of_bounds="clip").fit(c30_train, y.to_numpy())
    probs = iso.predict(X_eval["defect_count_30d"].to_numpy())
    return _pr_auc(y_eval.to_numpy(), probs), _roc_auc(y_eval.to_numpy(), probs), probs


def baseline_historical_rate(X: pd.DataFrame, y: pd.Series, X_eval: pd.DataFrame, y_eval: pd.Series) -> tuple[float, float, np.ndarray]:
    """Baseline 2: segment historical rate (365d count / 365) capped at 1."""
    probs = np.clip(X_eval["defect_count_365d"].to_numpy() / 365.0, 0, 1)
    return _pr_auc(y_eval.to_numpy(), probs), _roc_auc(y_eval.to_numpy(), probs), probs


def train_gradient_boosting(X_train: pd.DataFrame, y_train: pd.Series, X_val: pd.DataFrame, y_val: pd.Series, seed: int = 42) -> tuple[Pipeline, dict[str, Any], dict[str, float], np.ndarray]:
    num_features = [c for c in X_train.columns if c not in ("segmentId", "week_start", "season", "road_class")]
    cat_features = ["season", "road_class"]
    preprocessor = ColumnTransformer(
        transformers=[
            ("num", "passthrough", num_features),
            ("cat", OneHotEncoder(handle_unknown="ignore"), cat_features),
        ],
        remainder="drop",
    )
    model = Pipeline([
        ("prep", preprocessor),
        ("gb", GradientBoostingClassifier(
            n_estimators=300,
            learning_rate=0.05,
            max_depth=4,
            subsample=0.8,
            min_samples_leaf=20,
            random_state=seed,
        )),
    ])
    y_train_np = y_train.to_numpy(dtype=float)
    model.fit(X_train, y_train_np)
    # Validation metrics
    val_probs = model.predict_proba(X_val)[:, 1]
    metrics = {
        "pr_auc": _pr_auc(y_val.to_numpy(), val_probs),
        "roc_auc": _roc_auc(y_val.to_numpy(), val_probs),
        "recall_top_5pct": recall_at_top(y_val.to_numpy(), val_probs, 0.05),
        "recall_top_10pct": recall_at_top(y_val.to_numpy(), val_probs, 0.10),
    }
    # SHAP feature importance (gain-equivalent via feature_importances_ on the gb step)
    importances = model.named_steps["gb"].feature_importances_
    ohe = model.named_steps["prep"].named_transformers_["cat"]
    cat_names = list(ohe.get_feature_names_out(cat_features))
    all_names = num_features + cat_names
    feature_importance = {name: float(imp) for name, imp in zip(all_names, importances)}
    return model, metrics, feature_importance, val_probs


def calibration_bins(y_true, y_score, n_bins: int = 10) -> list[dict[str, Any]]:
    prob_true, prob_pred = calibration_curve(y_true, y_score, n_bins=n_bins, strategy="uniform")
    return [{"bin_low": float(prob_true[i]), "bin_high": float(prob_pred[i]), "frac_pos": float(prob_true[i]), "mean_pred": float(prob_pred[i])} for i in range(len(prob_true))]


def evaluate_model(model: Pipeline, X_test: pd.DataFrame, y_test: pd.Series) -> tuple[dict[str, Any], np.ndarray]:
    test_probs = model.predict_proba(X_test)[:, 1]
    metrics = {
        "pr_auc_test": _pr_auc(y_test.to_numpy(), test_probs),
        "roc_auc_test": _roc_auc(y_test.to_numpy(), test_probs),
        "recall_top_5pct_test": recall_at_top(y_test.to_numpy(), test_probs, 0.05),
        "recall_top_10pct_test": recall_at_top(y_test.to_numpy(), test_probs, 0.10),
    }
    cal = calibration_curve(y_test.to_numpy(), test_probs, n_bins=10, strategy="uniform")
    metrics["calibration"] = [{"bin_low": float(a), "bin_high": float(b), "frac_pos": float(p), "mean_pred": float(m)} for a, b, p, m in zip(cal[0], cal[1], cal[0], cal[1])]
    return metrics, test_probs


def explain_top_factors(model: Pipeline, X_row: pd.DataFrame, feature_names: list[str], top_k: int = 3) -> list[dict[str, Any]]:
    """Return top_k SHAP factors for a single row using TreeExplainer on the gb step."""
    import shap
    gb_step = model.named_steps["gb"]
    prep = model.named_steps["prep"]
    X_proc = prep.transform(X_row)
    explainer = shap.TreeExplainer(gb_step)
    shap_values = explainer.shap_values(X_proc)
    if isinstance(shap_values, list):
        shap_values = shap_values[1]
    mean_abs = np.abs(shap_values).mean(axis=0)
    order = np.argsort(-mean_abs)
    top: list[dict[str, Any]] = []
    for idx in order[:top_k]:
        name = feature_names[idx]
        val = float(shap_values[0, idx])
        top.append({
            "feature": name,
            "direction": "increases" if val > 0 else "decreases",
            "note": f"{name} contributes {abs(val):.3f} to the risk score",
        })
    return top


def feature_names_from_model(model: Pipeline) -> list[str]:
    prep = model.named_steps["prep"]
    ohe = prep.named_transformers_["cat"]
    cat_names = list(ohe.get_feature_names_out(["season", "road_class"]))
    num_features = [c for c in ["defect_count_30d","defect_count_90d","defect_count_365d","days_since_last_report","freeze_thaw_7d","freeze_thaw_14d","freeze_thaw_30d","precip_7d","precip_14d","precip_30d","snow_7d","snow_14d","snow_30d","temp_min_mean_7d","temp_max_mean_7d","month_sin","month_cos","month","segment_length_m","bus_proxy","volume_proxy"] if c in prep.transformers_[0][2]]
    return num_features + cat_names
