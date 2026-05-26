# ============================================================
# 长盈 2.5 — 院内求美者雷达系统
# 多阶段 Docker 构建（ARM64/x86_64 自适应）
# ⚠️ 弱NAS(Celeron/4GB)必须用 slim(Debian)，Alpine会编译卡死
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
LABEL name="changying" version="2.5"
LABEL description="长盈·院内求美者雷达系统 v2.5"

WORKDIR /app

# 后端依赖（slim 有 glibc → better-sqlite3 预编译，零编译）
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
