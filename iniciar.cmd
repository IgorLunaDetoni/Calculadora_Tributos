@echo off
setlocal
set "RTC_NODE=node.exe"
where node.exe >nul 2>nul
if not errorlevel 1 goto run

set "RTC_NODE=%LOCALAPPDATA%\Programs\Microsoft VS Code\Code.exe"
if exist "%RTC_NODE%" goto editor_runtime
set "RTC_NODE=%ProgramFiles%\Microsoft VS Code\Code.exe"
if exist "%RTC_NODE%" goto editor_runtime
echo Instale Node.js 22 ou superior e execute npm start.
exit /b 1

:editor_runtime
set "ELECTRON_RUN_AS_NODE=1"
echo Usando o runtime Node do VS Code para desenvolvimento local.

:run
if "%~1"=="--test" goto tests
if "%~1"=="--sync" goto sync
"%RTC_NODE%" "%~dp0server.mjs"
exit /b %errorlevel%

:tests
"%RTC_NODE%" --test "%~dp0tests\domain.test.mjs" "%~dp0tests\server.test.mjs" "%~dp0tests\governance.test.mjs"
exit /b %errorlevel%

:sync
"%RTC_NODE%" "%~dp0scripts\sync-sources.mjs"
exit /b %errorlevel%
