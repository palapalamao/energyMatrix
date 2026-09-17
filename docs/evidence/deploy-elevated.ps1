$ErrorActionPreference = 'Continue'
$log = "D:\mygithub\energyMatrix\docs\evidence\deploy-result.txt"
"$(Get-Date -Format o) deploy start" | Out-File $log -Encoding utf8
$env:Path = "C:\Users\11607\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;C:\Program Files (x86)\FIN\FIN 5.3.0.2761\bin;$env:Path"
Stop-Service -Name FIN5 -Force
Start-Sleep -Seconds 3
Set-Location D:\mygithub\energyMatrix\energyMatrix
$out = & fan build.fan 2>&1
$code = $LASTEXITCODE
"build exit: $code" | Out-File $log -Append -Encoding utf8
$out | Select-Object -Last 5 | Out-File $log -Append -Encoding utf8
if ($code -eq 0) {
  Start-Service -Name FIN5
  Start-Sleep -Seconds 25
  $svc = (Get-Service -Name FIN5).Status
  $port = Test-NetConnection -ComputerName 127.0.0.1 -Port 8080 -InformationLevel Quiet
  "service=$svc port8080=$port" | Out-File $log -Append -Encoding utf8
} else {
  Start-Service -Name FIN5
  "build failed; FIN5 restarted to restore service" | Out-File $log -Append -Encoding utf8
}