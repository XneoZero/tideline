$ErrorActionPreference = 'Stop'
$feedRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$pidFile = Join-Path $feedRoot 'data/service.pid'
if (!(Test-Path -LiteralPath $pidFile)) { Write-Output '没有本启动脚本记录的服务进程，未停止其他服务。'; exit 0 }
$feedPid = [int](Get-Content -LiteralPath $pidFile -Raw)
$feedProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$feedPid" -ErrorAction SilentlyContinue
if (!$feedProcess) { Write-Output '记录的服务进程已退出。'; exit 0 }
$feedExpected = (Join-Path $feedRoot 'src\server.mjs').Replace('\','/')
if ($feedProcess.Name -ne 'node.exe' -or !$feedProcess.CommandLine -or $feedProcess.CommandLine.Replace('\','/').IndexOf($feedExpected,[StringComparison]::OrdinalIgnoreCase) -lt 0) { throw '记录的PID已被其他进程使用，未结束进程。' }
$listener = Get-NetTCPConnection -OwningProcess $feedPid -State Listen -ErrorAction SilentlyContinue
if (!$listener) { throw '记录的进程没有监听服务端口，未停止。' }
Stop-Process -Id $feedPid
Write-Output '潮汐服务已停止；定时任务随服务停止。'
