Copy-Item "D:\mygithub\energyMatrix\energyMatrix.pod" "C:\Program Files (x86)\FIN\FIN 5.3.0.2761\lib\fan\energyMatrix.pod" -Force
Restart-Service -Name FIN5 -Force
Start-Sleep -Seconds 20
$svc = Get-Service -Name FIN5
$port = (Test-NetConnection -ComputerName 127.0.0.1 -Port 8080 -InformationLevel Quiet)
"deployed; service=$($svc.Status); port8080=$port" | Out-File "D:\mygithub\energyMatrix\docs\evidence\deploy-result.txt" -Encoding utf8