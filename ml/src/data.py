"""Fetch and cache NYC datasets.

Caches each raw dataset locally under ml/data/raw/ so repeated runs don't hit the API.
"""
from __future__ import annotations

import json
import urllib.request
from pathlib import Path
from typing import Any

import pandas as pd

# Allow running as `python ml/src/data.py` (standalone) or as a package.
try:
    from .config import ENDPOINT_311, ENDPOINT_CENTERLINE, ENDPOINT_TRAFFIC, ENDPOINT_WEATHER, RAW, soda_where
except ImportError:
    import sys, os
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from config import ENDPOINT_311, ENDPOINT_CENTERLINE, ENDPOINT_TRAFFIC, ENDPOINT_WEATHER, RAW, soda_where

UserAgent = "ai-city-ml/0.1"


def _get(url: str, timeout: int = 90) -> Any:
    req = urllib.request.Request(url, headers={"User-Agent": UserAgent})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def _soda_get(endpoint: str, params: dict[str, str], timeout: int = 120) -> Any:
    import urllib.parse
    q = urllib.parse.urlencode(params, safe="$")
    url = f"{endpoint}?{q}"
    return _get(url, timeout=timeout)


def fetch_311() -> pd.DataFrame:
    """Fetch Manhattan pothole/street-condition complaints 2020-present, with location."""
    cache = RAW / "311_manhattan_potholes.parquet"
    if cache.exists():
        return pd.read_parquet(cache)
    # Soda $where must have operators like >= NOT encoded as =>= (which soda_where does).
    # Build the $where manually so >= survives percent-encoding correctly.
    where = ("borough='MANHATTAN' AND complaint_type='Street Condition' "
             "AND descriptor='Pothole' AND created_date >= '2020-01-01'")
    params: dict[str, str] = {
        "$select": "unique_key,created_date,street_name,cross_street_1,cross_street_2,incident_address,address_type,status,resolution_description,location",
        "$where": where,
        "$limit": "50000",
    }
    rows: list[dict[str, Any]] = []
    offset = 0
    while True:
        params["$offset"] = str(offset)
        data = _soda_get(ENDPOINT_311, params)
        batch = data if isinstance(data, list) else data.get("results", data.get("data", []))
        if not batch:
            break
        rows.extend(batch)
        if len(batch) < 50000:
            break
        offset += 50000
    df = pd.DataFrame(rows)
    df["created_date"] = pd.to_datetime(df["created_date"], errors="coerce")
    def loc_xy(loc):
        if not isinstance(loc, dict) or loc.get("type") != "Point":
            return None, None
        coords = loc.get("coordinates")
        if not isinstance(coords, list) or len(coords) < 2:
            return None, None
        return float(coords[1]), float(coords[0])  # lat, lon
    locs = df["location"].apply(loc_xy)
    df["lat"] = locs.apply(lambda x: x[0])
    df["lon"] = locs.apply(lambda x: x[1])
    df.to_parquet(cache, index=False)
    return df


def fetch_centerline() -> pd.DataFrame:
    """Fetch Manhattan centerline blockface segments."""
    cache = RAW / "centerline_manhattan.parquet"
    if cache.exists():
        return pd.read_parquet(cache)
    params: dict[str, str] = {
        "$select": "physicalid,full_street_name,street_name,segmentlength,posted_speed,number_total_lanes,truck_route_type,trafdir,the_geom",
        "$where": soda_where(boroughcode="'3'"),
        "$limit": "50000",
    }
    rows: list[dict[str, Any]] = []
    offset = 0
    while True:
        params["$offset"] = str(offset)
        data = _soda_get(ENDPOINT_CENTERLINE, params)
        batch = data if isinstance(data, list) else data.get("results", data.get("data", []))
        if not batch:
            break
        rows.extend(batch)
        if len(batch) < 50000:
            break
        offset += 50000
    df = pd.DataFrame(rows)
    df.to_parquet(cache, index=False)
    return df


def fetch_weather_daily() -> pd.DataFrame:
    """Fetch daily historical weather for Manhattan from Open-Meteo (no key)."""
    cache = RAW / "weather_daily.parquet"
    if cache.exists():
        return pd.read_parquet(cache)
    import urllib.parse
    params = {
        "latitude": str(WEATHER_LAT),
        "longitude": str(WEATHER_LON),
        "start_date": "2019-01-01",
        "end_date": "2026-10-13",
        "daily": "temperature_2m_max,temperature_2m_min,precipitation_sum,snowfall_sum",
        "timezone": "UTC",
    }
    url = f"{ENDPOINT_WEATHER}?{urllib.parse.urlencode(params)}"
    data = _get(url)
    daily = data["daily"]
    df = pd.DataFrame({
        "date": pd.to_datetime(daily["time"]),
        "temp_max": pd.to_numeric(daily["temperature_2m_max"], errors="coerce"),
        "temp_min": pd.to_numeric(daily["temperature_2m_min"], errors="coerce"),
        "precip": pd.to_numeric(daily["precipitation_sum"], errors="coerce"),
        "snow": pd.to_numeric(daily["snowfall_sum"], errors="coerce"),
    })
    df.to_parquet(cache, index=False)
    return df


def fetch_traffic_counts() -> pd.DataFrame:
    """Fetch Manhattan automated traffic volume counts."""
    cache = RAW / "traffic_counts_manhattan.parquet"
    if cache.exists():
        return pd.read_parquet(cache)
    params: dict[str, str] = {
        "$select": "segmentid,street,fromst,tost,direction,vol,wktgeom",
        "$where": soda_where(boro="'Manhattan'"),
        "$limit": "50000",
    }
    rows: list[dict[str, Any]] = []
    offset = 0
    while True:
        params["$offset"] = str(offset)
        data = _soda_get(ENDPOINT_TRAFFIC, params)
        batch = data if isinstance(data, list) else data.get("results", data.get("data", []))
        if not batch:
            break
        rows.extend(batch)
        if len(batch) < 50000:
            break
        offset += 50000
    df = pd.DataFrame(rows)
    df.to_parquet(cache, index=False)
    return df
