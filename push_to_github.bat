@echo off
chcp 65001 >nul
echo ==============================================
echo   ĐANG ĐẨY CODE LÊN GITHUB (MAIN BRANCH)
echo ==============================================
git add .
set /p commit_msg="Nhap noi dung commit (Enter de mac dinh): "
if "%commit_msg%"=="" set commit_msg=update: cap nhat ma nguon
git commit -m "%commit_msg%"
git push origin main
echo ==============================================
echo   DA DAY CODE LEN GITHUB THANH CONG!
echo ==============================================
pause
