@echo off
REM ============================================================
REM  RELOAD - Web Edition : double-click to play locally.
REM  Starts a tiny no-cache web server and opens your browser.
REM  Close the "RELOAD server" window to stop playing.
REM ============================================================
setlocal
cd /d "%~dp0"
set "PORT=8765"
set "URL=http://localhost:%PORT%/index.html"

REM Find a Python launcher: prefer the Windows "py -3", then plain "python".
set "PY="
where py >nul 2>nul && set "PY=py -3"
if not defined PY ( where python >nul 2>nul && set "PY=python" )

if defined PY (
  echo Starting RELOAD server on %URL%
  start "RELOAD server" /min %PY% devserver.py
  REM give the server a moment to bind before the browser connects
  timeout /t 1 /nobreak >nul
  start "" "%URL%"
  echo.
  echo RELOAD is running. Close the minimized "RELOAD server" window to stop.
) else (
  echo Python was not found, so opening index.html directly in your browser.
  echo ^(The game still runs; if any board art looks off, install Python from
  echo  https://www.python.org and run this file again, or play online:
  echo  https://ethan9123.github.io/reload-web/ ^)
  start "" "index.html"
)
endlocal
