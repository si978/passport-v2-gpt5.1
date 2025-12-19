# ECS 线上加固清单（建议）

## 1) 安全组 / 防火墙

- 仅开放对外端口：`HTTP_PORT`（建议生产用 `80/443`）、管理后台 `ADMIN_PORT`（建议只对白名单 IP 开放），以及 SSH `22`（强烈建议仅允许你的固定 IP 访问）。
- 不要对公网开放：后端 `3000`、Postgres `5432`、Redis `6379`（本项目已通过 Docker 内网互联，默认无需暴露）。
- 如临时必须开放 `8080` 做验收，建议配合安全组白名单（仅你的 IP）并尽快切回 `80/443`。
  - 同理：如必须开放 `ADMIN_PORT`，也建议只对白名单 IP 放行。
  - 如果运营同学没有固定 IP：可以对公网开放 `ADMIN_PORT`，但务必在 `deploy/.env` 设置 `ADMIN_BASIC_USER/ADMIN_BASIC_PASS` 启用 BasicAuth（至少先挡住对后台 UI 的扫描与未授权访问）。

## 2) HTTPS（强烈建议）

- 优先使用“域名 + HTTPS”，避免明文传输 `access_token/refresh_token` 与验证码相关请求被窃听/篡改。
- 推荐两种做法（二选一）：
  - 阿里云 SLB/ALB 做 TLS 终止（证书托管在阿里云），回源到 ECS 的 `HTTP_PORT`。
  - ECS 上单独部署 Nginx/Certbot 做 TLS 终止，再反代到本项目的 `HTTP_PORT`。

## 3) 生产配置（必须项）

- 复制并填写：`deploy/.env.example` → `deploy/.env`
  - 生产务必修改 `POSTGRES_PASSWORD` 为强密码。
  - 如需公网抓取 `/api/metrics`：设置 `METRICS_TOKEN`，并用 `Authorization: Bearer <token>` 访问。
- 复制并填写：`sms-config/.env.example` → `sms-config/.env`（短信密钥不要提交到仓库）。
- 保持：`ENABLE_SWAGGER=0`，`ADMIN_AUTH_MODE=strict`。
- 管理后台隔离：
  - `ADMIN_APP_ID=admin`（默认）；
  - 安全组仅对白名单 IP 放行 `ADMIN_PORT`；
  - 管理后台从 `http://<IP>:<ADMIN_PORT>/admin/users` 访问并登录。
- 反代场景保持：`TRUST_PROXY=1`（已在 `deploy/docker-compose.yml` 设置），确保限流使用真实客户端 IP。

## 4) 数据持久化与备份

- Postgres：`postgres-data` 已持久化；建议按天 `pg_dump` 备份到 OSS，并对 ECS 磁盘做快照策略。
- Redis：`redis-data` 已启用 AOF 持久化（会话/限流/验证码均依赖 Redis）；仍建议监控内存与重启次数。

## 5) 日志与监控

- `deploy/docker-compose.yml` 已为容器日志启用 `json-file` 轮转（避免磁盘被打满）。
- 建议配置阿里云云监控告警：CPU、内存、磁盘使用率、容器重启次数、端口可用性（`/api/health`）。
