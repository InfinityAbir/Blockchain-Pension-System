@echo off
setlocal EnableExtensions

rem Stops only the two command windows started by this project's start.bat.
echo Stopping the Pension System...

for %%T in ("Pension-Chain*" "Pension-Frontend*") do (
  taskkill /F /T /FI "WINDOWTITLE eq %%~T" >nul 2>&1
)

echo.
echo Done. The local blockchain and Pension System website have been stopped.
echo Press any key to close this window.
pause >nul
endlocal
exit /b 0
