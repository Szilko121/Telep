\
@echo off
setlocal
cd /d "%~dp0"
echo Starting local server on http://localhost:5173 ...
where node >nul 2>nul
if %errorlevel%==0 (
  npx --yes serve -s . -l 5173
) else (
  where python >nul 2>nul
  if %errorlevel%==0 (
    python -m http.server 5173
  ) else (
    echo Neither Node.js nor Python was found. Open index.html directly with your browser.
    pause
    exit /b 1
  )
)
