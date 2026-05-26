# ═══════════════════════════════════════════
# 小满医疗·院内求美者雷达系统
# ═══════════════════════════════════════════
# 
# 飞牛NAS部署说明:
# 1. 将此文件夹上传到 NAS 任意目录
# 2. 在该目录下执行: bash deploy.sh
# 3. 访问 http://NAS_IP:3000
#
# 手动部署:
#   docker compose up -d        # 启动
#   docker compose down         # 停止
#   docker compose logs -f      # 查看日志
#   docker compose build --no-cache  # 重新构建
#
# 默认账号:
#   管理员: 管理员 / PIN: xm8888
#   医生:   陈杨   / 无需PIN
#   主管:   屈红   / PIN: 1234
#   护士:   小王、小李、赵姐 / 无需PIN
#   医助:   美美   / 无需PIN
#
# 数据持久化:
#   数据库文件保存在 ./data/flowradar.db
#   日志文件保存在 ./logs/server.log
#   Docker重建后数据不会丢失
#
# 技术架构:
#   后端: Node.js + Express + ws + better-sqlite3
#   前端: Vue 3 + Vite + Pinia
#   数据库: SQLite (WAL模式)
#   通信: HTTP REST + WebSocket 长连接
#   时间: 所有时间字段使用 Unix毫秒时间戳 (INTEGER)
#
# 时间规范:
#   - 数据库: INTEGER 存储 Unix毫秒时间戳
#   - 前端: Date.now() 获取，差值计算展示
#   - 服务端: 以服务端时间为准
#   - visit_date: 唯一例外，TEXT 'YYYY-MM-DD' 仅用于按日归档
#
# 角色权限 (白皮书 §5.5):
#   护士:   建单、推进状态、换房、追加备注、查看大屏
#   医助:   录入治疗方案(强制)、情绪标签、追加备注、查看大屏
#   医生(陈杨): 查看雷达大屏(只读，不发送任何命令)
#   主管:   应急推进状态、所有房间矩阵、追加备注、查看大屏
#   管理员: 强删/强改数据(审计)、人员配置、房间配置
# ═══════════════════════════════════════════
