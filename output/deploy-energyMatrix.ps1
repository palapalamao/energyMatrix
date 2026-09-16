# energyMatrix pod 部署脚本（需管理员权限运行）
# 流程：备份线上 pod → 停 FIN5 → 复制新 pod → 启 FIN5 → 等待 8080 → 写结果 JSON
$ErrorActionPreference = 'Stop'
$src      = 'D:\tmp\finhome5.3\lib\fan\energyMatrix.pod'
$dest     = 'C:\Program Files (x86)\FIN\FIN 5.3.0.2761\lib\fan\energyMatrix.pod'
$backupDir = 'D:\work\yiliaohouqin\haystack code\energy\output\backups'
$resultPath = 'D:\work\yiliaohouqin\haystack code\energy\output\deploy-energyMatrix-result.json'
$ts = Get-Date -Format 'yyyyMMdd-HHmmss'
$backup = Join-Path $backupDir "energyMatrix-production-$ts.pod"

$result = [ordered]@{
  success    = $false
  source     = $src
  production = $dest
  backup     = $backup
  sha256     = (Get-FileHash $src -Algorithm SHA256).Hash
  service    = ''
  port8080   = $false
  error      = $null
}

try {
  New-Item -ItemType Directory -Force $backupDir | Out-Null
  if (Test-Path $dest) { Copy-Item $dest $backup -Force }

  Stop-Service FIN5 -Force
  $sw = [Diagnostics.Stopwatch]::StartNew()
  while ((Get-Service FIN5).Status -ne 'Stopped' -and $sw.Elapsed.TotalSeconds -lt 60) { Start-Sleep -Seconds 2 }
  Copy-Item $src $dest -Force

  Start-Service FIN5
  $sw.Restart()
  while ($sw.Elapsed.TotalSeconds -lt 240) {
    try {
      $tcp = New-Object System.Net.Sockets.TcpClient
      $iar = $tcp.BeginConnect('127.0.0.1', 8080, $null, $null)
      if ($iar.AsyncWaitHandle.WaitOne(2000) -and $tcp.Connected) { $tcp.EndConnect($iar); $result.port8080 = $true; $tcp.Close(); break }
      $tcp.Close()
    } catch {}
    Start-Sleep -Seconds 3
  }
  $result.service = (Get-Service FIN5).Status.ToString()
  $result.success = $result.port8080
} catch {
  $result.error = $_.Exception.Message
  try { if ((Get-Service FIN5).Status -ne 'Running') { Start-Service FIN5 } } catch {}
}

$result | ConvertTo-Json | Set-Content -Path $resultPath -Encoding UTF8
exit $(if ($result.success) { 0 } else { 1 })
