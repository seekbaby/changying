#!/bin/bash
# ═══════════════════════════════════════════════
# 小满医疗·院内求美者雷达系统
# 飞牛NAS一键部署脚本
# 用法: bash deploy.sh
# ═══════════════════════════════════════════════
set -e

echo "╔════════════════════════════════════════╗"
echo "║  小满医疗·院内求美者雷达系统 v1.0   ║"
echo "║  飞牛NAS Docker 单容器部署           ║"
echo "╚════════════════════════════════════════╝"
echo ""

# 检查 Docker
if ! command -v docker &> /dev/null; then
  echo "❌ 未检测到 Docker，请先安装 Docker"
  exit 1
fi

# 检查 docker compose
COMPOSE="docker compose"
if ! docker compose version &> /dev/null 2>&1; then
  if docker-compose --version &> /dev/null 2>&1; then
    COMPOSE="docker-compose"
  else
    echo "❌ 未检测到 docker compose，请先安装"
    exit 1
  fi
fi

# 创建数据目录
mkdir -p data logs

echo "📦 构建 Docker 镜像..."
$COMPOSE build

echo ""
echo "🚀 启动服务..."
$COMPOSE up -d

echo ""
echo "⏳ 等待服务就绪..."
sleep 5

# 健康检查
if curl -s http://localhost:3000/api/health > /dev/null 2>&1; then
  echo "✅ 服务启动成功！"
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  📱 访问地址: http://$(hostname -I | awk '{print $1}'):3000"
  echo "  🔐 管理员密码: xm8888"
  echo "  💾 数据库位置: $(pwd)/data/flowradar.db"
  echo "  📋 查看日志: $COMPOSE logs -f"
  echo "  ⏹️  停止服务: $COMPOSE down"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
else
  echo "⚠️  服务可能未正常启动，请检查日志:"
  echo "   $COMPOSE logs"
fi
