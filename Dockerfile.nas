# ============================================================
# 长盈 1.0 — 院内求美者雷达系统
# 多阶段 Docker 构建（ARM64/x86_64 自适应）
# NAS 优化版：用 Debian(slim) 替代 Alpine，避免现场编译 better-sqlite3
# ============================================================

# ── Stage 1: 构建前端 ──
FROM node:22-slim AS builder
WORKDIR /build

# 前端依赖
COPY client/package*.json client/
RUN cd client && npm ci

# 前端源码 + 构建
COPY client/ client/
RUN cd client && npm run build

# ── Stage 2: 生产镜像 ──
FROM node:22-slim
LABEL name="changying" version="1.0"
LABEL description="长盈·院内求美者雷达系统 v1.0"

WORKDIR /app

# 后端依赖（better-sqlite3 在 Debian ARM64 上有预编译包，无需编译）
COPY server/package*.json server/
RUN cd server && npm ci --omit=dev

# 后端源码
COPY server/ server/

# 前端构建产物
COPY --from=builder /build/client/dist/ /app/server/public/

# 数据目录
RUN mkdir -p /app/data
ENV DB_DIR=/app/data
ENV PORT=3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/ || exit 1

EXPOSE 3000

CMD ["node", "server/app.js"]
