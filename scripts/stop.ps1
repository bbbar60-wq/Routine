<#
  Stops whatever Routine has running — the production server, the dev pair, or
  both. Safe to run when nothing is up.

  Killing only what holds the port is not enough: dev mode runs under
  supervisors (`node --watch`, scripts/dev.mjs) that immediately respawn the
  server. So this finds the roots, then kills their whole process tree.
#>
$ErrorActionPreference = 'SilentlyContinue'

$root = Split-Path -Parent $PSScriptRoot
$all = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue)

if (-not $all) {
  Write-Host ''
  Write-Host '  Routine was not running.' -ForegroundColor DarkGray
  Write-Host ''
  Start-Sleep -Milliseconds 900
  return
}

# --- seeds: anything holding our ports, plus anything launched from this project
$seeds = New-Object System.Collections.Generic.HashSet[int]

foreach ($port in 5180, 5181) {
  foreach ($c in Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
    if ($all.ProcessId -contains $c.OwningProcess) { [void]$seeds.Add([int]$c.OwningProcess) }
  }
}

# Match on this project's own entry points so a node process from some other
# project is never touched.
$markers = @(
  [regex]::Escape($root)
  'server[\\/]index\.mjs'
  'scripts[\\/]dev\.mjs'
)
foreach ($p in $all) {
  if (-not $p.CommandLine) { continue }
  foreach ($m in $markers) {
    if ($p.CommandLine -match $m) { [void]$seeds.Add([int]$p.ProcessId); break }
  }
}

if ($seeds.Count -eq 0) {
  Write-Host ''
  Write-Host '  Routine was not running.' -ForegroundColor DarkGray
  Write-Host ''
  Start-Sleep -Milliseconds 900
  return
}

# --- expand to every descendant, so supervisors cannot respawn a child
$byParent = @{}
foreach ($p in $all) {
  $key = [int]$p.ParentProcessId
  if (-not $byParent.ContainsKey($key)) { $byParent[$key] = @() }
  $byParent[$key] += [int]$p.ProcessId
}

$doomed = New-Object System.Collections.Generic.HashSet[int]
$queue = [System.Collections.Queue]::new()
foreach ($s in $seeds) { $queue.Enqueue($s) }

while ($queue.Count -gt 0) {
  $pid_ = [int]$queue.Dequeue()
  if (-not $doomed.Add($pid_)) { continue }
  if ($byParent.ContainsKey($pid_)) {
    foreach ($child in $byParent[$pid_]) { $queue.Enqueue($child) }
  }
}

# Kill children before their parents, so nothing gets a chance to restart.
$ordered = $doomed | Sort-Object { if ($seeds.Contains($_)) { 1 } else { 0 } }

$stopped = 0
foreach ($id in $ordered) {
  if (Get-Process -Id $id -ErrorAction SilentlyContinue) {
    Stop-Process -Id $id -Force -ErrorAction SilentlyContinue
    $stopped++
  }
}

Start-Sleep -Milliseconds 500
$leftover = @(Get-NetTCPConnection -LocalPort 5180, 5181 -State Listen -ErrorAction SilentlyContinue)

Write-Host ''
if ($leftover.Count -gt 0) {
  Write-Host "  Stopped $stopped process(es), but something is still on the port." -ForegroundColor Yellow
} else {
  Write-Host "  Routine stopped ($stopped process$(if ($stopped -ne 1) { 'es' }))." -ForegroundColor Green
}
Write-Host ''
Start-Sleep -Milliseconds 900
