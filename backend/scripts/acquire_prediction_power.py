"""Acquire real NASA POWER monthly history using the existing adapter.

Downloads the Bengaluru representative cell by default, without credentials.
Environmental values remain at their native grid resolution. This does not
fabricate a multi-cell archive from one point.
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from data_sources.nasa_power_adapter import fetch_power_monthly_point
from engines import prepared_data as pd

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--lat', type=float, default=13.0)
    parser.add_argument('--lon', type=float, default=77.5)
    parser.add_argument('--through-year', type=int, default=2026)
    args = parser.parse_args()
    path = pd.POWER_MONTHLY_DIR / f'monthly_{args.lat:.3f}_{args.lon:.3f}_1981_{args.through_year}.json'
    if path.exists():
        print(f'Existing archive retained: {path}')
    else:
        response = fetch_power_monthly_point(args.lat, args.lon, '1981', str(args.through_year))
        raw = response.get('raw', response)
        if not all(v in raw.get('properties', {}).get('parameter', {}) for v in ('T2M', 'PRECTOTCORR')):
            raise ValueError('NASA response lacks required target variables')
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open('x', encoding='utf-8') as stream:
            json.dump(raw, stream, allow_nan=False)
        print(f'Acquired real NASA monthly observations: {path}')
