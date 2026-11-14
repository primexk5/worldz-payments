#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
: "${SECURITY_TEST_DATABASE_URL:?Set an explicit disposable PostgreSQL database URL}"
mkdir -p target/evidence
cargo test --locked -p worldz-near-api --bin worldz-near-api \
  orders_db_tests::fee_rotation_preserves_delayed_settlement_and_only_replaces_expired_unstarted_orders \
  -- --exact --ignored --nocapture 2>&1 | tee target/evidence/recovery.log
python3 - <<'PY'
import datetime
import hashlib
import json
import pathlib
import subprocess

root = pathlib.Path('.')
records = [json.loads(line.split('RECOVERY_EVIDENCE:', 1)[1])
           for line in (root / 'target/evidence/recovery.log').read_text().splitlines()
           if 'RECOVERY_EVIDENCE:' in line]
assert len(records) == 4 and {r['scenario'] for r in records} == {'unsubmitted', 'processing', 'paid', 'expired-unused'}, 'Missing or duplicate scenario evidence'
assert all(r['result'] == 'passed' for r in records)
sources = ['backend/src/orders.rs', 'backend/src/orders_db_tests.rs', 'scripts/check-recovery.sh']
report = {
    'schemaVersion': 1,
    'environment': 'disposable-postgres-with-fake-finalized-rpc',
    'publicTestnetSettlementProof': False,
    'generatedAtUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'baseCommit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(),
    'sourceSha256': {p: hashlib.sha256((root / p).read_bytes()).hexdigest() for p in sources},
    'scenarios': records,
}
path = root / 'target/evidence/recovery.json'
path.write_text(json.dumps(report, indent=2) + '\n')
print(f'Recovery evidence: {path}')
PY
