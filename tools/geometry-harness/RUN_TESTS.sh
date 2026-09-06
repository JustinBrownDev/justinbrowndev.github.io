#!/usr/bin/env sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$ROOT"
python tests/selftest.py
python tests/hardcore_selftest.py
python tests/unified_ingest_selftest.py
