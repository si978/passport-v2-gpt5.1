# Passport 统一认证中心 - 管理后台隔离方案审查与变更记录

> 日期：2025-12-19  
> 范围：管理后台隔离（无域名条件）+ 变更依据与可追溯记录

---

## 1) 背景与风险

在域名尚不可用的阶段，若“用户前端”和“管理后台”共用同一个入口（同源、同端口），容易产生：

- **登录态混用风险**：浏览器本地存储（localStorage/sessionStorage）同源共享，管理员更容易在用户入口误用后台身份/令牌。
- **攻击面扩大**：`/admin` UI 与 `/api/admin/*` 更容易被扫描探测；运维侧难以用安全组做到“仅允许白名单访问后台入口”。
- **业务误操作**：缺少“必须从管理入口登录”的强约束，导致后台能力的使用边界不清晰。

本次方案目标是：在**不依赖域名**的前提下，实现“管理后台入口隔离 + token 隔离 + 多层防护”。

---

## 2) 决策记录（Decision）

### 2.1 可选方案

- **A. 独立域名（理想）**：`admin.<domain>` + HTTPS + WAF/白名单（当前域名不可用，无法落地）
- **B. 同域同端口按路径隔离**：`/admin`（同源存储无法隔离，且运维层难做白名单）
- **C. 独立端口 + 独立 app_id + 反代阻断（采纳）**

### 2.2 最终采纳方案（C）

1. **端口隔离**：增加 `admin-frontend`，通过 `ADMIN_PORT` 暴露（与用户前端 `HTTP_PORT` 分离，形成独立 origin）。
2. **app_id 隔离**：管理后台构建时使用 `VITE_APP_ID=ADMIN_APP_ID`（默认 `admin`），使其登录获得的 token 只对 `app_id=admin` 生效。
3. **反代层阻断**：用户前端 Nginx 阻断 `/admin` 与 `/api/admin`，避免用户入口暴露后台 UI 与后台 API。
4. **后端强制校验**：后端 `/api/admin/*` 增加 `ADMIN_APP_ID` 校验（AdminAppGuard），确保必须使用 admin app_id 的 token 才能访问后台接口（防止“管理员在用户入口登录后直接访问后台 API”）。

对应工程层面决策同步记录在：`passport-统一认证中心-多视图冲突与决策清单-已决策.md` 的 **C-08**。

---

## 3) 变更清单（可追溯）

### 3.1 后端（NestJS）

- 新增 `AdminAppGuard`：`dev/backend-node/src/auth/admin-app.guard.ts`
- AdminController 增加 app_id 限制：`dev/backend-node/src/auth/admin.controller.ts`
- Provider 注册与单测：`dev/backend-node/src/auth/auth.module.ts`、`dev/backend-node/src/auth/admin-app.guard.spec.ts`
- 新增配置项说明：`dev/backend-node/.env.example`

关键配置：
- `ADMIN_APP_ID`（默认 `admin`）：后台 `/api/admin/*` 仅接受该 app_id 的 token。

### 3.2 前端与反代（Nginx）

- 用户前端阻断后台路径：`dev/frontend-react/nginx.conf`
  - 阻断 `/admin` 与 `/api/admin`
- 新增管理后台 Nginx 配置：`dev/frontend-react/nginx.admin.conf`
- 新增管理后台镜像构建：`dev/frontend-react/Dockerfile.admin`
  - build-time 设置 `VITE_APP_ID=admin`（可通过 compose build args 覆盖）

### 3.3 部署（Docker Compose）

- 新增 `admin-frontend` 服务与端口：`deploy/docker-compose.yml`
- 新增 `deploy/.env.example` 支持：
  - `HTTP_PORT`（用户前端）
  - `ADMIN_PORT`（管理后台）
  - `ADMIN_APP_ID`
- 文档说明与 ECS 加固建议：
  - `deploy/README.md`
  - `deploy/ECS-HARDENING.md`

---

## 4) 验收要点（无域名场景）

1. 用户前端：`http://<IP>:<HTTP_PORT>/`
   - 访问 `/admin/users` 应返回 404（由用户前端 Nginx 阻断）。
2. 管理后台：`http://<IP>:<ADMIN_PORT>/admin/users`
   - 使用管理员手机号登录（用户表 `userType=9` 或 `ADMIN_USER_TYPES` 配置）。
3. 后端约束：
   - 使用“用户前端入口”登录得到的 token（`app_id != ADMIN_APP_ID`）访问 `/api/admin/*` 应被拒绝（403）。
4. 运维约束（ECS）：
   - 安全组仅对白名单 IP 放行 `ADMIN_PORT`。
   - 若无法固定 IP：可开放 `ADMIN_PORT`，但启用 `ADMIN_BASIC_USER/ADMIN_BASIC_PASS` 对管理入口加 BasicAuth。

---

## 5) 回滚/应急策略

若需要临时回退隔离（不推荐长期使用）：

- 仅后端回退：设置 `ADMIN_APP_ID` 为现有用户前端的 `app_id`（会恢复“同 app_id 可访问后台 API”的旧行为）。
- 完全回退：移除 `admin-frontend` 暴露与用户前端 Nginx 阻断配置（恢复同入口暴露）。

---

## 6) 备注

域名可用后，建议将 `ADMIN_PORT` 迁移为 `admin.<domain>`（HTTPS），并保持 `ADMIN_APP_ID` 机制不变，实现从“端口隔离”平滑升级到“域名隔离”。

---

## 7) 运营同学授权建议（最小权限）

V1 默认所有管理员 userType 都是 `OPERATOR`（可封禁/解封/强制下线）。为避免“给运营就等于给全权限”，本次补充了可选的 role 映射：

- 配置 `ADMIN_ROLE_MAP=9=OPERATOR,8=SUPPORT,7=TECH`（`|` 分隔多角色）
- 将运营同学的 `users."userType"` 设置为 `8`，即可获得只读访问（`/api/admin/users|activity|audit-logs|metrics`），无法调用封禁/解封/强制下线接口。
