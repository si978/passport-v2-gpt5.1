# Deploy（可上线形态）

本目录提供“前端 Nginx + 后端 NestJS + Postgres + Redis”的一键部署方案，并补齐空库初始化与健康检查。

## 上线计划

- 上线前/上线流程与回滚：`deploy/RELEASE-PLAN.md`
- 一键上线脚本（可选）：`pwsh deploy/release.ps1 -Mode prod`（生产） / `pwsh deploy/release.ps1 -Mode smoke`（可上线级 smoke）

## 1) 生产/线上部署（真实短信）

1. 配置基础环境变量（不要提交真实密钥到仓库）：
   - 复制 `deploy/.env.example` → `deploy/.env`
   - 生产环境务必修改 `POSTGRES_PASSWORD`
   - 可选：设置 `METRICS_TOKEN`（用于公网/外部 Prometheus 抓取 `/api/metrics`）
2. 配置短信与密钥（不要提交真实密钥到仓库）：
   - 复制 `sms-config/.env.example` → `sms-config/.env`
   - 填写以下二选一：
     - 阿里云 Dypnsapi：`ALIYUN_ACCESS_KEY_ID/ALIYUN_ACCESS_KEY_SECRET/ALIYUN_SMS_SIGN_NAME/ALIYUN_SMS_TEMPLATE_CODE`（或兼容变量 `ALI_SMS_*`）
     - 或自建 HTTP 短信网关：`SMS_GATEWAY_URL`（可选 `SMS_GATEWAY_KEY`）
3. 启动：
   - `docker compose -f deploy/docker-compose.yml up --build -d`
4. 验收（默认端口 `HTTP_PORT=8080`）：
   - 前端：`http://127.0.0.1:8080/`
   - 管理后台（隔离端口，默认 `ADMIN_PORT=18081`）：`http://127.0.0.1:18081/admin/users`
   - 健康检查：`http://127.0.0.1:8080/api/health`
   - Metrics（Prometheus 文本）：`http://127.0.0.1:8080/api/metrics`（生产环境默认仅允许私网/本机访问）

> 说明：部署形态为 Nginx 反代后端，已开启 `TRUST_PROXY=1` 以确保后端 `req.ip` 取到真实客户端 IP（用于限流）。
> 说明：生产环境下 `/api/metrics` 默认只允许私网/本机访问；如需公网抓取，建议在 `deploy/.env` 中设置 `METRICS_TOKEN` 并通过 `Authorization: Bearer <token>` 访问。
> 说明：管理后台已做“端口隔离 + app_id 隔离”：用户前端会阻断 `/admin` 与 `/api/admin`；管理后台需从 `ADMIN_PORT` 访问，并使用 `ADMIN_APP_ID`（默认 `admin`）登录获取专用 token。

## 2) 上线级 Smoke（不外发短信）

用于 CI/本机“可上线级验证”，会启用短信 stub 捕获验证码，避免真实短信外发：

- `pwsh deploy/smoke.ps1`

默认手机号 `13800138000`，可通过环境变量覆盖：

- `TEST_PHONE=13800138000`
- `PASSPORT_APP_ID=jiuweihu`

## 3) 数据库初始化说明

- `deploy/sql/01_schema.sql` 会在 Postgres **首次初始化数据目录**时自动执行（`docker-entrypoint-initdb.d`）。
- 如果你复用了已有数据卷（volume），该脚本不会自动再次执行；需要手工对目标数据库执行同等 SQL（或引入迁移流程）。

## 4) Swagger 开关

后端默认仅在非生产环境启用 Swagger；如需在生产环境临时开启，设置环境变量：

- `ENABLE_SWAGGER=1`（Swagger 路径：`/api/docs`）

## 5) 管理后台登录与授权（无域名版）

### 5.1 登录入口

- 用户前端：`http://<IP>:${HTTP_PORT}/`
- 管理后台（隔离端口）：`http://<IP>:${ADMIN_PORT}/admin/users`

管理后台登录方式仍为“手机号 + 短信验证码”，但必须从 `ADMIN_PORT` 入口登录（其 `app_id=ADMIN_APP_ID`，与用户端隔离）。

如果运营同学没有固定公网 IP、不方便做安全组白名单：

- 可以对公网开放 `ADMIN_PORT`，但请在 `deploy/.env` 设置 `ADMIN_BASIC_USER/ADMIN_BASIC_PASS` 启用管理后台 BasicAuth（浏览器会弹出用户名/密码验证；该 BasicAuth 仅用于保护后台 UI 入口，API 仍由 token/roles/app_id 约束）。

### 5.2 授权运营同学访问后台

当前 V1 授权方式是**在 Postgres 中为该手机号设置管理员 userType**（建议先让对方在管理端口登录一次以创建用户记录）。

1) 查询用户（在 ECS 上执行）：

- `docker compose -f deploy/docker-compose.yml exec -T postgres psql -U passport -d passport -c "select guid, phone, \"userType\" from users where phone='13800138000';"`

2) 赋权（两种选择）：

- 全权限运营（可封禁/解封/强制下线）：
  - `update users set "userType"=9 where phone='13800138000';`
- 最小权限运营（仅查询列表/活跃/审计/指标）：
  - 在 `deploy/.env` 设置：`ADMIN_ROLE_MAP=9=OPERATOR,8=SUPPORT`（并 `docker compose ... up -d --build` 重建）
  - `update users set "userType"=8 where phone='13800138000';`

3) 生效方式：让对方在管理后台点击“退出”，再重新登录一次（Redis 会话中的 roles 在登录时生成）。
