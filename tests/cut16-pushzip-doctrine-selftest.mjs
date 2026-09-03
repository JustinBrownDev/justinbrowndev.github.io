import assert from 'node:assert/strict';
import fs from 'node:fs';
const runner = fs.readFileSync(new URL('../tools/jweb-pushzip/runner.mjs', import.meta.url), 'utf8');
const doctrine = fs.readFileSync(new URL('../tools/jweb-pushzip/DOCTRINE.md', import.meta.url), 'utf8');
const architecture = fs.readFileSync(new URL('../STREAMING-WORLD-ARCHITECTURE.md', import.meta.url), 'utf8');
assert.match(runner, /runApplicatorAudit/);
assert.match(runner, /APPLICATOR AUDIT PASS/);
assert.match(runner, /applicatorAudit !== true/);
assert.match(doctrine, /Cut 15 R1–R3 operator-side applicator anchor discovery/);
assert.match(doctrine, /entire applicator contract must execute in a non-writing audit/);
assert.match(doctrine, /prefer an exact guarded full-file payload/);
assert.match(architecture, /Two-plane cavern invariant — Cut 16/);
assert.match(architecture, /two exact flat parallel planes/);
assert.match(architecture, /Growth direction is not gravity direction/);
assert.match(architecture, /same deterministic infinite generator and world seed at one fixed far-away chunk phase/);
console.log('[cut16-pushzip-doctrine-selftest] PASS', {
  invariant: 'deployment learns from Cut 15; architecture preserves the two-plane computational throughline',
});
