"""Immutable local prediction/evaluation ledger; metrics are derived from matched rows."""
from __future__ import annotations

import hashlib
import json
import math
import os
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

MIN_GROUP = 24


def now():
    return datetime.now(timezone.utc).isoformat()


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, allow_nan=False).encode()).hexdigest()


def write_once(path: Path, value, lines=False):
    """Exclusive creation + fsync. A new experiment never replaces an old artifact."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('x', encoding='utf-8', newline='\n') as stream:
        if lines:
            for row in value:
                stream.write(json.dumps(row, allow_nan=False) + '\n')
        else:
            json.dump(value, stream, allow_nan=False, indent=2)
        stream.flush()
        os.fsync(stream.fileno())
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read_rows(path):
    with path.open(encoding='utf-8') as stream:
        return [json.loads(line) for line in stream if line.strip()]


def score(prediction_path, observations, source, expected_sha):
    """Reopen persisted predictions, then reveal observations by (grid, time, variable)."""
    if hashlib.sha256(prediction_path.read_bytes()).hexdigest() != expected_sha:
        raise ValueError('Prediction artifact changed before verification')
    result = []
    for row in read_rows(prediction_path):
        actual = observations.get((row['grid_id'], row['target_timestamp'], row['variable']))
        if actual is not None and not math.isfinite(actual):
            actual = None
        predicted = row['predicted_value']
        error = actual - predicted if actual is not None and predicted is not None else None
        result.append({
            'prediction_id': row['prediction_id'], 'actual_value': actual,
            'actual_observation_source': source, 'observation_quality': 'source_valid_no_independent_measurement_qc' if actual is not None else 'missing',
            'signed_error': error, 'absolute_error': abs(error) if error is not None else None,
            'squared_error': error ** 2 if error is not None else None,
            'evaluation_timestamp': now(), 'evaluation_dataset': row['evaluation_dataset'],
            'prediction_artifact_sha256': expected_sha,
        })
    return result


def joined(predictions, evaluations):
    by_id = {row['prediction_id']: row for row in predictions}
    if len(by_id) != len(predictions):
        raise ValueError('Duplicate prediction IDs')
    result, seen = [], set()
    for evaluation in evaluations:
        pid = evaluation['prediction_id']
        if pid not in by_id or pid in seen:
            raise ValueError('Unmatched or duplicate evaluation')
        seen.add(pid)
        result.append({**by_id[pid], **evaluation})
    return result


def metrics(rows):
    usable = [r for r in rows if r.get('signed_error') is not None]
    n = len(usable)
    empty = dict(n=0, mae=None, rmse=None, bias=None, r2=None, coverage_80=None, coverage_95=None, interval_n=0, mean_width_80=None, pinball_10=None, pinball_90=None)
    if not n:
        return empty
    errors = np.asarray([r['signed_error'] for r in usable], float)
    actual = np.asarray([r['actual_value'] for r in usable], float)
    denominator = float(np.sum((actual - actual.mean()) ** 2))
    result = {**empty, 'n': n, 'mae': float(np.mean(np.abs(errors))), 'rmse': float(np.sqrt(np.mean(errors ** 2))),
              'bias': float(-errors.mean()), 'r2': float(1 - np.sum(errors ** 2) / denominator) if denominator > 1e-12 else None}
    intervals = [r for r in usable if r.get('pi80_low') is not None and r.get('pi95_low') is not None]
    if intervals:
        result['interval_n'] = len(intervals)
        for coverage in (80, 95):
            result[f'coverage_{coverage}'] = sum(r[f'pi{coverage}_low'] <= r['actual_value'] <= r[f'pi{coverage}_high'] for r in intervals) / len(intervals)
        result['mean_width_80'] = float(np.mean([r['pi80_high'] - r['pi80_low'] for r in intervals]))
        for q, key in ((.1, 'pi80_low'), (.9, 'pi80_high')):
            residuals = np.array([r['actual_value'] - r[key] for r in intervals])
            result[f'pinball_{int(q * 100)}'] = float(np.mean(np.maximum(q * residuals, (q - 1) * residuals)))
    return result


def grouped(rows, key, minimum=MIN_GROUP):
    buckets = defaultdict(list)
    for row in rows:
        buckets[str(key(row))].append(row)
    result = []
    for group, values in sorted(buckets.items()):
        measured = metrics(values)
        sufficient = measured['n'] >= minimum
        result.append({'group': group, **measured, 'sufficient': sufficient,
                       **({k: None for k in ('mae', 'rmse', 'bias', 'r2', 'coverage_80', 'coverage_95', 'mean_width_80', 'pinball_10', 'pinball_90')} if not sufficient else {})})
        if measured['interval_n'] < minimum:
            for field in ('coverage_80', 'coverage_95', 'mean_width_80', 'pinball_10', 'pinball_90'):
                result[-1][field] = None
    return result


def season(row):
    month = int(row['target_timestamp'][5:7])
    return 'DJF' if month in (12, 1, 2) else 'MAM' if month in (3, 4, 5) else 'JJAS' if month in (6, 7, 8, 9) else 'ON'
