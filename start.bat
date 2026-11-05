@echo off
setlocal EnableExtensions

rem One-command launcher for the local blockchain and Pension System web app.
set "ROOT=%~dp0"
set "HARDHAT_DIR=%ROOT%Hardhat"
set "UI_DIR=%ROOT%pension-ui\vanilla-ui"
set "CHAIN_TITLE=Pension-Chain"
set "FRONTEND_TITLE=Pension-Frontend"

if not exist "%HARDHAT_DIR%\package.json" (
  echo ERROR: Could not find the Hardhat project folder.
  goto :failed
)
if not exist "%UI_DIR%\login.html" (
  echo ERROR: Could not find the Pension System web app folder.
  goto :failed
)

where npm.cmd >nul 2>&1
if errorlevel 1 (
  echo ERROR: Node.js and npm are required. Install Node.js, then run this file again.
  goto :failed
)

for %%P in (8545 3000) do (
  powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort %%P -State Listen -ErrorAction SilentlyContinue) { exit 1 }"
  if errorlevel 1 (
    echo ERROR: Port %%P is already in use.
    echo Run stop.bat if this Pension System project is already running, then try again.
    goto :failed
  )
)

echo Starting the local blockchain...
pushd "%HARDHAT_DIR%"
start "%CHAIN_TITLE%" cmd.exe /k npx.cmd hardhat node
popd

echo Waiting for the blockchain to be ready...
powershell -NoProfile -Command "$deadline=(Get-Date).AddSeconds(45); do { try { $client=New-Object Net.Sockets.TcpClient; $pending=$client.BeginConnect('127.0.0.1',8545,$null,$null); if($pending.AsyncWaitHandle.WaitOne(250)){ $client.EndConnect($pending); $client.Close(); exit 0 }; $client.Close() } catch {}; Start-Sleep -Milliseconds 250 } while((Get-Date)-lt $deadline); exit 1"
if errorlevel 1 (
  echo ERROR: The local blockchain did not start. Check the %CHAIN_TITLE% window.
  call "%ROOT%stop.bat"
  goto :failed
)

echo Deploying the Pension System smart contracts...
pushd "%HARDHAT_DIR%"
call npx.cmd hardhat run scripts/deploy.js --network localhost
set "DEPLOY_RESULT=%ERRORLEVEL%"
popd
if not "%DEPLOY_RESULT%"=="0" (
  echo ERROR: Contract deployment failed.
  call "%ROOT%stop.bat"
  goto :failed
)

echo Starting the Pension System website at http://localhost:3000 ...
pushd "%UI_DIR%"
start "%FRONTEND_TITLE%" cmd.exe /k npx.cmd --yes serve . -l 3000
popd

echo.
echo The Pension System is starting in two windows:
echo   Local blockchain: http://127.0.0.1:8545
echo   Web application:  http://localhost:3000/login.html
echo.
echo Use stop.bat when you are finished.
start "" "http://localhost:3000/login.html"
exit /b 0

:failed
echo.
echo The Pension System could not be started. Press any key to close this window.
pause >nul
endlocal
exit /b 1
