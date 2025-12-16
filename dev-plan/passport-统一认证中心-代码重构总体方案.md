## Passport 统一认证中心 - 代码重构总体方案（v1）

> 目的：在**不推倒重写**的前提下，系统性重构当前实现，使「Windows 客户端 SSO + Web 前端 + 后端 + 管理后台」形成结构清晰、易维护、可扩展的闭环。
>
> 范围：仅针对本仓库下的 dev/backend-node（NestJS）、dev/frontend-react（React）、dev/tests（Python PoC）与部署脚本，PRD 视为不变的 SSoT。

---

### 1. 重构原则

1. **以用户流程为中心**：优先保证两条主线顺畅、清晰——
   - 客户端登录 + SSO 自动登录 + 串号防护；
   - 管理后台查询 + 审计 + 指标。
2. **小步快跑，保持可运行**：每一轮重构必须保持：
   - Docker compose 能正常启停；
   - `npm run test`（包含 backend Jest + Python UT + frontend Vitest + Playwright E2E）保持绿色；
   - 若需要临时跳过某些行为，必须在文档中标注「临时方案」。
3. **分层清晰**：前后端统一采用「domain（领域） + infra（基础设施） + api/ui（适配层）」的划分，降低耦合。
4. **严格对齐 PRD/Q/C**：出现设计冲突时，以 `passport-统一认证中心-PRD-草稿.md` 和 Q/C 文档为准，重构只做「实现对齐」，不改需求。

---

### 2. 总体分层设计（目标状态）

#### 2.1 前端（React / Vite）

目录目标结构：

- `src/domain/auth/`
  - `authTypes.ts`：`AuthSession`, `UserProfile`, `SsoStatus`, `SsoEventPayload` 等纯类型定义；
  - `authLogic.ts`：纯函数逻辑，如 `mergeLoginResultToSession`, `shouldForceLogout(code)`；
- `src/infra/`
  - `authGateway.ts`：封装 axios 调用（登录、发码、刷新、退出），统一错误封装为 `AuthError`；
  - `ssoGateway.ts`（抽象自现有 `ssoStartup.ts` + `sessionEvents.ts`）：处理订阅/触发 SSO 事件；
  - `tokenStorage.ts`：统一读写 `guid/access_token/refresh_token/user_type/account_source/roles` 等，隐藏 localStorage/sessionStorage 细节；
- `src/features/`
  - `auth/`：`LoginPage`, `LogoutButton`, `RequireAuth`, `RequireAdmin`, `errorMessages` 等 UI & 守卫组件；
  - `sso/`：`SessionBanner`（展示状态）、`SsoBootstrap`（可嵌入 App 的 SSO 启动组件）；
  - `admin/`：`UserListPage`, `UserActivityPage` 等后台 UI；
- `src/api/client.ts`：axios 实例和拦截器，尽量薄。

#### 2.2 后端（NestJS）

目标是把现有 `AuthService`, `TokenService`, `SessionStore`, `LoginLogService` 等按职责分清：

- `domain` 层（当前散落于 `auth.service.ts`, `token.service.ts`, `services.py` PoC）：
  - 统一行为：登录 / 刷新 / 退出 / 验证 / 封禁 / 解封 / 强制下线；
  - 不依赖 HTTP/Controller/DTO，只接受/返回领域对象。
- `infra` 层：
  - TypeORM：`User`, `LoginLog`, `AuditLog`；
  - Redis：`SessionStore`；
  - Aliyun / HTTP SMS 网关；
  - 日志/审计/指标（MetricsService, AuditLogService）。
- `api` 层：Controller + DTO:
  - 接收 HTTP 请求，做入参校验与转换；
  - 捕获领域异常 `AuthException`，映射为 HTTP 状态码与错误码；
  - 不做复杂逻辑，只调用 domain 层。

#### 2.3 协议层（前后端/客户端约定）

- **登录结果协议**：统一为 `LoginResponseDto` ↔ `LoginResult`：
  - 必含：`guid`, `access_token`, `refresh_token`, `user_status`, `account_source`, `user_type`, `roles`, `access_token_expires_at`, `refresh_token_expires_at`, `expires_in`；
- **SSO 事件协议**：
  - 事件载荷：`{ status: 'sso_available' | 'none', sessionData?: { guid, refresh_token }, reason?: ERR_* }`；
  - 传输通道：
    - `window.dispatchEvent(new CustomEvent(VITE_SESSION_EVENT, { detail }))`；
    - 或 `window.postMessage(detail, '*')`；
    - 或 WebView2 `chrome.webview.postMessage(detail)`；
  - 前端只依赖封装后的 `subscribeSsoEvents(handler)`，而不关心具体通道。
