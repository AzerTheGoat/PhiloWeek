$ErrorActionPreference = 'Stop'

$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$localJdk = Get-ChildItem -Directory -Path (Join-Path $projectDir '.toolchain\jdk17') -ErrorAction SilentlyContinue |
  Where-Object { Test-Path (Join-Path $_.FullName 'bin\java.exe') } |
  Select-Object -First 1

$androidStudioJdk = 'C:\Program Files\Android\Android Studio\jbr'
if ($localJdk) {
  $env:JAVA_HOME = $localJdk.FullName
} elseif (Test-Path (Join-Path $androidStudioJdk 'bin\java.exe')) {
  $env:JAVA_HOME = $androidStudioJdk
}

if (-not $env:JAVA_HOME -or -not (Test-Path (Join-Path $env:JAVA_HOME 'bin\java.exe'))) {
  throw 'Java 17 est introuvable. Installe Android Studio ou un JDK 17.'
}
$env:Path = "$(Join-Path $env:JAVA_HOME 'bin');$env:Path"

$sdkCandidates = @(
  $env:ANDROID_HOME,
  $env:ANDROID_SDK_ROOT,
  (Join-Path $env:LOCALAPPDATA 'Android\Sdk')
) | Where-Object { $_ -and (Test-Path $_) }
$sdk = $sdkCandidates | Select-Object -First 1
if (-not $sdk) {
  throw 'SDK Android introuvable. Ouvre Android Studio > SDK Manager et installe Android SDK Platform 35.'
}

$escapedSdk = $sdk.Replace('\', '\\')
Set-Content -LiteralPath (Join-Path $projectDir 'local.properties') -Value "sdk.dir=$escapedSdk" -Encoding ascii

Push-Location $projectDir
try {
  & .\gradlew.bat assembleDebug
  if ($LASTEXITCODE -ne 0) { throw "La compilation Gradle a échoué ($LASTEXITCODE)." }
} finally {
  Pop-Location
}

$apk = Join-Path $projectDir 'app\build\outputs\apk\debug\app-debug.apk'
if (-not (Test-Path $apk)) { throw "APK attendu mais introuvable : $apk" }
Write-Host ''
Write-Host "APK prêt : $apk" -ForegroundColor Green
