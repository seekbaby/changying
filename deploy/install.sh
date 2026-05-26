#!/bin/sh
# ============================================================
# 长盈 1.0 — 飞牛NAS 一键安装脚本
# 使用方法:
#   chmod +x install.sh && ./install.sh
# ============================================================

set -e

echo ""
echo "  ╔══════════════════════════════════╗"
echo "  ║   长盈 1.0 · 院内求美者雷达系统  ║"
echo "  ║   一键安装部署脚本               ║"
echo "  ╚══════════════════════════════════╝"
echo ""

# ── 1. 检查 Docker 环境 ──
if ! command -v docker >/dev/null 2>&1; then
  echo "❌ 错误：未检测到 Docker，请先在飞牛NAS应用中心安装 Docker。"
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "❌ 错误：Docker 服务未运行，请在飞牛NAS中启动 Docker。"
  exit 1
fi

echo "✅ Docker 环境正常"

# ── 2. 获取 NAS IP ──
NAS_IP=$(ip route get 1 2>/dev/null | awk '{print $7; exit}' || echo "你的NAS_IP")
echo ""
echo "📡 NAS 局域网 IP: ${NAS_IP}"

# ── 3. 构建镜像 ──
echo ""
echo "🔨 开始构建长盈 1.0 镜像（ARM64）..."
echo "   预计耗时 3-8 分钟，请耐心等待..."
echo ""

docker build --platform linux/arm64 -t changying:1.0 . 2>&1 | \
  while IFS= read -r line; do
    case "$line" in
      *"Step"*) echo "   ⏳ $line" ;;
      *"Successfully"*) echo "   ✅ $line" ;;
    esac
  done

if ! docker image inspect changying:1.0 >/dev/null 2>&1; then
  echo ""
  echo "❌ 镜像构建失败，请检查上方错误信息。"
  exit 1
fi

echo ""
echo "✅ 镜像构建成功"

# ── 4. 停止旧容器（如有）──
if docker ps -a --format '{{.Names}}' | grep -q '^changying$'; then
  echo ""
  echo "⏸️  停止旧容器..."
  docker stop changying 2>/dev/null || true
  docker rm changying 2>/dev/null || true
fi

# ── 5. 启动容器 ──
echo ""
echo "🚀 启动长盈系统..."

docker run -d \
  --name changying \
  --restart unless-stopped \
  -p 3000:3000 \
  -v changying_data:/app/data \
  -e TZ=Asia/Shanghai \
  changying:1.0

# ── 6. 等待启动 ──
echo "⏳ 等待服务启动..."
sleep 5

# ── 7. 验证 ──
echo ""
if curl -sf http://localhost:3000/ >/dev/null 2>&1; then
  echo "✅ 长盈 1.0 已成功启动！"
  echo ""
  echo "  ┌─────────────────────────────────────────────┐"
  echo "  │  访问地址：                                  │"
  echo "  │                                             │"
  echo "  │  http://${NAS_IP}:3000                       │"
  echo "  │                                             │"
  echo "  │  管理员密码：123                             │"
  echo "  │  默认账户：管理员 / 屈红 / 小王 等            │"
  echo "  │                                             │"
  echo "  │  数据目录：changying_data Docker卷            │"
  echo "  └─────────────────────────────────────────────┘"
  echo ""
  echo "📋 常用命令："
  echo "  查看日志： docker logs changying"
  echo "  重启服务： docker restart changying"
  echo "  停止服务： docker stop changying"
  echo "  备份数据： docker cp changying:/app/data ./backup_data"
  echo ""
else
  echo "⚠️  服务启动中，请稍等后访问 http://${NAS_IP}:3000"
  echo "   如需查看日志：docker logs changying"
fi
