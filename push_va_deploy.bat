@echo off
chcp 65001 >nul
cd /d "%~dp0"
set LOG=%~dp0claude_log.txt
echo ===== GIT PUSH ===== > "%LOG%"
git add -A -- . ":!claude_log.txt" >> "%LOG%" 2>&1
git commit -m "feat: chon khach hang LT/JiaYu/Kurim, bo chi tiet dong bo doi, danh muc PO/don gia, dashboard cong no" >> "%LOG%" 2>&1
git push origin main >> "%LOG%" 2>&1
echo PUSH_EXIT=%ERRORLEVEL% >> "%LOG%"
echo ===== DEPLOY CLOUDFLARE ===== >> "%LOG%"
if exist .env (
    for /f "usebackq tokens=1,* delims==" %%A in (".env") do (
        set "%%A=%%B"
    )
)
node ".\node_modules\wrangler\bin\wrangler.js" deploy >> "%LOG%" 2>&1
echo DEPLOY_EXIT=%ERRORLEVEL% >> "%LOG%"
echo ===== XONG ===== >> "%LOG%"
type "%LOG%"
pause
