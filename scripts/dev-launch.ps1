$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$workDir = Join-Path $repoRoot "work"
$logFile = Join-Path $workDir "dev-launch.log"

New-Item -ItemType Directory -Path $workDir -Force | Out-Null
Set-Location $repoRoot

try {
    "[$(Get-Date -Format o)] Starting PulseCord development build" | Set-Content $logFile

    $bunCommand = Get-Command bun -ErrorAction SilentlyContinue
    if (-not $bunCommand) {
        $bunCommand = Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Filter bun.exe -Recurse -ErrorAction SilentlyContinue |
            Select-Object -First 1
    }
    if (-not $bunCommand) { throw "Bun was not found. Install Bun 1.3 or newer before launching PulseCord." }

    $bunPath = if ($bunCommand.Source) { $bunCommand.Source } else { $bunCommand.FullName }
    $env:Path = "$(Split-Path $bunPath);$env:Path"

    if (-not (Test-Path (Join-Path $repoRoot "node_modules"))) {
        & npm ci --ignore-scripts --legacy-peer-deps *>> $logFile
        if ($LASTEXITCODE -ne 0) { throw "Dependency installation failed with exit code $LASTEXITCODE." }

        & node node_modules/electron/install.js *>> $logFile
        if ($LASTEXITCODE -ne 0) { throw "Electron installation failed with exit code $LASTEXITCODE." }

        & $bunPath scripts/build/compileArrpc.mts *>> $logFile
        if ($LASTEXITCODE -ne 0) { throw "Rich Presence compilation failed with exit code $LASTEXITCODE." }
    }

    & $bunPath run start *>> $logFile
    if ($LASTEXITCODE -ne 0) { throw "PulseCord exited with code $LASTEXITCODE." }
} catch {
    $_ | Out-String | Add-Content $logFile
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show(
        "PulseCord could not start. Details were saved to:`n$logFile",
        "PulseCord development build",
        "OK",
        "Error"
    ) | Out-Null
    exit 1
}
