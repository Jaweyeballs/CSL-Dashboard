# Starts CSL Dashboard using system Node, or a portable Node under %LOCALAPPDATA%\csl-node
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Find-Node {
  $cmd = Get-Command node -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }

  $portable = Get-ChildItem "$env:LOCALAPPDATA\csl-node\node-v*-win-x64\node.exe" -ErrorAction SilentlyContinue |
    Sort-Object FullName -Descending |
    Select-Object -First 1
  if ($portable) { return $portable.FullName }

  return $null
}

$node = Find-Node
if (-not $node) {
  Write-Host "Node.js is not installed."
  Write-Host "Install from https://nodejs.org (LTS), then reopen this terminal."
  exit 1
}

$npmCmd = Join-Path (Split-Path $node) "npm.cmd"
Write-Host "Using Node: $node"
if (-not (Test-Path "$root\node_modules")) {
  Write-Host "Installing dependencies..."
  & $npmCmd install
}

& $node --watch "$root\server\index.js"
