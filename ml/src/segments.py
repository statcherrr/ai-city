"""Build the segment table from NYC centerline and snap 311 reports to segments.

Each centerline row = one street-segment (blockface). We derive:
- segmentId = physicalid (or objectid fallback)
- streetName = full_street_name
- fromCross / toCross = cross streets derived from blockface address ranges + cross_street
  on the matched 311 report; where a report's cross streets are available we attach them.
- centroid lat/lon from the first linestring centroid (MultiLineString → first part).
- a short representative polyline sample (first 2 points of the first linestring) for the
  dashboard overlay line.
- length_ft = segmentlength
- road class derived from number_total_lanes + posted_speed + truck_route_type.

Report snapping:
- When the 311 row has a location Point, snap to the nearest segment by haversine distance
  from the report point to the segment centroid (fallback: nearest point on the segment
  linestring when we have the geometry; here we use centroid for speed and document it).
- When location is missing, snap by street name match (street_name ≈ full_street_name).
"""
from __future__ import annotations

import math
import re
from typing import Any, Optional

import pandas as pd


def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Haversine distance in meters between two lat/lon points."""
    R = 6371000.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def haversine_series(lat1: float, lon1: float, lat2_arr, lon2_arr):
    """Vectorized haversine distance from a point to arrays of points."""
    import numpy as np

    R = 6371000.0
    phi1 = math.radians(lat1)
    phi2_arr = np.radians(np.array(lat2_arr, dtype=float))
    dphi_arr = np.radians(np.array(lat2_arr, dtype=float) - lat1)
    dlambda_arr = np.radians(np.array(lon2_arr, dtype=float) - lon1)
    a = np.sin(dphi_arr / 2) ** 2 + math.cos(phi1) * np.cos(phi2_arr) * np.sin(dlambda_arr / 2) ** 2
    c = 2 * np.arcsin(np.sqrt(np.clip(a, 0, 1)))
    return R * c


def parse_point(geom: Any) -> Optional[tuple[float, float]]:
    """Extract (lon, lat) from a GeoJSON Point or MultiPoint first coordinate."""
    if not isinstance(geom, dict):
        return None
    typ = geom.get("type")
    coords = geom.get("coordinates")
    if typ == "Point" and isinstance(coords, list) and len(coords) >= 2:
        return (float(coords[0]), float(coords[1]))
    if typ == "MultiPoint" and isinstance(coords, list) and coords:
        c = coords[0]
        if isinstance(c, list) and len(c) >= 2:
            return (float(c[0]), float(c[1]))
    return None


def _to_python_coords(geom: Any) -> Optional[dict]:
    """Normalize a the_geom (which may carry numpy arrays from parquet) into plain Python lists."""
    if not isinstance(geom, dict):
        return None
    coords = geom.get("coordinates")
    if coords is None:
        return None
    try:
        # numpy arrays -> list-of-list-of-[lon,lat]
        out: list = []
        for part in coords:
            ring: list = []
            for pt in part:
                ring.append([float(pt[0]), float(pt[1])])
            out.append(ring)
        return {"type": geom.get("type"), "coordinates": out}
    except Exception:
        return None


def parse_line_start_end(geom: Any) -> Optional[tuple[tuple[float, float], tuple[float, float]]]:
    """Return (start_lon_lat, end_lon_lat) of the first LineString in a MultiLineString."""
    g = _to_python_coords(geom)
    if g is None:
        return None
    typ = g.get("type")
    coords = g.get("coordinates")
    if typ == "LineString" and isinstance(coords, list) and len(coords) >= 2:
        return ((float(coords[0][0]), float(coords[0][1])), (float(coords[-1][0]), float(coords[-1][1])))
    if typ == "MultiLineString" and isinstance(coords, list) and coords:
        first = coords[0]
        if isinstance(first, list) and len(first) >= 2:
            return ((float(first[0][0]), float(first[0][1])), (float(first[-1][0]), float(first[-1][1])))
    return None


def segment_centroid(geom: Any) -> Optional[tuple[float, float]]:
    """Centroid (lon, lat) of the first linestring's midpoint."""
    se = parse_line_start_end(geom)
    if se is None:
        pt = parse_point(geom)
        if pt is None:
            return None
        return pt
    (lon1, lat1), (lon2, lat2) = se
    return ((lon1 + lon2) / 2, (lat1 + lat2) / 2)


def lonlat_to_midtown_block(i: int, j: int):
    """Inverse of the city's world coords? Not needed — we map NYC segments directly to
    lat/lon. This helper is reserved for future graph matching if needed."""
    raise NotImplementedError


def build_segments(centerline: pd.DataFrame) -> pd.DataFrame:
    """Build the segment table from centerline rows."""
    out: list[dict[str, Any]] = []
    for _, r in centerline.iterrows():
        geom = r.get("the_geom")
        cent = segment_centroid(geom)
        if cent is None:
            continue
        lon, lat = cent
        poly = parse_line_start_end(geom)
        polyline_sample = None
        if poly is not None:
            polyline_sample = [list(poly[0]), list(poly[1])]
        seg = {
            "segmentId": str(r.get("physicalid") or r.get("objectid")),
            "streetName": str(r.get("full_street_name") or r.get("street_name") or "").strip().upper(),
            "fromCross": "",
            "toCross": "",
            "centroid_lon": lon,
            "centroid_lat": lat,
            "polyline": polyline_sample,
            "length_ft": float(r.get("segmentlength") or 0),
            "posted_speed": int(str(r.get("posted_speed") or 0) or 0),
            "num_lanes": int(str(r.get("number_total_lanes") or 0) or 0),
            "truck_route_type": str(r.get("truck_route_type") or ""),
            "city_len_units": float(r.get("segmentlength") or 0) / 3.28084,  # ft -> meters approx
        }
        # Road class from lanes + speed + truck route
        lanes = seg["num_lanes"]
        speed = seg["posted_speed"]
        truck = seg["truck_route_type"]
        if lanes >= 3 or truck.strip().upper() in ("YES", "Y", "1", "BUS", "TRUCK"):
            seg["road_class"] = "arterial"
        elif lanes >= 2 or speed >= 25:
            seg["road_class"] = "collector"
        else:
            seg["road_class"] = "local"
        out.append(seg)
    return pd.DataFrame(out)


