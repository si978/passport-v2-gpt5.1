# Release Plan（上线计划）

> 适用范围：`deploy/docker-compose.yml`（生产/可上线形态），以及本仓库的前后端/脚本变更上线。
> 本次上线主题：管理后台 UI 重设计 + 导航/默认落点（见 `dev-plan/passport-统一认证中心-管理后台-导航与登录跳转-开发计划.md`）。

## 1) 变更范围（Scope）

- 管理后台页面 UI：左侧导航 + 顶部用户栏 + 统一卡片/表格/分页样式（对齐 Figma）。
- 登录跳转：管理后台授权用户登录成功后默认进入 `/admin/users`；访问 `/admin` 自动跳转 `/admin/users`。
- 不涉及：数据库 schema 变更、后端接口变更。

## 2) 上线前检查（Preflight）

### 2.1 代码与测试

- 本地/CI 先跑全量：`npm run check:all`
- 确认 `deploy/docker-compose.yml` 校验通过：`docker compose -f deploy/docker-compose.yml config -q`
- 留痕（本次变更自检）：2025-12-23 已跑通 `npm run check:all`

### 2.2 生产配置（必须）

- 准备 `deploy/.env`（参考 `deploy/.env.example`）
- 准备 `sms-config/.env`（不要提交真实密钥）
- 建议生产配置核对：`deploy/ECS-HARDENING.md`

### 2.3 备份与回滚准备（生产强烈建议）

- 记录当前运行版本（commit/hash 或镜像 tag）
- 备份 Postgres（示例）：
  - `docker compose -f deploy/docker-compose.yml exec -T postgres pg_dump -U passport -d passport > backup.sql`

## 3) 上线步骤（Production）

> 在目标服务器（或具备 Docker Engine 的环境）执行。

0. 确认 Docker Engine 可用（Windows 建议先启动 Docker Desktop，并使用“管理员 PowerShell”执行）：  
   - `docker version`
1. 拉取最新代码（若通过 Git 发布）：
   - `git pull`
2. 启动/更新服务（重建前端/后端镜像并滚动替换容器）：
   - `docker compose -f deploy/docker-compose.yml up --build -d --remove-orphans`
3. 等待健康检查：
   - `curl http://127.0.0.1:${HTTP_PORT:-8080}/api/health`
4. 关键验收（人工）：
   - 用户端：`http://<IP>:${HTTP_PORT:-8080}/` 正常；`/admin` 返回 404（隔离验证）。
   - 管理端：`http://<IP>:${ADMIN_PORT:-18081}/admin/users` 正常；
     - 左侧导航可在“用户列表/用户活跃明细”切换；
     - 访问 `/admin` 自动跳到 `/admin/users`；
     - 管理员登录成功默认落点 `/admin/users`。
5. 观察 10–30 分钟：
   - `docker compose -f deploy/docker-compose.yml ps`
   - `docker compose -f deploy/docker-compose.yml logs -f --tail 200 backend`

## 4) 可上线级 Smoke（建议在生产前/灰度前跑）

- `pwsh deploy/smoke.ps1`
  - 说明：使用 `deploy/docker-compose.smoke.yml` 启动短信 stub，避免真实短信外发。
- 或使用一键脚本：`pwsh deploy/release.ps1 -Mode smoke`

## 5) 回滚方案（Rollback）

### 5.1 回滚到上一个 Git 版本

1. `git checkout <previous-commit>`
2. `docker compose -f deploy/docker-compose.yml up --build -d --remove-orphans`

### 5.2 仅回滚前端（需要你有上一个镜像版本/tag）

> 如果你使用镜像仓库发布（非本仓库 build），可切换到上一个 tag 并重启 `frontend` / `admin-frontend`。

## 6) 上线记录（留痕）

| 时间 | 环境 | 执行人 | 版本（commit/tag） | 验收结果 | 备注 |
|---|---|---|---|---|---|
| 2025-12-23 09:49 | smoke（本机） | Codex CLI | release-20251223-admin-portal-ui | 通过：`/api/health=200`，`/admin/users=200` | 本机 8080 已被占用，临时使用 `HTTP_PORT=8081` |
| 2025-12-23 10:06 | prod（本机 / passport-prod） | Codex CLI | release-20251223-admin-portal-ui | 通过：`/api/health=200`，用户端 `/admin=404`，管理端 `/admin/users=200` | 新增并启动 `admin-frontend`（`ADMIN_PORT=18081`） |
