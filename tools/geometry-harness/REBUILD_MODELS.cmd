@echo off
setlocal
set "ROOT=%~dp0"
cd /d "%ROOT%"
python source\generate_models.py || exit /b 1
echo Models/specs rebuilt.
