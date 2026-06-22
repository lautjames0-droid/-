@echo off
echo ==========================================
echo  亦仁翻译 (Yiren Translate) 一键启动脚本
echo ==========================================
echo.

:: 检查 Node.js 是否安装
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Node.js，请先前往 https://nodejs.org/ 下载并安装！
    pause
    exit /b
)

:: 尝试在 Windows 桌面自动创建一键启动快捷方式 (省去每次都要打开文件夹的步骤)
echo 正在桌面上自动为您生成【亦仁翻译】一键启动快捷方式...
powershell -Command "$s=(New-Object -ComObject WScript.Shell);$d=$s.SpecialFolders('Desktop');$lnk=$s.CreateShortcut(\"$d\亦仁翻译一键启动.lnk\");$lnk.TargetPath=\"%~dp0start.bat\";$lnk.WorkingDirectory=\"%~dp0\";$lnk.IconLocation=\"shell32.dll,220\";$lnk.Save()" >nul 2>nul

echo [1/2] 正在自动执行依赖安装 (npm install)...
call npm install

if %errorlevel% neq 0 (
    echo [错误] 依赖安装失败，请检查网络连接或重试！
    pause
    exit /b
)

echo.
echo [2/2] 依赖安装成功！正在启动本地开发服务器并自动打开网页...
echo.
echo 提示：正在为您在默认浏览器中自动打开 http://localhost:3000
echo ==========================================
echo.

:: 启动默认浏览器打开网页
start http://localhost:3000

:: 启动开发服务
call npm run dev

pause
