@echo off
setlocal EnableExtensions
set "PACKAGE_ROOT=%~dp0."
where node >nul 2>nul || (
  echo [JWEB pushzip] Node.js was not found on PATH.
  exit /b 1
)
node "%PACKAGE_ROOT%\bootstrap\jweb-pushzip-runner.mjs" "%PACKAGE_ROOT%"
exit /b %ERRORLEVEL%
