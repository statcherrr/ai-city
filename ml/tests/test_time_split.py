"""Verify the time-based split has no leakage."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pandas as pd
from datetime import timedelta
import ml.src.features as ft


def test_split_ranges():
    from ml.src.config import TRAIN_START, TRAIN_END, VAL_START, VAL_END, TEST_START, TEST_END
    train_start = pd.Timestamp(TRAIN_START)
    train_end = pd.Timestamp(TRAIN_END)
    val_start = pd.Timestamp(VAL_START)
    val_end = pd.Timestamp(VAL_END)
    test_start = pd.Timestamp(TEST_START)
    test_end = pd.Timestamp(TEST_END)
    assert train_end < val_start, f"train end {train_end} must be before val start {val_start}"
    assert val_end < test_start, f"val end {val_end} must be before test start {test_start}"
    assert train_start < train_end
    assert val_start < val_end
    assert test_start < test_end


def test_no_future_features_in_build_features():
    segs = pd.DataFrame([
        {"segmentId":"S1","centroid_lat":40.75,"centroid_lon":-73.97,"road_class":"arterial","num_lanes":4,"truck_route_type":"YES","city_len_units":100},
    ])
    ws = pd.Timestamp("2024-01-15")
    reps = pd.DataFrame([
        {"created_date": ws - timedelta(days=5), "segmentId":"S1"},
        {"created_date": ws - timedelta(days=10), "segmentId":"S1"},
        {"created_date": ws + timedelta(days=5), "segmentId":"S1"},
    ])
    weather = pd.DataFrame({
        "date": pd.date_range(ws - timedelta(days=60), ws + timedelta(days=5)),
        "temp_max": 5, "temp_min": -2, "precip": 0.1, "snow": 0.0,
    })
    traffic = pd.DataFrame({"segmentid":["S1"],"vol":[12000]})
    X = ft.build_features(segs, reps, weather, traffic, ws, ws)
    c30 = X.iloc[0]["defect_count_30d"]
    assert c30 == 2, f"defect_count_30d={c30}, expect 2"
    freeze30 = X.iloc[0]["freeze_thaw_30d"]
    assert freeze30 == 30, f"freeze_thaw_30d={freeze30}, expect 30"


def test_target_only_uses_future():
    segs = pd.DataFrame([{"segmentId":"S1","centroid_lat":40.75,"centroid_lon":-73.97,"road_class":"local","num_lanes":1,"truck_route_type":"","city_len_units":50}])
    ws = pd.Timestamp("2024-01-15")
    reps = pd.DataFrame([
        {"created_date": ws - timedelta(days=2), "segmentId":"S1"},
        {"created_date": ws + timedelta(days=2), "segmentId":"S1"},
        {"created_date": ws + timedelta(days=20), "segmentId":"S1"},
    ])
    weather = pd.DataFrame({"date":pd.date_range(ws-timedelta(days=60), ws+timedelta(days=5)),"temp_max":5,"temp_min":-2,"precip":0.1,"snow":0.0})
    traffic = pd.DataFrame({"segmentid":["S1"],"vol":[1000]})
    X = ft.build_features(segs, reps, weather, traffic, ws, ws)
    y = ft.target_vector(reps, segs, ws, ws + timedelta(days=30))
    c30 = X.iloc[0]["defect_count_30d"]
    y_val = int(y.iloc[0])
    assert c30 == 1, f"defect_count_30d={c30}, expect 1"
    assert y_val == 1, f"target={y_val}, expect 1"
