param([switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
$repoRoot = $PSScriptRoot
$runtimeRoot = Join-Path $repoRoot '.runtime'
$nodeVersion = '22.23.5'
$nodeDir = Join-Path $runtimeRoot "node/node-v$nodeVersion-win-x64"
$nodeExe = Join-Path $nodeDir 'node.exe'
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if ($nodeCmd) {
    $major = (& $nodeCmd.Source -p 'process.versions.node.split(".")[0]')
    $candidateDir = Split-Path -Parent $nodeCmd.Source
    $candidateNpm = Join-Path $candidateDir 'node_modules/npm/bin/npm-cli.js'
    if ([int]$major -ge 22 -and ((Test-Path -LiteralPath $candidateNpm) -or (Get-Command npm -ErrorAction SilentlyContinue))) {
        $nodeExe = $nodeCmd.Source
        $nodeDir = $candidateDir
    }
}
if (-not (Test-Path -LiteralPath $nodeExe)) {
    if ($CheckOnly) { throw 'Node 22+ missing. Run Setup.ps1 without -CheckOnly.' }
    if ($env:PROCESSOR_ARCHITECTURE -ne 'AMD64') { throw 'Automatic portable Node setup supports Windows x64. Install Node 22+ for your architecture first.' }
    New-Item -ItemType Directory -Force -Path (Join-Path $runtimeRoot 'node') | Out-Null
    $archiveName = "node-v$nodeVersion-win-x64.zip"
    $archive = Join-Path $runtimeRoot $archiveName
    $base = "https://nodejs.org/dist/v$nodeVersion/"
    Write-Host 'Downloading portable Node from nodejs.org into this project...'
    $checksums = (Invoke-WebRequest -Uri ($base+'SHASUMS256.txt') -UseBasicParsing -TimeoutSec 60).Content
    $checksumRow = $checksums -split "`n" | Where-Object { $_.Trim().EndsWith($archiveName) } | Select-Object -First 1
    if (-not $checksumRow) { throw 'Official checksum entry not found; nothing executed.' }
    $expected = ($checksumRow.Trim() -split '\s+')[0]
    Invoke-WebRequest -Uri ($base+$archiveName) -OutFile $archive -UseBasicParsing -TimeoutSec 300
    if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected.ToLowerInvariant()) { throw 'Node download checksum mismatch; nothing executed.' }
    Expand-Archive -LiteralPath $archive -DestinationPath (Join-Path $runtimeRoot 'node') -Force
}
$env:PATH = $nodeDir + [IO.Path]::PathSeparator + $env:PATH
$env:npm_config_cache = Join-Path $runtimeRoot 'npm-cache'
$env:TEMP = $env:TMP = Join-Path $runtimeRoot 'temp'
New-Item -ItemType Directory -Force -Path $env:TEMP | Out-Null
$npmCli = Join-Path $nodeDir 'node_modules/npm/bin/npm-cli.js'
if (-not (Test-Path -LiteralPath $npmCli)) {
    $npmCmd = Get-Command npm -ErrorAction SilentlyContinue
    if (-not $npmCmd) { throw 'Node exists but npm is missing. Install a complete Node 22+ distribution.' }
}
Push-Location $repoRoot
try {
    if (-not $CheckOnly) {
        $existingFfmpeg = Get-Command ffmpeg -ErrorAction SilentlyContinue
        if ($existingFfmpeg) { $env:FFMPEG_BIN = $existingFfmpeg.Source }
        if (Test-Path -LiteralPath $npmCli) { & $nodeExe $npmCli ci --no-audit --no-fund } else { & $npmCmd.Source ci --no-audit --no-fund }
        if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed. Check registry/GitHub connectivity and rerun Setup.ps1; no completed installation is claimed.' }
    }
    & $nodeExe (Join-Path $repoRoot 'cli.mjs') doctor
    if ($LASTEXITCODE -ne 0) { throw 'Dependency doctor failed.' }
} finally { Pop-Location }
Write-Host 'Ready. Run: .\Run.ps1 demo'
