@echo off
chcp 65001 >nul
echo ==============================================
echo   ĐANG DEPLOY LÊN CLOUDFLARE WORKERS
echo ==============================================

if exist .env (
    for /f "usebackq tokens=1,* delims==" %%A in (".env") do (
        set "%%A=%%B"
    )
)

node ".\node_modules\wrangler\bin\wrangler.js" deploy
echo ==============================================
echo   DEPLOY HOAN TAT!
echo   Dia chi web: https://pxk-ddlongan.ddlongan.workers.dev
echo ==============================================
pause
