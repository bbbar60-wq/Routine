<#
  Routine launcher.

  Does whatever is needed to get from "fresh clone" to "app open in the
  browser", then gets out of the way:

    install dependencies -> create the database -> build the UI ->
    start the server -> wait until it answers -> open the browser

  Every step is skipped when it is already done, so the normal case is just
  "start server, open browser" and takes about a second.

  Usage:  powershell -ExecutionPolicy Bypass -File launch.ps1 [-Mode prod|dev]
#>
param(
  [ValidateSet('prod', 'dev')]
  [string]$Mode = 'prod'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$ApiPort = 5181
$WebPort = 5180
# In production one process serves the UI and the API; in dev Vite fronts it.
$Port = if ($Mode -eq 'dev') { $WebPort } else { $ApiPort }
$Url = "http://127.0.0.1:$Port/"

function Say([string]$msg, [string]$colour = 'Gray') {
  Write-Host "  $msg" -ForegroundColor $colour
}

function Test-Port([int]$p) {
  $null -ne (Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue)
}

function Fail([string]$msg) {
  Write-Host ''
  Write-Host "  Routine could not start" -ForegroundColor Red
  Write-Host "  $msg" -ForegroundColor Red
  Write-Host ''
  Write-Host '  Press any key to close...' -ForegroundColor DarkGray
  try { $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown') } catch { Start-Sleep 20 }
  exit 1
}

Write-Host ''
Write-Host '  Routine' -ForegroundColor White
Write-Host "  $root" -ForegroundColor DarkGray
Write-Host ''

# ---------------------------------------------------------------- node
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) {
  Fail 'Node.js is not installed, or not on PATH. Install Node 22.5 or newer from https://nodejs.org and click the icon again.'
}
$nodeVersion = (& $node --version) -replace '^v', ''
$nodeMajor = [int]($nodeVersion -split '\.')[0]
$nodeMinor = [int]($nodeVersion -split '\.')[1]
# node:sqlite stops needing --experimental-sqlite at 22.13.
if ($nodeMajor -lt 22 -or ($nodeMajor -eq 22 -and $nodeMinor -lt 13)) {
  Fail "Routine needs Node 22.13 or newer for its built-in SQLite module. Found v$nodeVersion."
}

$npm = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source
if (-not $npm) { $npm = (Get-Command npm -ErrorAction SilentlyContinue).Source }
if (-not $npm) { Fail 'npm was not found next to Node.' }

# --------------------------------------------------- already running?
if (Test-Port $Port) {
  Say 'Already running - opening the browser.' 'DarkGray'
  Start-Process $Url
  exit 0
}

# ------------------------------------------------------- dependencies
if (-not (Test-Path (Join-Path $root 'node_modules\vite'))) {
  Say 'First run: installing dependencies. This takes a few minutes.' 'Yellow'
  Say 'You only wait for this once.' 'DarkGray'
  Write-Host ''
  & $npm install --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) {
    Fail 'npm install failed. Check your internet connection and try again.'
  }
  Write-Host ''
}

# ------------------------------------------------------------ database
if (-not (Test-Path (Join-Path $root 'data\routine.db'))) {
  Say 'Setting up the database...' 'Yellow'
  & $node --disable-warning=ExperimentalWarning (Join-Path $root 'server\seed.mjs')
  if ($LASTEXITCODE -ne 0) { Fail 'Could not create the database.' }
  Write-Host ''
}

# --------------------------------------------------------------- build
if ($Mode -eq 'prod') {
  $distIndex = Join-Path $root 'dist\index.html'
  $needsBuild = -not (Test-Path $distIndex)

  if (-not $needsBuild) {
    # Rebuild when any source file is newer than the built bundle.
    $watch = @(
      Get-ChildItem (Join-Path $root 'src') -Recurse -File -ErrorAction SilentlyContinue
      Get-ChildItem $root -File -Filter '*.ts' -ErrorAction SilentlyContinue
      Get-Item (Join-Path $root 'index.html') -ErrorAction SilentlyContinue
      Get-Item (Join-Path $root 'package.json') -ErrorAction SilentlyContinue
    ) | Where-Object { $_ }
    if ($watch) {
      $newest = ($watch | Measure-Object LastWriteTimeUtc -Maximum).Maximum
      $needsBuild = $newest -gt (Get-Item $distIndex).LastWriteTimeUtc
    }
  }

  if ($needsBuild) {
    Say 'Building the app...' 'Yellow'
    & $npm run build
    if ($LASTEXITCODE -ne 0) { Fail 'The build failed.' }
    Write-Host ''
  }
}

# --------------------------------------------------------------- start
Say "Starting Routine ($Mode)..." 'DarkGray'

if ($Mode -eq 'dev') {
  # Dev keeps its console: the point of dev mode is watching the logs.
  Start-Process -FilePath $node `
    -ArgumentList @((Join-Path $root 'scripts\dev.mjs')) `
    -WorkingDirectory $root
} else {
  # Child processes inherit this, which is all the server needs to switch
  # into production mode (CSP on, dist/ served).
  $env:NODE_ENV = 'production'
  Start-Process -FilePath $node `
    -ArgumentList @('--disable-warning=ExperimentalWarning', (Join-Path $root 'server\index.mjs')) `
    -WorkingDirectory $root -WindowStyle Hidden
}

# ------------------------------------------------ wait for it to answer
$timeout = if ($Mode -eq 'dev') { 90 } else { 45 }
$deadline = (Get-Date).AddSeconds($timeout)
$ready = $false
while ((Get-Date) -lt $deadline) {
  Start-Sleep -Milliseconds 400
  if (Test-Port $Port) {
    try {
      $null = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3
      $ready = $true
      break
    } catch {
      # Port is open but the server is still warming up.
    }
  }
}

if (-not $ready) {
  Fail "The server did not come up on port $Port in time. Try running 'npm run dev' in a terminal to see the error."
}

Say 'Ready.' 'Green'
Start-Process $Url

if ($Mode -eq 'dev') {
  Write-Host ''
  Say 'Dev servers are running in their own window. Close it to stop them.' 'DarkGray'
  Start-Sleep 3
}
