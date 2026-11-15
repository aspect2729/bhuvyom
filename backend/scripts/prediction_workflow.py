"""Run real monthly development and optional one-time test/promotion.

python scripts/prediction_workflow.py --variable T2M --promote --evaluate-test
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from engines.prediction import workflow

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--variable', choices=['T2M', 'PRECTOTCORR'], default='T2M')
    parser.add_argument('--force-development', action='store_true')
    parser.add_argument('--evaluate-test', action='store_true')
    parser.add_argument('--promote', action='store_true')
    parser.add_argument('--run-id', help='Use an existing immutable run without new development')
    parser.add_argument('--audit-intervals', action='store_true')
    args = parser.parse_args()
    experiment = workflow.load(args.run_id)[1] if args.run_id else workflow.develop(args.variable, args.force_development)
    print(json.dumps({'run_id': experiment['run_id'], 'periods': experiment['periods'], 'selected_by_horizon': experiment['selected_by_horizon']}, indent=2), flush=True)
    if args.promote:
        print(json.dumps(workflow.promote(experiment['run_id']), indent=2), flush=True)
    if args.evaluate_test:
        print(json.dumps(workflow.evaluate_test(experiment['run_id']), indent=2), flush=True)
    if args.audit_intervals:
        print(json.dumps(workflow.repair_intervals(experiment['run_id']), indent=2), flush=True)
