#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/../.."
node tools/visual-harness/tests/portable_contract_selftest.mjs
node tools/visual-harness/tests/fixture_specimen_selftest.mjs
node tools/visual-harness/tests/visual_probe_selftest.mjs
