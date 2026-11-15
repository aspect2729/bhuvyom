"""Approved NASA hourly history ingestion. Credentials are read privately, never logged."""
import argparse
import json
import os
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from pipeline.hourly_ingestion import ingest_power


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--credential-file', type=Path)
    p.add_argument('--start', type=date.fromisoformat, required=True)
    p.add_argument('--end', type=date.fromisoformat, required=True)
    p.add_argument('--source', choices=['power', 'imerg'], default='power')
    p.add_argument('--earthdata-token-file', type=Path)
    p.add_argument('--workers', type=int, default=4)
    args = p.parse_args()
    dsn = args.credential_file.read_text().strip() if args.credential_file else os.environ['SUPABASE_DB_WRITE_URL']
    cache = Path(__file__).resolve().parents[1] / 'data' / 'cache' / 'prediction_ingestion'
    if args.source == 'imerg':
        from pipeline.imerg_history import ingest_imerg
        token = args.earthdata_token_file.read_text().strip() if args.earthdata_token_file else os.environ['EARTHDATA_TOKEN']
        if not 1 <= args.workers <= 6:
            raise ValueError('Use 1-6 concurrent NASA requests')
        for result in ingest_imerg(dsn, token, args.start, args.end, cache / 'imerg', args.workers):
            print(json.dumps({'source': 'NASA GPM IMERG half-hourly Final', **result}), flush=True)
        return
    current = args.start
    while current <= args.end:
        stop = min(date(current.year, 12, 31), args.end)
        result = ingest_power(dsn, current, stop, cache)
        print(json.dumps({'source': 'NASA POWER hourly', 'start': str(current), 'end': str(stop), 'results': result}), flush=True)
        if any(r.get('quality') in ('warning', 'fail') for r in result):
            raise RuntimeError('Historical expansion stopped for coverage/quality review')
        current = date(current.year + 1, 1, 1)


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        # Database/HTTP exception strings can contain authentication information.
        print(json.dumps({'status': 'failed', 'error_type': type(exc).__name__, 'sqlstate': getattr(exc, 'sqlstate', None)}), flush=True)
        raise SystemExit(1) from None
