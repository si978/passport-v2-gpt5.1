# Deploy（可上线形态）

本目录提供“前端 Nginx + 后端 NestJS + Postgres + Redis”的一键部署方案，并补齐空库初始化与健康检查。

## 1) 生产/线上部署（真实短信）

1. 配置短信与密钥（不要提交真实密钥到仓库）：
   - 复制 `sms-config/.env.example` → `sms-config/.env`
   - 填写以下二选一：
     - 阿里云 Dypnsapi：`ALIYUN_ACCESS_KEY_ID/ALIYUN_ACCESS_KEY_SECRET/ALIYUN_SMS_SIGN_NAME/ALIYUN_SMS_TEMPLATE_CODE`（或兼容变量 `ALI_SMS_*`）
     - 或自建 HTTP 短信网关：`SMS_GATEWAY_URL`（可选 `SMS_GATEWAY_KEY`）
2. 启动：
   - `docker compose -f deploy/docker-compose.yml up --build -d`
3. 验收：
   - 前端：`http://127.0.0.1:8080/`
   - 健康检查：`http://127.0.0.1:8080/api/health`
   - Metrics（Prometheus 文本）：`http://127.0.0.1:8080/api/metrics`

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
