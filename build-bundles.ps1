# Builds self-contained landing page bundles under landing-pages/
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$out = $PSScriptRoot
$imgRoot = Join-Path $root "img"

function Copy-IfExists($src, $dest) {
    if (Test-Path $src) {
        $dir = Split-Path $dest -Parent
        if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
        Copy-Item $src $dest -Force
    }
}

function Read-Utf8($path) {
    return [System.IO.File]::ReadAllText($path, [System.Text.UTF8Encoding]::new($false))
}

function Write-BundleHtml($content, $dest) {
    $dir = Split-Path $dest -Parent
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    [System.IO.File]::WriteAllText($dest, $content, [System.Text.UTF8Encoding]::new($false))
}

# Ensure assets
@("moka-pro-max","moka","saqr","projectors") | ForEach-Object {
    $cssDir = Join-Path $out "$_\css"
    if (-not (Test-Path $cssDir)) { New-Item -ItemType Directory -Force -Path $cssDir | Out-Null }
    Copy-IfExists (Join-Path $root "css\style.css") (Join-Path $cssDir "style.css")
    Copy-IfExists (Join-Path $root "css\brand.css") (Join-Path $cssDir "brand.css")
    Copy-IfExists (Join-Path $out "css\desktop-landing.css") (Join-Path $cssDir "desktop-landing.css")
    $jsDir = Join-Path $out "$_\js"
    if (-not (Test-Path $jsDir)) { New-Item -ItemType Directory -Force -Path $jsDir | Out-Null }
    Copy-IfExists (Join-Path $out "js\orders-sheet.js") (Join-Path $jsDir "orders-sheet.js")
    @("scroll-reveal.js", "gsap-hero.js", "faq-accordion.js", "phone-ma.js", "load-orders-backend.js", "orders-firebase.js", "orders-backend.js", "firebase-config.js") | ForEach-Object {
        Copy-IfExists (Join-Path $root "js\$_") (Join-Path $jsDir $_)
    }
}

$saqrImg = Join-Path $out "saqr\images"
if (-not (Test-Path $saqrImg)) { New-Item -ItemType Directory -Force -Path $saqrImg | Out-Null }
Copy-Item (Join-Path $imgRoot "saqr\*") $saqrImg -Force -ErrorAction SilentlyContinue
Copy-IfExists (Join-Path $imgRoot "logo.svg") (Join-Path $saqrImg "logo.svg")
Copy-IfExists (Join-Path $imgRoot "whatsapp.png") (Join-Path $saqrImg "whatsapp.png")

$projImg = Join-Path $out "projectors\images"
if (-not (Test-Path $projImg)) { New-Item -ItemType Directory -Force -Path $projImg | Out-Null }
Copy-IfExists (Join-Path $imgRoot "Projector-Video.mp4") (Join-Path $projImg "Projector-Video.mp4")
Copy-IfExists (Join-Path $imgRoot "logo.svg") (Join-Path $projImg "logo.svg")
Copy-IfExists (Join-Path $imgRoot "whatsapp.png") (Join-Path $projImg "whatsapp.png")
Copy-IfExists (Join-Path $imgRoot "projectors\README.txt") (Join-Path $projImg "README.txt")

# --- Moka Pro Max ---
$html = Read-Utf8 (Join-Path $root "moka-pro-max\index.html")
$html = $html -replace 'href="/css/style\.css"', 'href="css/style.css"'
$html = $html -replace 'href="/img/', 'href="images/'
$html = $html -replace 'src="/img/', 'src="images/'
$html = $html -replace 'srcset="/img/', 'srcset="images/'
$html = $html -replace 'const redirectUrl = `/thank-you/', 'const redirectUrl = `thank-you/'
Write-BundleHtml $html (Join-Path $out "moka-pro-max\index.html")

$ty = Read-Utf8 (Join-Path $root "thank-you\index.html")$ty = $ty -replace '/css/style\.css', '../css/style.css'
$ty = $ty -replace '/img/saqr/', '../images/'
$ty = $ty -replace '/img/projectors/', '../images/'
$ty = $ty -replace '/img/MOKA\.jpg', '../images/MOKA.jpg'
$ty = $ty -replace '/img/', '../images/'
$ty = $ty -replace "back: '/saqr/'", "back: '../index.html'"
$ty = $ty -replace "back: '/moka-pro-max/'", "back: '../index.html'"
$ty = $ty -replace "back: '/projectors/'", "back: '../index.html'"
Write-BundleHtml $ty (Join-Path $out "moka-pro-max\thank-you\index.html")

