@echo off
cd /d "%~dp0.."
echo Starting Slay the Spire DIY...
echo If the browser does not open, wait a moment and visit http://localhost:5173
start "" cmd /c "timeout /t 3 /nobreak >nul & start http://localhost:5173"
call npm run dev
pause
