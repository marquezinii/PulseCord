$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$desktop = [Environment]::GetFolderPath("Desktop")
$shortcutPath = Join-Path $desktop "PulseCord Dev.lnk"
$launcher = Join-Path $PSScriptRoot "dev-launch.ps1"
$icon = Join-Path $repoRoot "build\icon.ico"

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$launcher`""
$shortcut.WorkingDirectory = $repoRoot
$shortcut.IconLocation = "$icon,0"
$shortcut.Description = "Build and open the latest PulseCord development version"
$shortcut.Save()

Write-Output $shortcutPath
