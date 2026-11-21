# Installs the D20 Adventures desktop app on Windows. Macs and Linux use install.sh.
# Usage, in PowerShell: irm https://d20adventures.com/install.ps1 | iex
# Source: https://github.com/johnpolacek/d20adventures.com/blob/main/public/install.ps1
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

if ($env:PROCESSOR_ARCHITECTURE -ne "AMD64") {
  Write-Error "D20 Adventures has no build for Windows on $env:PROCESSOR_ARCHITECTURE yet."
  return
}

# The app runs its Game Master on Node.js 24 or newer.
$nodeMajor = 0
try { $nodeMajor = [int](node -p 'process.versions.node.split(".")[0]') } catch {}
if ($nodeMajor -lt 24) {
  Write-Warning "The app needs Node.js 24 or newer. Get it at https://nodejs.org"
}

$asset = "D20-Adventures-windows-x64-setup.exe"
$url = "https://github.com/johnpolacek/d20adventures.com/releases/latest/download/$asset"
$setup = Join-Path ([System.IO.Path]::GetTempPath()) $asset

Write-Host "Downloading D20 Adventures..."
try {
  Invoke-WebRequest -Uri $url -OutFile $setup -UseBasicParsing
} catch {
  Write-Error "The latest release has no $asset yet. Try again in a few minutes."
  return
}

Get-Process "D20 Adventures" -ErrorAction SilentlyContinue | Stop-Process -Force
# The installer runs silently and installs for this user only.
Start-Process -FilePath $setup -ArgumentList "/S" -Wait
Remove-Item $setup -Force

$exe = Join-Path $env:LOCALAPPDATA "D20 Adventures\D20 Adventures.exe"
if (Test-Path $exe) {
  Write-Host "Installed to $exe"
  Start-Process $exe
} else {
  Write-Host "Installed. Open D20 Adventures from the Start menu."
}
