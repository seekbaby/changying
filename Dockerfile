# ============================================================
# 长盈 7.0 — 院内求美者雷达系统
# 多阶段 Docker 构建（ARM64/x86_64 自适应）
# ⚠️ 弱NAS(Celeron/4GB)必须用 slim(Debian)，Alpine会编译卡死
# v7.0 更新：火山引擎ASR替代百炼、双模式(标准/极速)、计费系统
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
LABEL name="changying" version="7.0"
LABEL description="长盈·院内求美者雷达系统 v7.0"

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

# ── v7.0 环境变量 ──
# 阿里云 OSS（录音文件存储）
ENV OSS_REGION=oss-cn-shanghai
ENV OSS_ACCESS_KEY_ID=
ENV OSS_ACCESS_KEY_SECRET=
ENV OSS_BUCKET=cy4
# 火山引擎 ASR（替代百炼，双模式：标准/极速）
ENV VOLCENGINE_APP_ID=
ENV VOLCENGINE_TOKEN=
# DeepSeek 分析（面诊报告生成）
ENV DEEPSEEK_API_KEY=

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/ || exit 1

EXPOSE 3000

CMD ["node", "server/app.js"]
