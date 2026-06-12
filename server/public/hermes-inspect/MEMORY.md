AWG V5: /mnt/d/dm/awg-v5/, Next.js 16 + TS + TailwindCSS v4 + Zustand。Phase锁定开发。Phase 7-8已完成部署。具体见 awg-v5-development skill。
§
用户WSL配置 networkingMode=mirrored，导致localhost端口转发行为不同于默认NAT模式。本地dev server需用WSL IP(如172.28.x.x)访问而非localhost。wsl.conf中generateResolvConf=false，DNS用8.8.8.8。
§
长盈·飞牛NAS: 192.168.0.127, SSH adminNAS:22常hung(关→保存→开修复)。Celeron J3160+4GB→须用node:22-slim(Debian预编译2min)。Docker Hub→DaoCloud加速。
§
长盈三类高频Bug预防(2026-05-27): ①权限遗漏——功能塞入已有页面时跑角色矩阵,确认handler门禁+前端canXxx覆盖目标角色;②reactive({})崩溃——v-model="obj[id].prop"必须在toggleExpand等设置key处初始化obj[id]={prop:default},否则undefined.prop→TypeError→白屏;③接口零参数拒绝——validator不用if(!x)return error,空参数做fallback(空name=全量)。
§
GitHub PAT scope 陷阱：推送 .github/workflows/ 文件需要 PAT 包含 `workflow` scope（经典 token 需勾选，细粒度 token 需 Workflows Read/Write 权限）。缺此 scope 时 `git push` 报 "refusing to allow PAT to create or update workflow"。修复：GitHub Settings → Tokens → Edit → 勾选 workflow → Save，token 值不变无需重新生成。`gh` CLI 额外需要 `read:org` scope。ghcr.io 免 Docker Hub：用 `secrets.GITHUB_TOKEN`（内置）登录，多架构构建（amd64+arm64），公开镜像飞牛NAS可免密拉取。
§
飞牛NAS无法使用SSH/终端，只能用Docker UI操作容器。部署方式：NAS上docker-compose.yml拉取ghcr.io公开镜像。
§
长盈双部署路径：源项目/mnt/d/dm/小满诊所效率工具/flow-radar/（开发）vs 运行部署/home/simon/长盈/（生产）。各自有独立DB flowradar.db。用户报"数据丢了"时首先要确认运行中服务用哪个DB（ss -tlnp查端口→/proc/PID/cwd确认目录→查init.js的DB_PATH）。两个库结构一致但seed.sql可能不同步。
§
Hermes Agent 双模型架构：主模型 DeepSeek V4 Pro（理解/规划）。委派模型当前为 qwen/qwen3.7-max via OpenRouter（实际不可用，0 token 消耗=委派失效）。2026-06-07 曾切到 V4 Flash 导致日成本从 ¥3-5 暴涨至 ¥53——教训：委派模型绝不能用推理模型。若需启用委派，用 deepseek-chat(V3,¥1/M+¥2/M)。
§
长盈项目中文路径 workdir 限制：Hermes terminal(workdir=) 拒绝含中文字符的路径。绕行：① symlink 到 /tmp/ ② bash启动脚本 + workdir=/tmp。详见 flow-radar-development skill references/operations-pitfalls.md。
§
Hermes 满配依赖冲突：marker-pdf 1.10.2 要求 openai<2.0.0，会强制降级 openai 到 1.109.1；但 hermes-agent 0.15.1 需要 openai==2.24.0。安装 marker-pdf 后必须立即 `pip install openai==2.24.0` 修复。Marker 只是 PDF 解析工具，版本冲突不影响 Hermes 核心功能。
§
VPS (BandwagonHost/KiwiVM): iptables conntrack模块不可用——`-m conntrack --ctstate ESTABLISHED,RELATED`规则静默失效导致所有TCP端口不通但ICMP ping正常。修复：只用`-p tcp --dport N -j ACCEPT`简单规则，不用conntrack。xray通过x-ui面板(port 56789)管理，ss-server在59288，均非systemd服务。重装OS需先Stop VM再Install new OS。
§
KiwiVM Console 传代码限制：① heredoc (cat > file << 'EOF') 吃掉 Python 缩进→用 base64 传输 ② 长输出超过~100行触发 "Broken pipe" 截断 ③ apt install 超时——命令还在后台跑，等 2 分钟再验证 ④ 生成 base64: 本地 `base64 -w0 file` → console `echo "xxx" | base64 -d > file`
§
Next.js 16 build 在国内需替换 Google Fonts：删除 `next/font/google` 引用，globals.css 中 `--font-geist-*` 改为系统字体 (system-ui, ui-monospace)。否则 getaddrinfo EAI_AGAIN fonts.googleapis.com 导致编译失败。
§
VPS 是 $50/年，非 $10/年。用户用 v2rayNG 作为翻墙客户端。不要假设美国 VPS 的 GitHub 连通性等同于国内环境——洛杉矶机房不应有 GFW 限制。
§
VPS 97.64.24.114: $50/年洛杉矶（非$10），已重装OS。3x-ui v3.2.6面板替代手动Xray：端口37643，路径/jSsVcvigLq8a5KXDHz，账号OSseh75ZY5/V9GUasJi7g。VPS可访问GitHub（3x-ui安装脚本下载成功），之前"GitHub被墙"是我本地WSL的问题。SSH和管理agent(9999)均不可用，仅KiwiVM Console可远程操作。旧AWG V5等项目已清除。
§
Cloudflare Tunnel changying-tunnel 部署文件: /home/simon/cloudflared-nas/docker-compose.yml。Tunnel Token 和 Xray 凭证见 ~/.hermes/credentials.md。部署到飞牛NAS Docker UI 后验证: curl -sI https://magicreviewbox.com → 200。
§
magicreviewbox.com 本地WSL部署: /home/simon/magicreviewbox/ (start.sh/stop.sh/logs/pids), 后端代码 /home/simon/长盈/server/, cloudflared ~/.local/bin/cloudflared。命名隧道需cert.pem——最可靠方式：Cloudflare Dashboard手动创建Origin Certificate（SSL/TLS→Origin Server），快速隧道可做临时替代。
§
WSL cloudflared TLS error: `cloudflared tunnel login` browser callback to localhost fails from Windows→WSL (even mirrored mode). ~8min timeout with "Failed to write the certificate". Most reliable fix: user creates Origin Certificate manually in Cloudflare Dashboard (SSL/TLS → Origin Server → Create Certificate), then saves as ~/.cloudflared/cert.pem. See cloudflare-tunnel skill § "Obtaining cert.pem" for full workflow.
§
Cloudflare cert.pem 生成在国内受限：① cloudflared login 浏览器回调失败（Windows浏览器无法回连WSL localhost）② WSL内置Chromium被Turnstile拦截 ③ login.cloudflareaccess.org 被 connection reset by peer。唯一可靠方式：Cloudflare Dashboard → SSL/TLS → Origin Server → Create Certificate 手动生成PEM，复制给agent写入~/.cloudflared/cert.pem。
§
WSL Playwright/Chromium 修复：缺少 libnspr4.so、libnss3.so 等库时，用 apt download 下载 .deb → dpkg -x 解压 → cp *.so 到 ~/.local/lib/ → 创建 chrome wrapper 设置 LD_LIBRARY_PATH。无需 sudo。
§
magicreviewbox.com 已迁移到 WSL 本机 (/home/simon/magicreviewbox/)。服务：长盈后端 port 3000 + cloudflared v2026.5.2 命名隧道 changying-tunnel。启动: bash /home/simon/magicreviewbox/start.sh，停止: bash /home/simon/magicreviewbox/stop.sh。认证: cert.pem 由 Cloudflare Dashboard SSL/TLS → Origin Server 手动生成。login.cloudflareaccess.org 在国内被 reset，浏览器回调不可用。
§
Hindsight bank 清理方法：DELETE /v1/default/banks/{bank_id}/memories 全量删除（不支持逐条）。需 Bearer token。清理后 re-retain 精选事实——每条 Hindsight 自动拆为 observation/world/experience 三种类型。API base: https://api.hindsight.vectorize.io。
§
长盈 v7.0 (2026-06-06) 已部署: 火山引擎 ASR 替代百炼, 原生说话人分离+时间戳。双模式: 标准分析(豆包2.0 ¥0.80/h, ¥299/月包) + 极速版(大模型极速 ¥4.50/h, ¥9.99/次扣10点)。新增计费系统 subscriptions/credit_accounts/credit_transactions。流水线删除 diarizing 步骤。火山引擎凭证(APP_ID+TOKEN)保存在 ~/.hermes/credentials.md。
§
长盈 v7.0 (2026-06-06): 百炼ASR→火山引擎，原生说话人分离+时间戳。双模式：标准分析(豆包2.0 ¥0.80/h，¥299/月) / 极速版(大模型极速 ¥4.50/h，¥9.99/次扣10点)。VOLCENGINE_APP_ID=9501334674, TOKEN=y-fyQ7KRwmCm1H1Zhq74gquS3OY_wR0b。飞牛NAS用docker-compose.nas.yml部署，YAML不能有注释和特殊字符。Git非交互rebase用GIT_EDITOR=true。详见flow-radar-development skill。
§
长盈 v7.0 (2026-06-06) 已部署。火山引擎 ASR 取代百炼：两种 cluster — 豆包录音识别2.0 (¥0.80/h, 标准分析) 和 大模型极速版 (¥4.50/h, 极速版)。认证用 APP_ID + TOKEN（非 API Key），同一凭证通过不同 cluster 参数切换模型。说话人分离原生支持 (with_speaker_info: "True")，返回 speaker + start_time/end_time 毫秒时间戳。NAS docker-compose.nas.yml 含完整环境变量。飞牛 NAS 只用 Docker UI 操作，无 SSH/终端。
§
长盈v7.0 ACR部署已就绪：GitHub Actions推送到阿里云ACR `crpi-008b5xi3tkipemdi.cn-shanghai.personal.cr.aliyuncs.com/changying/changying-server`，账号simonyin1983，Secrets: ACR_USERNAME/ACR_PASSWORD。飞牛NAS compose已指向ACR。CI文件: .github/workflows/docker-build.yml。
§
用户要求优化 token 消耗策略 #1：回复中不要重复粘贴用户引用的长消息原文。用「如上所述」「你引用的版本计划」等方式指代，而非在回复中再贴一遍完整内容。同样适用于 skill_view 加载的技能文件——仅引用关键步骤，不复制全部 SKILL.md。
§
hindsight_retain 使用规范：仅存储有长期参考价值的持久事实（架构决策、凭证位置、配置约定、用户偏好、项目里程碑）。禁止存储：进程退出码、时间戳日志、失败重试记录、一次性事件、临时调试信息。Hindsight 配置已改为 memory_mode=tools（按需检索），不会自动注入所有记忆。
