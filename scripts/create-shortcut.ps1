$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$desktop = [Environment]::GetFolderPath("Desktop")
$shortcutPath = Join-Path $desktop "PulseCord.lnk"
$legacyShortcutPath = Join-Path $desktop "PulseCord Dev.lnk"
$application = Join-Path $repoRoot "outputs\win-unpacked\pulsecord.exe"
$icon = Join-Path $repoRoot "build\icon.ico"

if (-not (Test-Path -LiteralPath $application)) {
    throw "PulseCord development application was not found. Run 'npm run package:dir' before creating the shortcut."
}

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $application
$shortcut.Arguments = ""
$shortcut.WorkingDirectory = $repoRoot
$shortcut.IconLocation = "$icon,0"
$shortcut.Description = "Open PulseCord"
$shortcut.Save()

if (Test-Path -LiteralPath $legacyShortcutPath) {
    Remove-Item -LiteralPath $legacyShortcutPath -Force
}

Write-Output $shortcutPath
