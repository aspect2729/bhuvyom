"""Archive integrity checks use small synthetic ledgers, never forecast skill claims."""
import hashlib
import importlib.util
import json
from pathlib import Path
import pytest

spec = importlib.util.spec_from_file_location('archive_import', Path(__file__).parents[1] / 'scripts/import_prediction_archive.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def archive(tmp_path, bad_error=False):
    folder = tmp_path / 'experiment'
    folder.mkdir()
    row = dict(prediction_id='p1', run_id='experiment', evaluation_dataset='validation', model_id='baseline', forecast_origin='2020-01', predicted_value=3)
    raw = (json.dumps(row) + '\n').encode()
    sha = hashlib.sha256(raw).hexdigest()
    (folder / 'validation_predictions.jsonl').write_bytes(raw)
    evaluation = dict(prediction_id='p1', actual_value=5, signed_error=8 if bad_error else 2, absolute_error=2, squared_error=4, prediction_artifact_sha256=sha)
    (folder / 'validation_evaluations.jsonl').write_text(json.dumps(evaluation) + '\n')
    (folder / 'development.json').write_text(json.dumps({'artifact_hashes': {'validation_predictions': sha}}))
    return folder


def test_archive_verifies_predictions_and_errors(tmp_path):
    archive(tmp_path)
    assert len(module.load_archive(tmp_path)) == 1


def test_tampered_predictions_rejected(tmp_path):
    folder = archive(tmp_path)
    with (folder / 'validation_predictions.jsonl').open('a') as stream:
        stream.write('\n')
    with pytest.raises(ValueError, match='checksum'):
        module.load_archive(tmp_path)


def test_incorrect_evaluation_rejected(tmp_path):
    archive(tmp_path, bad_error=True)
    with pytest.raises(ValueError, match='error disagrees'):
        module.load_archive(tmp_path)


def test_month_horizons_use_calendar_not_fixed_days():
    assert (module.month('2020-03') - module.month('2020-02')).days == 29
