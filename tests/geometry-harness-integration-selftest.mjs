import assert from 'node:assert/strict';
import fs from 'node:fs';
const required = [
  'tools/geometry-harness/README.md',
  'tools/geometry-harness/source/audit_jweb_authority.mjs',
  'tools/geometry-harness/source/capture_jweb_scene.mjs',
  'tools/geometry-harness/source/jweb_silhouette_tester.py',
  'tools/geometry-harness/tests/selftest.py',
  'tools/geometry-harness/tests/hardcore_selftest.py',
  'tools/geometry-harness/tests/unified_ingest_selftest.py',
  'tools/geometry-harness/audit/2026-09-06/AUDIT_REPORT.md',
  'tools/geometry-harness/audit/2026-09-06/CURRENT-21Z-OBSERVATIONS.md',
];
for (const file of required) assert.ok(fs.existsSync(file), `missing integrated geometry harness file: ${file}`);
assert.ok(!fs.existsSync('tools/geometry-harness/output'), 'generated harness output must not be committed');
console.log('[geometry-harness-integration-selftest] PASS', { required: required.length, invariant: 'offline reusable harness is present; generated output stays out of source' });
