# Copy local js/firebase-config.js to all product js folders (for manual deploy / local test).
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$src = Join-Path $root 'js\firebase-config.js'
if (-not (Test-Path $src)) {
    Write-Error "Missing $src - copy firebase-config.example.js and fill in your Firebase keys."
}
$targets = @(
    'moka\js\firebase-config.js',
    'moka-pro-max\js\firebase-config.js',
    'saqr\js\firebase-config.js',
    'projectors\js\firebase-config.js'
)
foreach ($rel in $targets) {
    $dest = Join-Path $root $rel
    Copy-Item -Path $src -Destination $dest -Force
    Write-Host "Copied -> $rel"
}
