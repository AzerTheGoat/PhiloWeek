# PhiloWeek — script de lancement
# Usage : .\run.ps1

Write-Host ""
Write-Host "  PhiloWeek" -ForegroundColor Cyan
Write-Host "  http://localhost:8000" -ForegroundColor Cyan
Write-Host "  Ctrl+C pour arreter" -ForegroundColor DarkGray
Write-Host ""

& "$PSScriptRoot\.venv\Scripts\uvicorn.exe" main:app --reload --port 8000
