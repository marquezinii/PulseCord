$ErrorActionPreference = "Continue"

$repoRoot = Split-Path -Parent $PSScriptRoot
$workDir = Join-Path $repoRoot "work"
$logFile = Join-Path $workDir "dev-launch.log"
$stdoutLog = Join-Path $workDir "dev-launch.stdout.log"
$stderrLog = Join-Path $workDir "dev-launch.stderr.log"
$dependencyMarker = Join-Path $repoRoot "node_modules\.pulsecord-ready"

New-Item -ItemType Directory -Path $workDir -Force | Out-Null
Set-Location $repoRoot

try {
    "[$(Get-Date -Format o)] Starting latest PulseCord workspace" | Set-Content $logFile

    $node = Get-Command node -ErrorAction Stop
    $npm = Get-Command npm.cmd -ErrorAction Stop
    "Node: $($node.Source)" | Add-Content $logFile

    $needsInstall = -not (Test-Path (Join-Path $repoRoot "node_modules\electron\package.json")) -or -not (Test-Path $dependencyMarker)
    if (-not $needsInstall) {
        $markerTime = (Get-Item $dependencyMarker).LastWriteTimeUtc
        $needsInstall = (Get-Item (Join-Path $repoRoot "package.json")).LastWriteTimeUtc -gt $markerTime -or
            (Get-Item (Join-Path $repoRoot "package-lock.json")).LastWriteTimeUtc -gt $markerTime
    }

    if ($needsInstall) {
        "Installing the clean-room dependency set" | Add-Content $logFile
        & $npm.Source ci *>> $logFile
        if ($LASTEXITCODE -ne 0) { throw "Dependency installation failed with exit code $LASTEXITCODE." }
        New-Item -ItemType File -Path $dependencyMarker -Force | Out-Null
    }

    $pulseCord = Start-Process -FilePath $npm.Source -ArgumentList "start" -WorkingDirectory $repoRoot -PassThru `
        -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog
    $electronPath = (Resolve-Path (Join-Path $repoRoot "node_modules\electron\dist\electron.exe")).Path
    $startupDeadline = (Get-Date).AddSeconds(90)
    $visibleWindow = $null

    do {
        Start-Sleep -Milliseconds 250
        $pulseCord.Refresh()
        $visibleWindow = Get-Process electron -ErrorAction SilentlyContinue |
            Where-Object { $_.Path -eq $electronPath -and $_.MainWindowTitle -eq "PulseCord" } |
            Select-Object -First 1
    } while (-not $visibleWindow -and -not $pulseCord.HasExited -and (Get-Date) -lt $startupDeadline)

    if (-not $visibleWindow) {
        if ($pulseCord.HasExited) {
            throw "PulseCord did not open a window. Launcher exit code: $($pulseCord.ExitCode)."
        }
        throw "PulseCord did not open a visible window within 90 seconds."
    }

    "PulseCord window opened (PID $($visibleWindow.Id))" | Add-Content $logFile
    $pulseCord.WaitForExit()
    "PulseCord session ended after a successful launch" | Add-Content $logFile
} catch {
    $_ | Out-String | Add-Content $logFile
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show(
        "PulseCord could not start. Details were saved in:`n$workDir",
        "PulseCord development build",
        "OK",
        "Error"
    ) | Out-Null
    exit 1
}
