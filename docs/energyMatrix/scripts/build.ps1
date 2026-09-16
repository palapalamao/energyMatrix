<#
.SYNOPSIS
  energyMatrix Pod 构建脚本（Windows PowerShell）。

.DESCRIPTION
  与 scripts/build.sh 等价：探测工具链与依赖 pod，必要时 npm install，
  再交给 `fan build.fan`（finBuild 会先在 ts/ 跑 npm run build，产物落 res/web/em/）。

  注意：必须用「运行中 FIN server 所用的那个安装」来编译，否则 pod 会落到
  另一个 fan.home 的 lib\fan\ 下，live server 永远不会加载它。

.PARAMETER SkipDepsCheck
  跳过依赖 pod 探测。
.PARAMETER Clean
  先删 ts\node_modules 与 res\web\em\ 旧产物。
.PARAMETER FantomOnly
  只编译 Fantom（临时移除 nodeDirs，不跑前端构建）。
#>
[CmdletBinding()]
param(
  [switch]$SkipDepsCheck,
  [switch]$Clean,
  [switch]$FantomOnly
)

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ExtDir    = Split-Path -Parent $ScriptDir
$TsDir     = Join-Path $ExtDir 'ts'

function Log  ($m) { Write-Host "[em-build] $m"       -ForegroundColor Cyan }
function Warn ($m) { Write-Host "[em-build] $m"       -ForegroundColor Yellow }
function Fail ($m, $code) { Write-Host "[em-build ERROR] $m" -ForegroundColor Red; exit $code }

# ---- Step 1: 工具链 ----
Log 'Probing toolchain'
if (-not (Get-Command fan -ErrorAction SilentlyContinue)) { Fail "'fan' not on PATH" 1 }
if (-not $FantomOnly) {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Fail "'node' not on PATH (need Node 18+)" 1 }
  if (-not (Get-Command npm  -ErrorAction SilentlyContinue)) { Fail "'npm' not on PATH" 1 }
}

$fanVersion = (& fan -version 2>&1) -join "`n"
$fanHome = ($fanVersion | Select-String -Pattern 'fan\.home:\s*(.+)').Matches.Groups[1].Value.Trim()
if (-not $fanHome) { $fanHome = Split-Path -Parent (Split-Path -Parent (Get-Command fan).Source) }
$libFan = Join-Path (Join-Path $fanHome 'lib') 'fan'
Log "FAN repo: $libFan"

# ---- Step 2: 依赖 pod ----
if (-not $SkipDepsCheck) {
  Log 'Checking required dependency pods'
  $required = @('finStackCoreExt','finEntityModelToolsExt','jobExt','hisExt','foliox')
  $missing = $required | Where-Object { -not (Test-Path (Join-Path $libFan "$_.pod")) }
  if ($missing) {
    Warn "Missing dependency pod(s) in ${libFan}:"
    $missing | ForEach-Object { Write-Host "    - $_.pod" }
    Fail 'Install them, or re-run with -SkipDepsCheck.' 2
  }
}

# ---- Step 3: 清理 ----
if ($Clean) {
  Log 'Cleaning ts\node_modules and res\web\em output'
  Remove-Item -Recurse -Force (Join-Path $TsDir 'node_modules')     -ErrorAction SilentlyContinue
  Remove-Item -Recurse -Force (Join-Path $ExtDir 'res\web\em\*')    -ErrorAction SilentlyContinue
}

# ---- Step 4: 构建 ----
Push-Location $ExtDir
try {
  if ($FantomOnly) {
    Log 'Fantom-only build (nodeDirs temporarily disabled)'
    $buildFan = Join-Path $ExtDir 'build.fan'
    $backup   = Join-Path $ExtDir 'build.fan.bak'
    Copy-Item $buildFan $backup -Force
    try {
      (Get-Content $buildFan) -replace '^(\s*)nodeDirs = ', '$1// nodeDirs = ' | Set-Content $buildFan
      & fan build.fan
      if ($LASTEXITCODE -ne 0) { Fail 'fan build.fan failed' 4 }
    } finally {
      Move-Item $backup $buildFan -Force
    }
  } else {
    if (-not (Test-Path (Join-Path $TsDir 'node_modules'))) {
      Log 'Installing TS dependencies (one-time)'
      Push-Location $TsDir
      try { & npm install --no-audit --no-fund; if ($LASTEXITCODE -ne 0) { Fail 'npm install failed' 3 } }
      finally { Pop-Location }
    }
    Log 'Compiling energyMatrix pod (finBuild runs ts/ vite build first)'
    & fan build.fan
    if ($LASTEXITCODE -ne 0) { Fail 'fan build.fan failed' 4 }
  }
} finally {
  Pop-Location
}

$podPath = Join-Path $libFan 'energyMatrix.pod'
if (Test-Path $podPath) {
  $size = '{0:N1} MB' -f ((Get-Item $podPath).Length / 1MB)
  Log "BUILD OK — $podPath ($size)"
  Log '重启 finStackHost 后再硬刷新浏览器（Ctrl+Shift+R），pod 内 SPA 缓存很激进。'
} else {
  Warn "fan reported success but $podPath not found"
}