- **错误码协议**：
  - ERR-13 中的主错误码需有统一的用户文案和行为（例如需清空本地会话并强制跳转登录）。

---

### 3. 重构分阶段计划

#### Phase 1：梳理与固化现有行为（已基本完成）

1. Docker 部署链路稳定：postgres/redis/backend/frontend 组合；
2. UT/E2E 全绿：
   - 后端 Jest 覆盖 >80%，核心 auth/token 模块覆盖更高；
   - Python PoC 39 条用例；
   - 前端 Vitest + Playwright（登录/退出/admin/activity）通过；
3. 现有前端修复：
   - token 存储统一；
   - SSO 事件接入；
   - 管理后台与 AuthGuard/RequireAdmin 打通。

> 当前状态：Phase 1 已完成，可作为重构的安全基线。

#### Phase 2：前端认证模块重构（重点）

**目标**：清理前端 auth 相关的散乱逻辑，让 SSO / 登录 / 退出 / 错误处理都经过统一的 domain+infra 层，减少页面级 if/else。

任务拆分：

1. **Domain 建模**
   - 新建 `src/domain/auth/authTypes.ts`：
     - `AuthSession`：`guid/access/refresh/user_status/user_type/roles` 等；
     - `LoginResult`：与后端 DTO 对齐的接口；
     - `SsoStatus`，`SsoEventPayload`，`AuthError`（包含 `code`, `message`）。
   - 新建 `src/domain/auth/authLogic.ts`：
     - `mergeLoginResultToSession(loginResult): AuthSession`；
     - `shouldForceLogout(errorCode: string): boolean`；
     - `isAdminSession(session: AuthSession): boolean`；

2. **Infra 抽象**
   - 新建 `src/infra/authGateway.ts`：
     - `sendCode(phone)`；
     - `loginByPhone(phone, code, appId)`；
     - `refreshWithSso(guid, refresh, appId)`；
     - `logout(accessToken?)`；
     - 所有接口统一抛出 `AuthError`，不在这里弹 `alert` 或导航。
   - 将 `api/auth.ts` 简化为 authGateway 的 re-export（兼容旧引用）。
   - 将 `api/client.ts` 精简为 axios 实例，拦截器只做：
     - 自动附带 Bearer token 与 `x-app-id`；
     - 检测「需要强制下线」的错误码 → 清理 token + 派发 SSO 状态事件。

3. **Token 存储与 Admin 判定**
   - 改造 `features/auth/tokenStorage.ts`：
     - 完全使用 `AuthSession` 作为输入输出；
     - 增加 `getAuthSession()` / `setAuthSession()` / `clearAuthSession()`；
     - 提供 `isAdminSession()`/`getAdminRoles()` 等辅助函数。

4. **UI 层瘦身**
   - `LoginPage`：
     - 不再直接访问 localStorage 或 axios；
     - 调用 `authGateway.loginByPhone` + `tokenStorage.setAuthSession`；
     - 错误处理使用 `errorMessages.ts` + 统一 fallback；
   - `LogoutButton`：
     - 调用 `authGateway.logout` + `tokenStorage.clearAuthSession`；
   - `RequireAuth` / `RequireAdmin`：
     - 仅依赖 `tokenStorage.getAuthSession` 和 `isAdminSession`。

5. **测试与回归**
   - 新增 Vitest：
     - `authLogic.spec.ts`：校验 `mergeLoginResultToSession` 等；
     - `authGateway.spec.ts`：使用 axios mock 验证错误码 → AuthError 映射；
   - 更新现有 `LoginPage.test.tsx`/`LogoutButton.test.tsx` 以使用新的抽象；
   - Playwright 不变，只要 E2E 继续通过即可。

#### Phase 3：SSO 启动与事件体系重构

**目标**：把目前零散的 SSO 处理（App.tsx/ssoStartup.ts/sessionEvents.ts 中的逻辑）收拢成一个明确的 SSO 网关，方便 Windows 客户端接入与后续扩展。

任务拆分：

1. **统一 SSO 事件网关**
   - 新建/完善 `src/infra/ssoGateway.ts`（或合并现有 ssoStartup+sessionEvents）：
     - `subscribeSsoEvents(handler: (payload: SsoEventPayload) => void)`；
     - `emitSsoStatus(payload)`（供 axios 拦截器和 UI 使用）；
     - 内部处理：CustomEvent / postMessage / chrome.webview 消息。

