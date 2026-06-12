# Local static file server (no Python/Node required)
param(
    [int]$Port = 8765,
    [string]$Root = (Split-Path $PSScriptRoot -Parent)
)

$mime = @{
    '.html' = 'text/html; charset=utf-8'
    '.css'  = 'text/css; charset=utf-8'
    '.js'   = 'application/javascript; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'
    '.svg'  = 'image/svg+xml'
    '.png'  = 'image/png'
    '.jpg'  = 'image/jpeg'
    '.jpeg' = 'image/jpeg'
    '.webp' = 'image/webp'
    '.gif'  = 'image/gif'
    '.mp4'  = 'video/mp4'
    '.ico'  = 'image/x-icon'
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://127.0.0.1:$Port/")
$listener.Start()
Write-Host "Serving $Root at http://127.0.0.1:$Port/ (Ctrl+C to stop)"

while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    try {
        $path = $ctx.Request.Url.LocalPath.TrimStart('/')
        $path = [uri]::UnescapeDataString($path)
        if ([string]::IsNullOrWhiteSpace($path)) { $path = 'index.html' }
        $file = [IO.Path]::GetFullPath((Join-Path $Root ($path -replace '/', '\')))
        $rootFull = [IO.Path]::GetFullPath($Root)
        if (-not $file.StartsWith($rootFull, [StringComparison]::OrdinalIgnoreCase)) {
            $ctx.Response.StatusCode = 403
            continue
        }
        if (-not (Test-Path $file -PathType Leaf)) {
            $ctx.Response.StatusCode = 404
            continue
        }
        $ext = [IO.Path]::GetExtension($file).ToLower()
        if ($mime.ContainsKey($ext)) { $ctx.Response.ContentType = $mime[$ext] }
        $bytes = [IO.File]::ReadAllBytes($file)
        $ctx.Response.ContentLength64 = $bytes.Length
        $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } finally {
        $ctx.Response.Close()
    }
}
