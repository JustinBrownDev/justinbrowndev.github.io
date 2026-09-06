@echo off
setlocal EnableExtensions
cd /d "%~dp0\..\.."
where node >nul 2>nul || (echo Node.js was not found on PATH.& exit /b 1)
start "JWEB visual harness server" /B node "tools\visual-harness\serve.mjs" --port 8123
ping 127.0.0.1 -n 2 >nul
start "" "http://127.0.0.1:8123/?visualProbe=1"
start "" "http://127.0.0.1:8123/tools/visual-harness/specimen.html?mode=fixture&fixture=apartment-stair&target=flight-low"
start "" "http://127.0.0.1:8123/tools/visual-harness/specimen.html?mode=generator&seed=671278205&chunk=0,0&target=compound-stair"
start "" "http://127.0.0.1:8123/tools/visual-harness/browser-selftest.html"
echo Live REAL CITY, fixture, generator, and browser-selftest pages opened.
echo In REAL CITY console: await window.__debug.visualProbe.install()
echo Artistic example: await window.__jwebVisualProbe.captureArtPass([], {download:true})
echo Server port: 8123
