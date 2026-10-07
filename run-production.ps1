$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $projectRoot
& npm.cmd run preview -- --host 127.0.0.1 --port 43817 --strictPort *>> (Join-Path $projectRoot 'production-server.log')
exit $LASTEXITCODE