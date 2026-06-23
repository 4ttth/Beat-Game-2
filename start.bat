@echo off
echo Starting Rhythm Game...
echo.
echo Backend:  http://localhost:3001
echo Frontend: http://localhost:5173
echo.
start "Rhythm Backend" cmd /k "cd /d %~dp0backend && npm.cmd run dev"
timeout /t 2 /nobreak > nul
start "Rhythm Frontend" cmd /k "cd /d %~dp0frontend && npm.cmd run dev"
echo.
echo Both servers started in separate windows.
