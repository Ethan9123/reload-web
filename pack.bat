@echo off
REM ============================================================
REM  RELOAD - Web Edition : build a shareable .zip.
REM  Uses "git archive", so it bundles ONLY git-tracked files
REM  and automatically excludes the non-redistributable ripped
REM  art (everything .gitignore keeps out). Unzip anywhere and
REM  double-click run.bat to play.
REM ============================================================
setlocal
cd /d "%~dp0"
set "OUT=reload-web-dist.zip"

where git >nul 2>nul
if errorlevel 1 (
  echo Git was not found. pack.bat relies on "git archive" so the zip only
  echo contains files that are safe to share. Install Git from
  echo https://git-scm.com and run this again.
  pause
  exit /b 1
)

if exist "%OUT%" del "%OUT%"
echo Packing tracked files into %OUT%  ^(excludes gitignored / non-redistributable art^) ...
git archive --format=zip -o "%OUT%" HEAD
if exist "%OUT%" (
  echo.
  echo Done: %OUT%
  echo Share it; the recipient unzips and double-clicks run.bat to play.
) else (
  echo Pack failed - is this a git repository with at least one commit?
)
endlocal