$redir = Read-Utf8 (Join-Path $root "MOKA-PRO-MAX.html")$redir = $redir -replace '/moka-pro-max/', 'index.html'
Write-BundleHtml $redir (Join-Path $out "moka-pro-max\redirect.html")

# --- Moka ---
$html = Read-Utf8 (Join-Path $root "moka\index.html")$html = $html -replace '\.\./css/style\.css', 'css/style.css'
$html = $html -replace '\.\./img/moka/', 'images/'
$html = $html -replace '\.\./img/', 'images/'
$html = $html -replace '/moka/thank-you/', 'thank-you/'
Write-BundleHtml $html (Join-Path $out "moka\index.html")

$ty = Read-Utf8 (Join-Path $root "moka\thank-you\index.html")$ty = $ty -replace '\.\./\.\./css/style\.css', '../css/style.css'
$ty = $ty -replace '\.\./\.\./img/', '../images/'
Write-BundleHtml $ty (Join-Path $out "moka\thank-you\index.html")

$redir = Read-Utf8 (Join-Path $root "moka.html")$redir = $redir -replace '/moka/', 'index.html'
Write-BundleHtml $redir (Join-Path $out "moka\redirect.html")

# --- Saqr ---
$html = Read-Utf8 (Join-Path $root "saqr\index.html")$html = $html -replace '\.\./css/style\.css', 'css/style.css'
$html = $html -replace '\.\./img/saqr/', 'images/'
$html = $html -replace '\.\./img/', 'images/'
$html = $html -replace '/thank-you/', 'thank-you/'
Write-BundleHtml $html (Join-Path $out "saqr\index.html")

$ty = Read-Utf8 (Join-Path $root "thank-you\index.html")$ty = $ty -replace '/css/style\.css', '../css/style.css'
$ty = $ty -replace '/img/saqr/Saqr\.jpeg', '../images/Saqr.jpeg'
$ty = $ty -replace '/img/saqr/', '../images/'
$ty = $ty -replace '/img/MOKA\.jpg', '../images/MOKA.jpg'
$ty = $ty -replace '/img/projectors/', '../images/'
$ty = $ty -replace '/img/', '../images/'
$ty = $ty -replace "back: '/saqr/'", "back: '../index.html'"
$ty = $ty -replace "back: '/moka-pro-max/'", "back: '../index.html'"
$ty = $ty -replace "back: '/projectors/'", "back: '../index.html'"
$ty = $ty -replace "thumb: '/img/saqr/Saqr\.jpeg'", "thumb: '../images/Saqr.jpeg'"
Write-BundleHtml $ty (Join-Path $out "saqr\thank-you\index.html")

$redir = Read-Utf8 (Join-Path $root "saqr.html")$redir = $redir -replace '/saqr/', 'index.html'
Write-BundleHtml $redir (Join-Path $out "saqr\redirect.html")

# --- Projectors ---
$html = Read-Utf8 (Join-Path $root "projectors\index.html")$html = $html -replace '\.\./css/style\.css', 'css/style.css'
$html = $html -replace '\.\./img/projectors/', 'images/'
$html = $html -replace '\.\./img/Projector-Video\.mp4', 'images/Projector-Video.mp4'
$html = $html -replace '\.\./img/', 'images/'
$html = $html -replace "href=`"/`"", 'href="index.html"'
$html = $html -replace '/projectors/thank-you/', 'thank-you/'
Write-BundleHtml $html (Join-Path $out "projectors\index.html")

$ty = Read-Utf8 (Join-Path $root "projectors\thank-you\index.html")$ty = $ty -replace '\.\./\.\./css/style\.css', '../css/style.css'
$ty = $ty -replace '\.\./\.\./img/projectors/', '../images/'
$ty = $ty -replace '\.\./\.\./img/', '../images/'
Write-BundleHtml $ty (Join-Path $out "projectors\thank-you\index.html")

$redir = Read-Utf8 (Join-Path $root "projectors.html")$redir = $redir -replace '/projectors/', 'index.html'
Write-BundleHtml $redir (Join-Path $out "projectors\redirect.html")

Write-Host "Bundles built under $out"
