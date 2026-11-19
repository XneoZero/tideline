@echo off
setlocal
cd /d "%~dp0" || goto :failed

where node.exe >nul 2>&1
if errorlevel 1 goto :node_required
node -e "process.exit(Number(process.versions.node.split('.')[0]) < 24 ? 1 : 0)"
if errorlevel 1 goto :node_required

for %%D in (cheerio express fast-xml-parser playwright) do if not exist "node_modules\%%D\package.json" goto :install
goto :launch

:install
echo Installing Tideline dependencies...
call npm.cmd ci
if errorlevel 1 goto :failed

:launch
echo Starting Tideline. Press Ctrl+C to stop.
node src\server.mjs
if errorlevel 1 goto :failed
exit /b 0

:node_required
echo Node.js 24 or later is required. Install it and run start.bat again.
pause
exit /b 1

:failed
echo Tideline could not start. See the error above.
pause
exit /b 1
