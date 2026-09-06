@echo off
setlocal
cd /d "%~dp0\..\.."
node tools\visual-harness\source\capture_system_observatory_r2.mjs %*
set RC=%ERRORLEVEL%
echo.
echo Output: %CD%\.visual-probe-output\system-observatory-r2\index.html
exit /b %RC%
