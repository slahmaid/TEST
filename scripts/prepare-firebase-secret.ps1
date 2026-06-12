# Opens your firebase-config.js and copies it to the clipboard for pasting into GitHub secret FIREBASE_CONFIG_JS.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$src = Join-Path $root 'js\firebase-config.js'
if (-not (Test-Path $src)) {
    Write-Error "Missing $src - copy firebase-config.example.js and fill in your Firebase keys first."
}
$content = Get-Content -Path $src -Raw -Encoding UTF8
Set-Clipboard -Value $content
Write-Host "Copied js/firebase-config.js to clipboard ($($content.Length) chars)."
Write-Host ""
Write-Host "In GitHub:"
Write-Host "  https://github.com/slahmaid/TEST/settings/secrets/actions"
Write-Host "  New repository secret"
Write-Host "  Name:  FIREBASE_CONFIG_JS"
Write-Host "  Value: Ctrl+V (paste from clipboard)"
Write-Host ""
Write-Host "Then: Actions -> Deploy Pages -> Run workflow"
