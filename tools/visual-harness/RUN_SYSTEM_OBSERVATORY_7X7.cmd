@echo off
setlocal
cd /d "%~dp0\..\.."
node "tools\visual-harness\source\capture_system_observatory.mjs" --repo "%CD%" --seed 671278205 --center-x 4 --center-z 3 --radius 3 --out "%CD%\.visual-probe-output\system-observatory-7x7" %*
set RC=%ERRORLEVEL%
echo.
echo Open: %CD%\.visual-probe-output\system-observatory-7x7\index.html
exit /b %RC%
