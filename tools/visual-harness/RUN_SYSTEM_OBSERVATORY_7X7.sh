#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/../.."
exec node tools/visual-harness/source/capture_system_observatory.mjs --repo "$PWD" --seed 671278205 --center-x 4 --center-z 3 --radius 3 --out "$PWD/.visual-probe-output/system-observatory-7x7" "$@"
