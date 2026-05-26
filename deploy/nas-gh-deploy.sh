#!/bin/bash
# 长盈 v3.0 — 飞牛NAS 一键部署脚本
# 用法: curl -fsSL https://raw.githubusercontent.com/simon-yin-1983/changying/main/deploy/nas-gh-deploy.sh | bash
set -e

REPO="https://github.com/simon-yin-1983/changying.git"
APP_DIR="/vol1/docker/changying"
BACKUP_DIR="/vol1/docker/changying_backup_$(date +%Y%m%d_%H%M%S)"

echo "🚀 长盈 · 飞牛NAS 一键部署"
echo "=========================="

# 1. 备份现有数据
if [ -d "$APP_DIR/server/data" ]; then
  echo "📦 备份现有数据..."
  mkdir -p "$BACKUP_DIR"
  cp -r "$APP_DIR/server/data" "$BACKUP_DIR/"
  echo "   备份至: $BACKUP_DIR"
fi

# 2. 拉取最新代码
if [ -d "$APP_DIR/.git" ]; then
  echo "🔄 更新代码..."
  cd "$APP_DIR" && git pull origin main
else
  echo "📥 克隆仓库..."
  git clone "$REPO" "$APP_DIR"
fi

# 3. 恢复数据
if [ -d "$BACKUP_DIR/data" ]; then
  echo "📦 恢复数据..."
  cp -r "$BACKUP_DIR/data/"* "$APP_DIR/server/data/" 2>/dev/null || true
fi

# 4. Docker 部署
cd "$APP_DIR"
echo "🐳 Docker 构建 + 启动..."
chmod +x deploy/update.sh
./deploy/update.sh

echo ""
echo "✅ 部署完成！"
echo "   访问: http://<NAS_IP>:3000"
echo "   默认管理员: 密码 123"
