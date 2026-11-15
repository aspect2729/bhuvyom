"""Synthetic payload tests; not evidence of real forecast skill."""
from datetime import date
import pytest
from pipeline.hourly_ingestion import PARAMETERS, parse_power, power_cells


def test_capacity_requires_budget_and_batch_headroom():
    from pipeline.hourly_ingestion import require_capacity
    mib = 1024 * 1024
    with pytest.raises(RuntimeError):
        require_capacity(535 * mib, 0)
    with pytest.raises(RuntimeError):
        require_capacity(535 * mib, 500 * mib)
    with pytest.raises(RuntimeError):
        require_capacity(400 * mib, 500 * mib, rows=10000)
    require_capacity(400 * mib, 1024 * mib, rows=10000)


def payload():
    values = {'T2M': 25., 'RH2M': 60., 'PS': 92., 'WS2M': 2.}
    return {'header': {'time_standard': 'UTC', 'fill_value': -999.},
            'geometry': {'coordinates': [77.5, 13., 800.]},
            'parameters': {k: {'units': v[2]} for k, v in PARAMETERS.items()},
            'properties': {'parameter': {k: {f'20200101{h:02d}': v for h in range(24)} for k, v in values.items()}}}


def test_hourly_utc_conversion_and_missing_preservation():
    data = payload()
    data['properties']['parameter']['T2M']['2020010100'] = -999.
    del data['properties']['parameter']['T2M']['2020010101']
    data['properties']['parameter']['WS2M']['2020010100'] = 0.
    rows, qc = parse_power(data, date(2020, 1, 1), date(2020, 1, 1), 13., 77.5)
    assert len(rows) == 94 and qc['T2M']['missing'] == 2
    assert all(r['value_numeric'] == 92000. for r in rows if r['parameter'] == 'PS')
    assert any(r['parameter'] == 'WS2M' and r['value_numeric'] == 0. for r in rows)
    assert rows[0]['observed_at'] == '2020-01-01T02:00:00+00:00'


@pytest.mark.parametrize('kind', ['timezone', 'units', 'point', 'timestamp'])
def test_reject_ambiguous_payloads(kind):
    data = payload()
    if kind == 'timezone': data['header']['time_standard'] = 'LST'
    if kind == 'units': data['parameters']['PS']['units'] = 'Pa'
    if kind == 'point': data['geometry']['coordinates'][0] = 78.
    if kind == 'timestamp': data['properties']['parameter']['T2M']['2020020100'] = 20.
    with pytest.raises(ValueError):
        parse_power(data, date(2020, 1, 1), date(2020, 1, 1), 13., 77.5)


def test_native_cell_overlap_instead_of_one_km_resampling():
    geometry = {'type': 'Polygon', 'coordinates': [[[77.46, 12.83], [77.78, 12.83], [77.78, 13.14], [77.46, 13.14], [77.46, 12.83]]]}
    assert power_cells(geometry) == [(13., 77.5)]