2. **App 入口瘦身**
   - 在 `App.tsx` 中：
     - 使用 `SsoBootstrap` 组件，负责：
       - 在挂载时调用 `subscribeSsoEvents`；
       - 收到 `status='sso_available'` → 调用 `authGateway.refreshWithSso`；
       - 成功 → `tokenStorage.setAuthSession` + 显示成功 Banner；
       - 失败或 `status='none'` → 清理会话 + 显示串号风险 Banner；
     - `App` 只负责渲染 `SessionBanner` 和路由。

3. **串号 & 风险提示强化**
   - 扩展 `SessionBanner`：支持多种状态（info/warning/error）、可选操作按钮（跳登录 / 查看帮助）；
   - 文案对齐 PRD AC-02/FL-04 对串号定义与提示语的要求。

4. **Windows 客户端使用说明**
   - 在 `dev-plan` 下补一份短文档「passport-统一认证中心-SSO集成说明-客户端壳层.md」：
     - 明确壳层需要发送的事件格式；
     - 提供 WebView2 / Chromium Embedded 的示例代码片段；
     - 列出常见错误码与建议的本地行为（如清理 session.dat）。

#### Phase 4：后端认证与会话模型重构

**目标**：让后端 Auth / Token 逻辑更贴近 Python PoC 的“领域实现”，降低框架/基础设施的噪音，同时统一角色判定与日志记录。

任务拆分：

1. **Session 模型扩展**
   - 已为 `Session` 添加 `userType/accountSource/roles`；
   - 确保所有创建/更新 Session 的路径都填充这几个字段（包括后续后台强制下线等）。

2. **角色/管理员判定统一**
   - `user-role.util.ts`：
     - 增加 UT：`isAdminUserType`, `resolveUserTypeLabel`, `resolveAdminRoles`；
     - 通过 `ADMIN_USER_TYPES` 环境变量支持配置后台管理员用户类型；
   - `AuthService.loginByPhone`：
     - 按 userType/accountSource 生成正确的 user_type/roles；
   - `TokenService.refreshAccessToken`：
     - 返回 session 中存储的 user_type/roles，而不是硬编码。

3. **Domain 与 Infra 分割（增量）**
   - 逐步抽取 `AuthService` 中的纯逻辑为独立函数/类（例如 `AuthDomainService`），减少对 TypeORM Repo 的直接依赖；
   - 保持现有 UT 覆盖度，确保不会破坏既有行为。

#### Phase 5：管理后台与可观测性强化

**目标**：确保从后台页面看到的每一条记录都能追溯到明确的领域事件（登录/刷新/退出/封禁等），并与 PRD 的指标要求一致。

任务拆分：

1. **Admin 页面与 API 一致性检查**
   - 检查 `UserListPage`/`UserActivityPage` 显示的字段是否覆盖 PRD DM-04 中定义的关键字段；
   - 检查 `/api/admin/users` 与 `/api/admin/activity` 返回结构与视图文档/DevPlan 对齐。

2. **指标 API 与监控**
   - 确认 `/api/admin/metrics` 覆盖登录成功率、错误率、验证码发送失败率、刷新失败率、Redis 会话错误率等；
   - 在前端可选增加简单监控视图（例如在 Admin 页签中展示关键指标）。

3. **Auditing（审计）对齐**
   - 确认 `AuditLogService` 记录的审计事件（login/logout/ban/unban/sso_login）与 PRD 日志章节一致；
   - 在活动明细页或单独页面提供必要的审计信息视图（可后续迭代）。

---

### 4. 执行方式与你需要做的事

1. 本方案文件位置：`dev-plan/passport-统一认证中心-代码重构总体方案.md`（即当前文件），方便你和我在后续会话中随时引用，不需要反复翻查对话历史。
2. 每进入一个 Phase，我会：
   - 先在这里标记当前执行阶段（例如追加「Phase 2 进度小节」）；
   - 再按拆分的任务逐步修改代码，并保持测试全绿；
   - 在回复中只给你必要的结果摘要和验证方式，不要求你手动跑很多命令。
3. 你可随时调整优先级：
   - 比如先把 SSO + 串号体验做到极致，再动 Admin；
   - 或者先保证所有 Admin 功能平滑运行，再动底层 Session 模型。

---

### 5. 下一步建议

1. 你确认本方案没有明显偏离（特别是对 PRD 的解读和分阶段策略）；
2. 我将从 **Phase 2：前端认证模块重构** 开始，优先把 authGateway/domain/tokenStorage/RequireAuth/RequireAdmin 这一套彻底稳固；
3. 完成 Phase 2 后，再给你一份「auth 模块重构前后对比」简要说明，便于你在 Windows 客户端 SSO 联调时有清晰心智模型。
