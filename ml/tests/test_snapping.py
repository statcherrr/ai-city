"""Verify segment snapping returns a segment for sample reports and uses haversine."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pandas as pd
import ml.src.segments as sg


def test_haversine():
    d = sg.haversine(40.7, -73.9, 40.7, -73.9)
    assert d < 1.0, f"same point distance {d} should be ~0"
    d2 = sg.haversine(40.7, -73.9, 40.8, -73.9)
    assert 11000 < d2 < 11300, f"1 deg lat distance {d2} should be ~11.1km"


def test_segment_centroid():
    geom = {"type":"LineString","coordinates":[[-73.98,40.74],[-73.97,40.75]]}
    cent = sg.segment_centroid(geom)
    assert cent is not None
    lon, lat = cent
    assert abs(lon - (-73.975)) < 1e-6
    assert abs(lat - 40.745) < 1e-6


def test_snap_by_location():
    segs = pd.DataFrame([
        {"segmentId":"S1","streetName":"BROADWAY","centroid_lon":-73.97,"centroid_lat":40.75,"polyline":[[-73.98,40.74],[-73.96,40.76]],"length_ft":1000,"posted_speed":30,"num_lanes":4,"truck_route_type":"YES","city_len_units":100,"road_class":"arterial"},
        {"segmentId":"S2","streetName":"PARK AVE","centroid_lon":-73.96,"centroid_lat":40.74,"polyline":[[-73.97,40.73],[-73.95,40.75]],"length_ft":500,"posted_speed":25,"num_lanes":2,"truck_route_type":"","city_len_units":50,"road_class":"collector"},
    ])
    snap = sg.snap_report_to_segment(40.749, -73.971, "", segs, max_meters=200)
    assert snap is not None
    assert snap["segmentId"] == "S1"


def test_snap_by_name():
    segs = pd.DataFrame([
        {"segmentId":"S1","streetName":"BROADWAY","centroid_lon":-73.97,"centroid_lat":40.75,"polyline":"","length_ft":1000,"posted_speed":30,"num_lanes":4,"truck_route_type":"YES","city_len_units":100,"road_class":"arterial"},
        {"segmentId":"S2","streetName":"PARK AVE","centroid_lon":-73.96,"centroid_lat":40.74,"polyline":"","length_ft":500,"posted_speed":25,"num_lanes":2,"truck_route_type":"","city_len_units":50,"road_class":"collector"},
    ])
    snap = sg.snap_report_to_segment(None, None, "Park Ave", segs)
    assert snap is not None
    assert snap["segmentId"] == "S2"


def test_snap_unmatched_returns_none():
    segs = pd.DataFrame([
        {"segmentId":"S1","streetName":"BROADWAY","centroid_lon":-73.97,"centroid_lat":40.75,"polyline":"","length_ft":1000,"posted_speed":30,"num_lanes":4,"truck_route_type":"YES","city_len_units":100,"road_class":"arterial"},
    ])
    snap = sg.snap_report_to_segment(None, None, "Nonsense Way", segs)
    assert snap is None
