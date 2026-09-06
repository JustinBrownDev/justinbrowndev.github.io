@echo off
setlocal
cd /d "%~dp0\..\.."
node tools\visual-harness\source\compare_system_observatory_r2.mjs %*
exit /b %ERRORLEVEL%
