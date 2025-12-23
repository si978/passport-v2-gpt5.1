# Passport 统一认证中心 - 管理后台 UI 优化开发计划（导航栏 + 登录跳转）

> 目标：提升管理后台操作效率与可用性：提供跨页面导航；管理员登录成功后默认进入管理后台操作页（用户列表）。

## 1. 背景与现状

- 当前管理后台页面主要通过路由 ` /admin/users `、` /admin/activity ` 访问，但缺少全局导航，页面间切换依赖手工改 URL。
- 登录页（`/login`）登录成功后默认跳转到 `/`，在管理后台端口/入口下体验不符合预期（应进入后台操作页）。

## 2. 目标（Goals）

1. 管理后台操作页增加导航栏：可一键跳转到其他管理页面（至少：用户列表、活跃明细）。
2. 管理后台授权用户登录成功后：默认跳转到 ` /admin/users `（用户列表）。
3. 提供管理后台默认入口：访问 ` /admin ` 时自动跳转到 ` /admin/users `。

## 3. 范围（Scope）

### 3.1 In Scope

- 前端（`dev/frontend-react`）
  - 新增后台公共布局（`AdminLayout`）：包含导航栏 + 退出登录入口。
  - 路由调整：
    - ` /admin ` → 重定向 ` /admin/users `（默认页面）。
    - ` /admin/users `、` /admin/activity ` 使用同一布局，确保导航一致。
  - 登录跳转策略：
    - 管理后台端（admin portal）登录成功 → 默认 ` /admin/users `。
    - （可选增强）若从某个后台页面被重定向到登录页，登录成功后回跳到原页面。

### 3.2 Out of Scope

- 新增更多管理页面功能（如审计日志 UI、指标 UI）；本计划仅为现有后台页面提供更好的导航与默认落点。
- 全面 UI 重构（样式体系、组件库引入）；本计划以“最小可用改动”为主。

## 4. 设计与实现方案

### 4.1 导航栏（AdminLayout）

- 新增 `AdminLayout` 组件：
  - 顶部导航：
    - “用户列表” → `/admin/users`
    - “活跃明细” → `/admin/activity`
  - 右侧：`LogoutButton`（复用现有退出逻辑）。
- 交互：使用 `NavLink` 高亮当前页（可选）。

### 4.2 路由结构（默认入口 + 统一布局）

- 建议将 `/admin/*` 路由作为一个“受保护的路由分组”：
  - 外层仍使用 `RequireAuth + RequireAdmin` 做访问控制。
  - 内部用嵌套路由复用 `AdminLayout`。
- 增加路由：`/admin`（index）→ `Navigate` 到 `/admin/users`。

### 4.3 登录成功跳转（管理后台默认落点）

- 目标行为：在“管理后台端”登录成功后，落点为 `/admin/users`。
- 方案（推荐最小改动 + 可扩展）：
  1) 登录页读取 `redirect` 参数：`/login?redirect=/admin/users`。
  2) 若无 `redirect` 参数：
     - 管理后台端默认 `/admin/users`
     - 用户端默认 `/`
- 安全约束：`redirect` 仅允许站内相对路径（必须以 `/` 开头、拒绝 `//`、拒绝包含协议的 URL）。

> 备注：已引入 `VITE_PORTAL=admin` 作为管理后台端标识（`Dockerfile.admin` 默认设置）。本地非 Docker 启动若未显式设置 `VITE_PORTAL`，仍会在 `VITE_APP_ID=admin` 时自动判定为 admin portal；如使用自定义 `ADMIN_APP_ID`，请同时设置 `VITE_PORTAL=admin`。

## 5. 任务拆分（Tasks）

### 5.1 代码改动

- [ ] 新增 `AdminLayout`（导航栏 + 退出）。
- [ ] 调整路由：为 `/admin/*` 引入统一布局，并新增 `/admin` → `/admin/users` 的默认重定向。
- [ ] 登录成功跳转：
  - [ ] admin portal：默认 `/admin/users`
  - [ ] user portal：保持默认 `/`
  - [ ] （可选）支持 `redirect` 回跳
- [ ] `RequireAuth/RequireAdmin`：
  - [ ] （可选）在重定向到 `/login` 时携带 `redirect`，保留原目标页面。

### 5.2 测试与验收

- [ ] 前端单元测试（Vitest）：
  - [ ] 登录成功后跳转路径（admin portal / user portal）
  - [ ] 导航栏渲染与跳转（基础 smoke）
- [ ] 手工验证：
  - [ ] admin 端口打开 `/admin/users` 未登录 → 跳转登录 → 登录成功进入用户列表
  - [ ] admin 端口页面内通过导航跳转到活跃明细
  - [ ] 直接访问 `/admin` → 自动进入用户列表

