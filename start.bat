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

echo [1/2] 正在自动执行依赖安装 (npm install)...
call npm install

if %errorlevel% neq 0 (
    echo [错误] 依赖安装失败，请检查网络连接或重试！
    pause
    exit /b
)

echo.
echo [2/2] 依赖安装成功！正在启动本地开发服务器...
echo.
echo 提示：启动成功后，请在浏览器中打开 http://localhost:3000
echo ==========================================
echo.

call npm run dev

pause
