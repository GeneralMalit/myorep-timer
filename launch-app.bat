@echo off
setlocal

pushd "%~dp0"

set "APP_URL=http://127.0.0.1:5173/"
set "DEV_COMMAND=npm run dev -- --host 127.0.0.1 --port 5173 --strictPort"

for /f %%A in ('powershell -NoProfile -Command "if (Test-NetConnection -ComputerName 127.0.0.1 -Port 5173 -InformationLevel Quiet) { Write-Output open } else { Write-Output closed }"') do set "PORT_STATE=%%A"

if /I not "%PORT_STATE%"=="open" (
  start "MyoRep Timer Dev Server" cmd /k "%DEV_COMMAND%"
  timeout /t 3 /nobreak >nul
)

start "" "%APP_URL%"

popd
endlocal
