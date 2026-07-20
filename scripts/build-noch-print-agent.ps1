$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$sourceDir = Join-Path $repoRoot 'apps\pos\public\noch-print-agent'
$sourceCode = Join-Path $PSScriptRoot 'noch-print-agent-installer.cs'
$agentScript = Join-Path $sourceDir 'Noch-PrintAgent.ps1'
$installScript = Join-Path $sourceDir 'Install-NochPrintAgent.ps1'
$outputPath = Join-Path $sourceDir 'Noch-Bloom-Printer-Setup.exe'

$compilerCandidates = @(
  (Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'),
  (Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe')
)
$compiler = $compilerCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $compiler) {
  throw '.NET Framework C# compiler was not found on this Windows PC.'
}

foreach ($path in @($sourceCode, $agentScript, $installScript)) {
  if (-not (Test-Path -LiteralPath $path)) { throw "Missing installer source: $path" }
}

Remove-Item -LiteralPath $outputPath -Force -ErrorAction SilentlyContinue
$compilerArgs = @(
  '/nologo',
  '/target:winexe',
  '/optimize+',
  "/out:$outputPath",
  '/reference:System.dll',
  '/reference:System.Windows.Forms.dll',
  "/resource:$agentScript,NochPrintAgent.ps1",
  "/resource:$installScript,InstallNochPrintAgent.ps1",
  $sourceCode
)

& $compiler @compilerArgs
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $outputPath)) {
  throw "C# compiler did not create the installer (exit code $LASTEXITCODE)."
}

$size = (Get-Item -LiteralPath $outputPath).Length
Write-Host "Created $outputPath ($size bytes)"
