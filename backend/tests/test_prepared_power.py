"""Synthetic archive fixtures test alignment, not scientific model performance."""
import json

from engines import prepared_data


def test_monthly_archive_deduplicates_aligns_and_preserves_missing(tmp_path, monkeypatch):
    def archive(values):
        return {
            'header': {'fill_value': -999, 'sources': ['synthetic-test-fixture']},
            'properties': {'parameter': {'T2M': values}},
            'parameters': {'T2M': {'units': 'C', 'longname': 'Temperature'}},
        }

    files = {
        'monthly_13.000_77.500_1981_2025.json': {'198101': 999},
        'monthly_13.000_77.500_1981_2026.json': {
            '198101': 21, '198103': 23, '198104': -999, '198113': 900,
        },
        'monthly_13.500_77.500_1981_2026.json': {
            '198101': 18, '198102': 19, '198103': 20, '198104': None,
        },
    }
    for name, values in files.items():
        (tmp_path / name).write_text(json.dumps(archive(values)), encoding='utf-8')
    monkeypatch.setattr(prepared_data, 'POWER_MONTHLY_DIR', tmp_path)
    prepared_data.power_monthly.cache_clear()
    try:
        data = prepared_data.power_monthly()
        assert len(data['cells']) == 2
        assert data['months'] == ['1981-01', '1981-02', '1981-03']
        assert data['series']['T2M']['p_13.000_77.500'] == [21, None, 23]
        assert data['series']['T2M']['p_13.500_77.500'] == [18, 19, 20]
        assert len(data['files']) == 2
        assert all('2025' not in name for name in data['files'])
    finally:
        prepared_data.power_monthly.cache_clear()
