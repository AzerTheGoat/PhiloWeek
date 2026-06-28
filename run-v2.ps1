$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "`n  PhiloWeek v2 — Démarrage..." -ForegroundColor Cyan

# Install server deps if needed
if (-not (Test-Path "$root\server\node_modules")) {
  Write-Host "  Installation des dépendances serveur..." -ForegroundColor Yellow
  Push-Location "$root\server"
  npm install
  Pop-Location
}

# Install client deps if needed
if (-not (Test-Path "$root\client\node_modules")) {
  Write-Host "  Installation des dépendances client..." -ForegroundColor Yellow
  Push-Location "$root\client"
  npm install
  Pop-Location
}

Write-Host "  Serveur    : http://localhost:3001" -ForegroundColor Green
Write-Host "  Appli      : http://localhost:5173" -ForegroundColor Green
Write-Host "  (Ctrl+C pour arrêter)`n" -ForegroundColor Gray

# Start server in background
$serverJob = Start-Job -ScriptBlock {
  param($p)
  Set-Location "$p\server"
  node index.js
} -ArgumentList $root

# Start Vite dev server
Push-Location "$root\client"
try {
  npm run dev
} finally {
  Stop-Job $serverJob
  Remove-Job $serverJob -Force
  Pop-Location
}
