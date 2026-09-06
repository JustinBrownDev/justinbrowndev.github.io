@echo off
setlocal EnableExtensions
cd /d "%~dp0\..\.."
node tools\visual-harness\tests\portable_contract_selftest.mjs || exit /b 1
node tools\visual-harness\tests\fixture_specimen_selftest.mjs || exit /b 1
node tools\visual-harness\tests\visual_probe_selftest.mjs || exit /b 1
node tools\visual-harness\tests\live_agent_api_selftest.mjs || exit /b 1
node tools\visual-harness\tests\system_observatory_selftest.mjs || exit /b 1
node tools\visual-harness\tests\system_observatory_r2_selftest.mjs || exit /b 1
echo PASS: live JWEB visual harness tests