def _norm_street(s: str) -> str:
    if not isinstance(s, str):
        return ""
    return re.sub(r"\s+", " ", re.sub(r"[^A-Z0-9 ]", "", s.upper())).strip()


_STREET_ALIAS = {
    "AVENUE": "AVE",
    "AV": "AVE",
    "STREET": "ST",
    "ST": "ST",
    "PLACE": "PL",
    "PL": "PL",
    "BOULEVARD": "BLVD",
    "BLVD": "BLVD",
    "DRIVE": "DR",
    "DR": "DR",
    "COURT": "CT",
    "CT": "CT",
    "LOUGH": "",
}


def _norm_alias(name: str) -> str:
    """Normalize street name tokens: collapse whitespace, then map type tokens to canonical short forms
    so e.g. '5 AVENUE', '5 AV', '5TH AVENUE' all map to a comparable key."""
    toks = name.split()
    out: list[str] = []
    for t in toks:
        up = t.upper()
        # strip ordinal suffix: 5TH -> 5, 5TH-6TH -> keep
        import re as _re
        base = _re.sub(r"\b(TH|ND|RD|ST)\b", "", up) if len(up) > 2 and up[-2:].upper() in ("TH","ND","RD","ST") else up
        canonical = _STREET_ALIAS.get(base, base)
        if canonical:
            out.append(canonical)
    return " ".join(out)


def snap_report_to_segment(
    report_lat: Optional[float],
    report_lon: Optional[float],
    report_street: str,
    segments: pd.DataFrame,
    max_meters: float = 500.0,
) -> Optional[dict[str, Any]]:
    """Snap a single 311 report to its nearest segment. Returns segment row dict or None.

    Priority:
    1. If report has lat/lon, haversine to each segment centroid; take nearest within max.
    2. Else if report has a street name, match by alias-normalized street name.
    """
    # If we have lat/lon, snap to the nearest segment by haversine distance
    # to the segment CENTROID, with a wider tolerance (2km) since centerline
    # centroids can be offset from the actual street (e.g. for 5th Ave reports
    # near the east river, the nearest centroid may be a cross street).
    if report_lat is not None and report_lon is not None:
        dists = haversine_series(report_lat, report_lon, segments["centroid_lat"].values, segments["centroid_lon"].values)
        idx = int(dists.argmin())
        best_dist = float(dists[idx])
        if best_dist <= 2000.0:
            return segments.iloc[idx].to_dict()
        return None
    # Name-based fallback: match by alias-normalized street name.
    if not report_street:
        return None
    r_norm = _norm_alias(_norm_street(report_street))
    if not r_norm:
        return None
    best = None
    for _, s in segments.iterrows():
        if _norm_alias(_norm_street(s["streetName"])) == r_norm:
            return s.to_dict()
    return None


def attach_cross_streets(
    segments: pd.DataFrame,
    reports: pd.DataFrame,
    street_col: str = "street_name",
    cross1_col: str = "cross_street_1",
    cross2_col: str = "cross_street_2",
) -> pd.DataFrame:
    """For each segment, collect the most common fromCross / toCross from snapped reports.

    where reports have cross streets. This makes fromCross/toCross meaningful for the dashboard.
    """
    from collections import Counter
    from_cross: Counter[str] = Counter()
    to_cross: Counter[str] = Counter()
    # Build a name->segment map
    seg_by_name: dict[str, Any] = {}
    for _, s in segments.iterrows():
        seg_by_name[s["streetName"]] = s["segmentId"]
    for _, r in reports.iterrows():
        sl = r.get(street_col)
        if not sl:
            continue
        sl_norm = str(sl).strip().upper()
        seg_id = seg_by_name.get(sl_norm)
        if seg_id is None:
            continue
        c1 = r.get(cross1_col)
        c2 = r.get(cross2_col)
        if isinstance(c1, str) and c1.strip():
            from_cross[c1.strip().upper()] += 1
        if isinstance(c2, str) and c2.strip():
            to_cross[c2.strip().upper()] += 1
    for _, s in segments.iterrows():
        sid = s["segmentId"]
        fc = from_cross.most_common(1)
        tc = to_cross.most_common(1)
        # Map back via segment id
    # Simpler: assign by name match
    for _, s in segments.iterrows():
        name = s["streetName"]
        # Find cross streets from reports on this street name
        mask = reports[street_col].fillna("").astype(str).str.upper() == name
        sub = reports[mask]
        c1_list = [str(x).strip().upper() for x in sub[cross1_col].fillna("") if str(x).strip()]
        c2_list = [str(x).strip().upper() for x in sub[cross2_col].fillna("") if str(x).strip()]
        s["fromCross"] = max(set(c1_list), key=c1_list.count) if c1_list else ""
        s["toCross"] = max(set(c2_list), key=c2_list.count) if c2_list else ""
    return segments
