$ErrorActionPreference = 'Stop'
$feedRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$feedPort = if ($env:PORT) { [int]$env:PORT } else { 4317 }
$listener = Get-NetTCPConnection -LocalPort $feedPort -State Listen -ErrorAction SilentlyContinue
if ($listener) {
    try {
        $health = Invoke-RestMethod "http://127.0.0.1:$feedPort/api/v1/health" -TimeoutSec 3
        if ($health.status -eq 'ok' -and $health.application -eq 'tideline-information-feeding') { Write-Output "潮汐已在运行：http://127.0.0.1:$feedPort"; exit 0 }
    } catch {}
    throw "端口 $feedPort 已被占用，未结束任何进程。"
}
$feedData = Join-Path $feedRoot 'data'
New-Item -ItemType Directory -Force -Path $feedData | Out-Null
$feedNode = (Get-Command node -ErrorAction Stop).Source
$feedScript = Join-Path $feedRoot 'src\server.mjs'
$feedProcess = Start-Process -FilePath $feedNode -ArgumentList @('"' + $feedScript + '"') -WorkingDirectory $feedRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $feedData 'service.stdout.log') -RedirectStandardError (Join-Path $feedData 'service.stderr.log') -PassThru
$feedProcess.Id | Set-Content (Join-Path $feedData 'service.pid')
for ($i=0; $i -lt 20; $i++) {
    Start-Sleep -Milliseconds 300
    if ($feedProcess.HasExited) { throw '潮汐启动失败，请查看 data/service.stderr.log' }
    try { $health = Invoke-RestMethod "http://127.0.0.1:$feedPort/api/v1/health" -TimeoutSec 1; if ($health.status -eq 'ok') { Write-Output "潮汐已在后台启动：http://127.0.0.1:$feedPort"; exit 0 } } catch {}
}
throw '启动未在预期时间内就绪，请查看 data/service.stderr.log'
