@echo off
setlocal
set "ROOT=%~dp0"
cd /d "%ROOT%"
python tests\selftest.py || exit /b 1
python tests\hardcore_selftest.py || exit /b 1
python tests\unified_ingest_selftest.py || exit /b 1
echo.
echo ALL JWEB GEOMETRY HARNESS TESTS PASSED
