"""Shared configuration for the ML pipeline."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
OUT = ROOT / "outputs"

# NYC Open Data endpoints (verified live).
ENDPOINT_311 = "https://data.cityofnewyork.us/resource/erm2-nwe9.json"
ENDPOINT_CENTERLINE = "https://data.cityofnewyork.us/resource/inkn-q76z.json"
ENDPOINT_WEATHER = "https://archive-api.open-meteo.com/v1/archive"
ENDPOINT_TRAFFIC = "https://data.cityofnewyork.us/resource/7ym2-wayt.json"

# Socrata SoQL escaping helpers.
def soda_where(**conditions: str) -> str:
    """Build a SODA $where clause from key=value pairs (values already quoted)."""
    return " AND ".join(f"{k}={v}" for k, v in conditions.items())

# Training window.
TRAIN_START = "2020-01-01"
TRAIN_END = "2023-12-31"
VAL_START = "2024-01-01"
VAL_END = "2024-06-30"
TEST_START = "2024-07-01"
TEST_END = "2024-12-31"

# Midtown subset bounds (lat/lon): 34th St to 59th St, river to river.
# 34th St ≈ 40.748, 59th St ≈ 40.779. River-to-river: lon roughly -74.02 to -73.97.
MIDTOWN = {
    "lat_min": 40.610,
    "lat_max": 40.780,
    "lon_min": -74.030,
    "lon_max": -73.960,
}

# Weather grid point (Open-Meteo Midtown proxy).
WEATHER_LAT = 40.78
WEATHER_LON = -73.97

# Fixed seed.
SEED = 42
