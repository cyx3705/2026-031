param(
    [string]$Server = 'root@101.132.190.76',
    [string]$Key = 'C:\Users\Administrator\.ssh\messagehub-cloud.pem',
    [switch]$Build
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
Push-Location $repo
try {
    if ($Build) {
        & npm run build
        if ($LASTEXITCODE -ne 0) { throw '站点构建失败，停止发布' }
    }
    & node b-Code/prepare-deploy.mjs
    if ($LASTEXITCODE -ne 0) { throw '部署准备失败' }
    $release = (Get-Content b-Deploy/out/latest.txt -Raw).Trim()
    & tar -czf b-Deploy/out/site.tar.gz -C $release .
    if ($LASTEXITCODE -ne 0) { throw '打包失败' }
    $options = @('-i', $Key, '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=15')
    & ssh @options $Server 'mkdir -p /opt/onehistory/incoming'
    if ($LASTEXITCODE -ne 0) { throw 'SSH 连接失败' }
    & scp @options b-Deploy/out/site.tar.gz b-Deploy/onehistory.nginx.conf b-Deploy/activate.sh b-Deploy/access-report.py "${Server}:/opt/onehistory/incoming/"
    if ($LASTEXITCODE -ne 0) { throw '上传失败，保留现有版本' }
    & ssh @options $Server 'bash /opt/onehistory/incoming/activate.sh'
    if ($LASTEXITCODE -ne 0) { throw '服务器发布失败，请检查 Nginx 日志' }
} finally { Pop-Location }
