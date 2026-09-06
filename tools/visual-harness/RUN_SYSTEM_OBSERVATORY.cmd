@echo off
setlocal
cd /d "%~dp0\..\.."
node "tools\visual-harness\source\capture_system_observatory.mjs" --repo "%CD%" --seed 671278205 --center-x 4 --center-z 3 --radius 2 --out "%CD%\.visual-probe-output\system-observatory"
if errorlevel 1 exit /b %errorlevel%
echo.
echo Open: %CD%\.visual-probe-output\system-observatory\index.html
endlocal
