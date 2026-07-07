$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "`n  Opuscule v2 - Demarrage..." -ForegroundColor Cyan

function Install-IfNeeded {
  param(
    [string]$Path,
    [string]$Label,
    [string]$RequiredModule
  )

  $modulesPath = Join-Path $Path 'node_modules'
  $requiredPath = if ($RequiredModule) { Join-Path $modulesPath $RequiredModule } else { $modulesPath }
  $packageJson = Join-Path $Path 'package.json'
  $installMarker = Join-Path $modulesPath '.package-lock.json'

  $needsInstall = -not (Test-Path $requiredPath)
  if (-not $needsInstall -and (Test-Path $packageJson) -and (Test-Path $installMarker)) {
    $needsInstall = (Get-Item $packageJson).LastWriteTimeUtc -gt (Get-Item $installMarker).LastWriteTimeUtc
  }

  if ($needsInstall) {
    Write-Host "  Installation des dependances $Label..." -ForegroundColor Yellow
    Push-Location $Path
    npm install
    Pop-Location
  }
}

Install-IfNeeded -Path "$root\server" -Label "serveur" -RequiredModule "better-sqlite3"
Install-IfNeeded -Path "$root\client" -Label "client" -RequiredModule "vite"

Write-Host "  Serveur    : http://localhost:3001" -ForegroundColor Green
Write-Host "  Appli      : http://localhost:5173" -ForegroundColor Green
Write-Host "  (Ctrl+C pour arreter)`n" -ForegroundColor Gray

$serverJob = Start-Job -ScriptBlock {
  param($p)
  Set-Location "$p\server"
  node index.js
} -ArgumentList $root

Push-Location "$root\client"
try {
  npm run dev
} finally {
  Stop-Job $serverJob
  Remove-Job $serverJob -Force
  Pop-Location
}
