#!/bin/bash

echo "=========================================="
echo " 亦仁翻译 (Yiren Translate) 一键启动脚本"
echo "=========================================="
echo ""

# 检查 Node.js 是否安装
if ! command -v node &> /dev/null
then
    echo "[错误] 未检测到 Node.js，请先前往 https://nodejs.org/ 下载并安装！"
    exit 1
fi

# 检查是否已经存在 node_modules 依赖目录
if [ -d "node_modules" ]; then
    echo "[1/2] 检测到本地 node_modules 依赖已存在，自动跳过安装步骤以节省时间！"
else
    echo "[1/2] 未检测到本地依赖目录，正在为您自动执行依赖安装 (npm install)..."
    npm install

    if [ $? -ne 0 ]; then
        echo "[错误] 依赖安装失败，请检查网络连接或重试！"
        exit 1
    fi
fi

echo ""
echo "[2/2] 依赖安装成功！正在启动本地开发服务器..."
echo ""
echo "提示：正在默认浏览器中自动为您打开 http://localhost:3000"
echo "=========================================="
echo ""

# 自动在默认浏览器中打开页面
if command -v open &> /dev/null; then
    open "http://localhost:3000"
elif command -v xdg-open &> /dev/null; then
    xdg-open "http://localhost:3000"
fi

npm run dev
