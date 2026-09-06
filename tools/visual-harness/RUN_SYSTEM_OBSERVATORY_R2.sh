#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/../.."
exec node tools/visual-harness/source/capture_system_observatory_r2.mjs "$@"
