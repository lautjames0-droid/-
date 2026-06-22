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

echo "[1/2] 正在自动执行依赖安装 (npm install)..."
npm install

if [ $? -ne 0 ]; then
    echo "[错误] 依赖安装失败，请检查网络连接或重试！"
    exit 1
fi

echo ""
echo "[2/2] 依赖安装成功！正在启动本地开发服务器..."
echo ""
echo "提示：启动成功后，请在浏览器中打开 http://localhost:3000"
echo "=========================================="
echo ""

npm run dev
