@echo off
REM RelayOps one-click launcher — starts API + web, keeps windows open.
cd /d "%~dp0backend"
if not exist node_modules echo Installing backend dependencies... & call npm install --no-audit --no-fund
if not exist dist echo Building backend... & call npm run build
start "RelayOps API :4000" cmd /k "node dist/index.js"
cd /d "%~dp0frontend"
if not exist node_modules echo Installing frontend dependencies... & call npm install --no-audit --no-fund
start "RelayOps Web :5173" cmd /k "npm run dev"
echo.
echo RelayOps is starting:
echo   App: http://localhost:5173   (login: admin@relayops.io / password123)
echo   API: http://localhost:4000
echo Two new windows opened — leave them running while you use the app.
pause
