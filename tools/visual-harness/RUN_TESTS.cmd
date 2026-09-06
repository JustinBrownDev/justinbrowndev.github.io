@echo off
setlocal EnableExtensions
cd /d "%~dp0\..\.."
node tools\visual-harness\tests\portable_contract_selftest.mjs || exit /b 1
node tools\visual-harness\tests\fixture_specimen_selftest.mjs || exit /b 1
node tools\visual-harness\tests\visual_probe_selftest.mjs || exit /b 1
echo PASS: parked JWEB visual harness tests
