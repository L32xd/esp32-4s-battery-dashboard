$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$envFile = Join-Path $PSScriptRoot '.env'
if (-not (Test-Path -LiteralPath $envFile)) { throw '找不到 .env，请复制 .env.example 并填写 OneNET 配置。' }
Get-Content -LiteralPath $envFile -Encoding UTF8 | ForEach-Object {
    $line = $_.Trim()
    if ($line -and -not $line.StartsWith('#')) {
        $parts = $line.Split('=', 2)
        if ($parts.Count -eq 2) { [Environment]::SetEnvironmentVariable($parts[0].Trim(), $parts[1].Trim(), 'Process') }
    }
}
Write-Host '正在启动 4S 电池可视化...' -ForegroundColor Cyan
Write-Host '监控页面：http://127.0.0.1:1880/dashboard/monitor' -ForegroundColor Green
npm start
