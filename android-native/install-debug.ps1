$ErrorActionPreference = 'Stop'

$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
& (Join-Path $projectDir 'build-debug.ps1')

$sdkCandidates = @(
  $env:ANDROID_HOME,
  $env:ANDROID_SDK_ROOT,
  (Join-Path $env:LOCALAPPDATA 'Android\Sdk')
) | Where-Object { $_ -and (Test-Path $_) }
$sdk = $sdkCandidates | Select-Object -First 1
$adb = Join-Path $sdk 'platform-tools\adb.exe'
if (-not (Test-Path $adb)) {
  throw 'ADB est introuvable. Installe Android SDK Platform-Tools depuis le SDK Manager.'
}

& $adb start-server
$devices = & $adb devices
$connected = @($devices | Select-Object -Skip 1 | Where-Object { $_ -match "\tdevice$" })
if ($connected.Count -eq 0) {
  throw 'Aucun téléphone autorisé. Active le débogage USB, branche-le et accepte la clé RSA affichée sur Android.'
}

$apk = Join-Path $projectDir 'app\build\outputs\apk\debug\app-debug.apk'
& $adb install -r $apk
if ($LASTEXITCODE -ne 0) { throw "L'installation ADB a échoué ($LASTEXITCODE)." }
Write-Host 'Opuscule est installé sur le téléphone.' -ForegroundColor Green
