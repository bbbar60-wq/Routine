<#
  Creates the desktop shortcuts. Run once, after cloning:

      powershell -ExecutionPolicy Bypass -File scripts\install-shortcuts.ps1

  Re-running is harmless — it overwrites the existing shortcuts in place.
  Pass -Remove to delete them again.
#>
param(
  [switch]$Remove,
  [switch]$NoDevShortcut,
  [switch]$StartMenu
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$scripts = Join-Path $root 'scripts'
$icon = Join-Path $root 'assets\routine.ico'

$desktop = [Environment]::GetFolderPath('Desktop')
$shell = New-Object -ComObject WScript.Shell

$targets = @(
  @{ Name = 'Routine'; Path = $desktop }
  @{ Name = 'Routine (Dev)'; Path = $desktop }
  @{ Name = 'Stop Routine'; Path = $desktop }
)
if ($StartMenu) {
  $sm = Join-Path ([Environment]::GetFolderPath('Programs')) 'Routine'
  $targets += @(
    @{ Name = 'Routine'; Path = $sm }
    @{ Name = 'Stop Routine'; Path = $sm }
  )
}

# ------------------------------------------------------------- remove
if ($Remove) {
  foreach ($t in $targets) {
    $lnk = Join-Path $t.Path "$($t.Name).lnk"
    if (Test-Path $lnk) { Remove-Item $lnk -Force; Write-Host "  removed  $lnk" -ForegroundColor DarkGray }
  }
  Write-Host ''
  Write-Host '  Shortcuts removed.' -ForegroundColor Green
  Write-Host ''
  return
}

# ------------------------------------------------------------- checks
if (-not (Test-Path $icon)) {
  Write-Host '  Icon missing — generating it...' -ForegroundColor Yellow
  $py = (Get-Command python -ErrorAction SilentlyContinue).Source
  if ($py) {
    & $py (Join-Path $scripts 'make-icon.py') | Out-Null
  }
}
$iconArg = if (Test-Path $icon) { "$icon,0" } else { "$env:SystemRoot\System32\shell32.dll,13" }

function New-Shortcut {
  param($Folder, $Name, $Target, $Arguments, $Description)

  if (-not (Test-Path $Folder)) { New-Item -ItemType Directory -Path $Folder -Force | Out-Null }
  $path = Join-Path $Folder "$Name.lnk"

  $sc = $shell.CreateShortcut($path)
  $sc.TargetPath = $Target
  $sc.Arguments = $Arguments
  $sc.WorkingDirectory = $root
  $sc.IconLocation = $iconArg
  $sc.Description = $Description
  $sc.WindowStyle = 7          # minimised, so nothing flashes on click
  $sc.Save()

  Write-Host "  created  $path" -ForegroundColor Gray
}

Write-Host ''
Write-Host '  Installing Routine shortcuts' -ForegroundColor White
Write-Host ''

$folders = @($desktop)
if ($StartMenu) { $folders += (Join-Path ([Environment]::GetFolderPath('Programs')) 'Routine') }

foreach ($folder in $folders) {
  # The main one goes through wscript so no console window ever appears.
  New-Shortcut -Folder $folder -Name 'Routine' `
    -Target "$env:SystemRoot\System32\wscript.exe" `
    -Arguments "`"$(Join-Path $scripts 'Routine.vbs')`"" `
    -Description 'Open Routine — starts the server if it is not already running'

  New-Shortcut -Folder $folder -Name 'Stop Routine' `
    -Target "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" `
    -Arguments "-NoProfile -ExecutionPolicy Bypass -File `"$(Join-Path $scripts 'stop.ps1')`"" `
    -Description 'Stop the Routine server'
}

if (-not $NoDevShortcut) {
  New-Shortcut -Folder $desktop -Name 'Routine (Dev)' `
    -Target "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" `
    -Arguments "-NoProfile -ExecutionPolicy Bypass -File `"$(Join-Path $scripts 'launch.ps1')`" -Mode dev" `
    -Description 'Run Routine with hot reload and visible logs, for editing the code'
}

Write-Host ''
Write-Host '  Done. Double-click "Routine" on your desktop.' -ForegroundColor Green
Write-Host '  The first click installs and builds everything — that one takes a few minutes.' -ForegroundColor DarkGray
Write-Host ''
