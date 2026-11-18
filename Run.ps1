$ErrorActionPreference = 'Stop'
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$portableNode = Join-Path $PSScriptRoot '.runtime/node/node-v22.23.5-win-x64/node.exe'
if (Test-Path -LiteralPath $portableNode) { $nodeExe = $portableNode }
elseif ($nodeCommand) { $nodeExe = $nodeCommand.Source }
else { throw 'Run Setup.ps1 first.' }
& $nodeExe (Join-Path $PSScriptRoot 'cli.mjs') @args
exit $LASTEXITCODE
