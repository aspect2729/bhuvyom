"""Synthetic NetCDF fixtures for timestamp, rate and quality handling."""
from datetime import datetime, timezone

import netCDF4
import numpy as np
import pytest
from shapely.geometry import box

from pipeline.imerg_history import parse_subset, subset_indices


def fixture(path, *, units='mm/hr', offset=0):
    with netCDF4.Dataset(path, 'w') as ds:
        for dim, size in [('time', 1), ('lon', 1), ('lat', 2)]:
            ds.createDimension(dim, size)
        tv = ds.createVariable('time', 'i4', ('time',))
        tv.units = 'seconds since 2020-01-01 00:00:00 UTC'
        tv[:] = [offset]
        ds.createVariable('lon', 'f4', ('lon',))[:] = [77.55]
        ds.createVariable('lat', 'f4', ('lat',))[:] = [12.95, 13.05]
        for name, values in [('precipitation', [0., -9999.9]), ('precipitationQualityIndex', [.8, .7]), ('randomError', [.24, .3])]:
            v = ds.createVariable(name, 'f4', ('time', 'lon', 'lat'), fill_value=np.float32(-9999.9))
            v.units = units if name != 'precipitationQualityIndex' else '1'
            v[:] = np.array(values).reshape(1, 1, 2)
    return {'id': 'synthetic-only', 'title': 'fixture', 'time_start': '2020-01-01T00:00:00Z', 'subset_url': 'https://example.invalid/fixture'}


def test_zero_rain_is_preserved_and_fill_is_missing(tmp_path):
    path = tmp_path / 'fixture.nc'
    result = parse_subset(path, fixture(path), box(77.5, 12.9, 77.6, 13.1))
    assert [c['value'] for c in result['cells']] == [0., None]
    assert result['cells'][0]['quality_index'] == pytest.approx(.8)
    assert result['cells'][0]['random_error_mm_h'] == pytest.approx(.24)
    assert result['unit'] == 'mm/h'
    start = datetime.fromisoformat(result['timestamp'])
    assert start.tzinfo == timezone.utc
    assert (datetime.fromisoformat(result['interval_end']) - start).total_seconds() == 1800


@pytest.mark.parametrize('options', [{'units': 'mm/day'}, {'offset': 1800}])
def test_reject_wrong_units_or_valid_time(tmp_path, options):
    path = tmp_path / 'fixture.nc'
    entry = fixture(path, **options)
    with pytest.raises(ValueError):
        parse_subset(path, entry, box(77.5, 12.9, 77.6, 13.1))


def test_subset_uses_cell_edges():
    assert subset_indices(box(77.4600793, 12.8334905, 77.7842034, 13.1426195)) == (2574, 2577, 1028, 1031)
