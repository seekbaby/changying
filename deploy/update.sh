#!/bin/sh
# ============================================================
# 长盈 2.5 — 版本升级脚本
# 使用方法:
#   上传新版本目录后，在项目根目录执行：
#   chmod +x deploy/update.sh && ./deploy/update.sh
# ============================================================
set -e

echo ""
echo "  ╔══════════════════════════════════╗"
echo "  ║   长盈 · 版本升级 v2.5           ║"
echo "  ╚══════════════════════════════════╝"
echo ""

# ── 1. 检查 Docker ──
if ! docker info >/dev/null 2>&1; then
  echo "❌ Docker 未运行，请先启动。"
  exit 1
fi

# ── 2. 备份当前数据 ──
BACKUP_NAME="changying_backup_$(date +%Y%m%d_%H%M%S)"
echo "💾 备份数据到 ./${BACKUP_NAME} ..."
mkdir -p "./${BACKUP_NAME}"
docker cp changying:/app/data "./${BACKUP_NAME}/" 2>/dev/null && \
  echo "   ✅ 数据已备份" || \
  echo "   ⚠️ 备份跳过（容器可能未运行）"

# ── 3. 停止旧容器 ──
echo ""
echo "⏸️  停止旧版本..."
docker stop changying 2>/dev/null || true
docker rm changying 2>/dev/null || true

# ── 4. 自动检测架构 ──
ARCH=$(uname -m)
if [ "$ARCH" = "aarch64" ]; then
  PLATFORM="linux/arm64"
elif [ "$ARCH" = "x86_64" ]; then
  PLATFORM="linux/amd64"
else
  PLATFORM="linux/amd64"
fi
echo "🖥️  架构: $ARCH → 平台: $PLATFORM"

# ── 5. 构建新镜像 ──
echo ""
echo "🔨 构建新版本镜像 (node:22-slim, 弱NAS友好)..."
echo "   预计耗时 2-5 分钟..."
docker build --platform $PLATFORM -t changying:2.5 . 2>&1 | tail -5

if ! docker image inspect changying:2.5 >/dev/null 2>&1; then
  echo ""
  echo "❌ 镜像构建失败！尝试恢复旧容器..."
  if [ -f "docker-compose.yml" ]; then
    docker compose up -d
  fi
  exit 1
fi

echo "✅ 镜像构建成功"

# ── 6. 启动新容器 ──
echo ""
echo "🚀 启动新版本..."
docker run -d \
  --name changying \
  --restart unless-stopped \
  -p 3000:3000 \
  -v changying_data:/app/data \
  -e TZ=Asia/Shanghai \
  changying:2.5

# ── 7. 等待启动 ──
echo "⏳ 等待服务启动..."
sleep 5

# ── 8. 验证 ──
echo ""
NAS_IP=$(ip route get 1 2>/dev/null | awk '{print $7; exit}' || echo "你的NAS_IP")
if curl -sf http://localhost:3000/ >/dev/null 2>&1; then
  echo "✅ 升级成功！"
  echo ""
  echo "  访问地址: http://${NAS_IP}:3000"
  echo "  备份文件: ./${BACKUP_NAME}/"
  echo ""
else
  echo "⚠️ 服务可能仍在启动中，请稍后访问 http://${NAS_IP}:3000"
  echo "  查看日志: docker logs changying"
fi