## 6. 验收标准（AC）

1. 管理后台页面存在固定导航栏，可在“用户列表 / 活跃明细”之间互相跳转。
2. 在管理后台端登录成功后，默认进入 ` /admin/users `。
3. 访问 ` /admin ` 时，默认跳转到 ` /admin/users `。
4. 既有权限控制不被削弱：无权限用户无法访问 `/admin/*`。

## 7. 关联文件（预计改动点）

- 路由与布局：`dev/frontend-react/src/App.tsx`
- 登录跳转：`dev/frontend-react/src/features/auth/LoginPage.tsx`
- 权限路由：`dev/frontend-react/src/features/auth/RequireAuth.tsx`, `dev/frontend-react/src/features/auth/RequireAdmin.tsx`
- 管理页面：
  - `dev/frontend-react/src/features/admin/UserListPage.tsx`
  - `dev/frontend-react/src/features/admin/UserActivityPage.tsx`

## 8. 回滚方案

- 本次为前端路由/布局改动：如出现问题，可回滚到“无布局、登录后跳转 `/`”的上一版本（仅影响管理后台使用体验，不影响后端数据）。

## 9. 变更留痕（实施记录）

- 2025-12-22：落地管理后台导航栏与默认登录跳转
  - 导航与布局：新增 `AdminLayout`，统一承载后台导航与退出入口。
  - 路由：`/admin` 默认跳转 `/admin/users`；后台页面使用嵌套路由复用布局。
  - 登录跳转：支持 `redirect` 回跳；管理后台端（`VITE_PORTAL=admin`）登录成功默认进入 `/admin/users`。
  - 验证：`npm test --prefix ./dev/frontend-react`、`npm run build --prefix ./dev/frontend-react` 通过。
  - 上线：见 `deploy/RELEASE-PLAN.md`（上线流程/回滚/脚本）。
  - 相关改动文件：
    - `dev/frontend-react/src/features/admin/AdminLayout.tsx`
    - `dev/frontend-react/src/App.tsx`
    - `dev/frontend-react/src/features/auth/LoginPage.tsx`
    - `dev/frontend-react/src/features/auth/RequireAuth.tsx`
    - `dev/frontend-react/src/features/auth/RequireAdmin.tsx`
    - `dev/frontend-react/src/features/admin/UserListPage.tsx`
    - `dev/frontend-react/src/features/admin/UserActivityPage.tsx`
    - `dev/frontend-react/src/config/appConfig.ts`
    - `dev/frontend-react/Dockerfile.admin`

- 2025-12-22：管理后台展示优化（对齐 Figma 参考稿）
  - 参考：`https://clover-heart-47906949.figma.site/`（管理后台 UI 重设计）。
  - 布局：左侧导航 + 顶部用户栏；后台页面统一卡片/表格/分页样式。
  - 页面：用户列表/活跃明细补齐筛选区、表格样式、分页与导出入口视觉规范。
  - 样式：新增后台专属样式 `admin.css`，并加入全局基础 reset（`global.css`）。
  - 验证：`npm test --prefix ./dev/frontend-react`、`npm run build --prefix ./dev/frontend-react` 通过。
  - 相关改动文件：
    - `dev/frontend-react/src/features/admin/admin.css`
    - `dev/frontend-react/src/features/admin/AdminLayout.tsx`
    - `dev/frontend-react/src/features/admin/UserListPage.tsx`
    - `dev/frontend-react/src/features/admin/UserActivityPage.tsx`
    - `dev/frontend-react/src/features/auth/LogoutButton.tsx`
    - `dev/frontend-react/src/main.tsx`
    - `dev/frontend-react/src/global.css`

- 2025-12-23：上线验证（smoke）与上线脚本留痕
  - Smoke 部署：使用 `deploy/docker-compose.yml` + `deploy/docker-compose.smoke.yml` 启动一套可上线形态（短信 stub 不外发）。
  - 本机端口冲突处理：因 8080 被其它 compose 项目占用，临时使用 `HTTP_PORT=8081`。
  - 验证：`/api/health=200`，`/admin/users=200`；上线留痕记录于 `deploy/RELEASE-PLAN.md`。
  - 上线脚本改动留痕：`deploy/release.ps1` 增强失败检测（检查 `$LASTEXITCODE`）、读取 `deploy/.env` 获取端口、并校验关键 service `running/healthy`。
  - 版本留痕：计划创建 Git tag `release-20251223-admin-portal-ui`（用于本次上线/回滚定位）。
