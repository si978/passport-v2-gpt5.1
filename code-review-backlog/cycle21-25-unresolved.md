# Passport 统一认证中心 - Cycle21-25 专项审查未解决问题清单（v1.0）

> 依据文档：`code-review/cycle21-25-review.md`
> 说明：本清单仅列出 **截至本次修复仍未在代码中完全落地** 的问题；已在本轮实现的修复（如 C22-02、C24-01 部分、C25-01、C25-02 等）不再重复。

---

## 1. Cycle21（验证码前端交互）剩余问题

### C21-01：refresh_token 本地持久化策略的安全折中

- **位置**：`dev/frontend-react/src/features/auth/LoginPage.tsx` 与整体 AuthState 设计。
- **当前情况**：
  - 审查报告建议在登录成功后将 `refresh_token` 写入 `localStorage` 以支持后续刷新/SSO；
  - 由于 SEC-05 决策（降低 XSS 窃取风险），当前前端仅持久化 `guid` 与 `access_token`，不再将 `refresh_token` 存入本地存储；
  - SSO 场景下的刷新能力通过壳层 LocalSession（包含 refresh_token）与 IPC 传递来实现，Web 纯前端暂不依赖本地持久化 Refresh Token。
- **后续目标**：
  - 在安全评审基础上重新评估是否需要为 Web 形态单独保存 Refresh Token（例如改用 HttpOnly Cookie 或加密本地存储）；
  - 如需恢复 Web 端刷新能力，应在不违背 SEC-05 的前提下引入更安全的存储与调用链；
  - 若最终决定完全依赖 SSO/壳层提供 refresh_token，则应在 PRD/设计文档中更新说明，以关闭该审查条目。

---

## 2. Cycle22（验证码发送后端）剩余问题

### C22-01：短信网关集成缺失

- **位置**：`dev/backend-node/src/auth/verification-code.service.ts`。
- **当前情况**：
  - 现阶段仅在内存中生成并保存验证码，代码中保留 `TODO: 集成实际短信网关` 注释；
  - 生产环境用户无法通过真实短信渠道获取验证码。
- **后续目标**：
  - 按目标运营商/第三方服务（如阿里云短信、腾讯云短信等）选型并集成 SDK 或 HTTP API；
  - 在 `sendCode` 中调用实际网关发送短信，并根据网关返回值记录失败计数与告警；
  - 为网关调用添加重试与降级策略，并在 UT/集成测试中覆盖常见错误场景。

---

## 3. Cycle24（后台用户列表前端）剩余问题

### C24-01（剩余部分）：后台权限粒度控制

- **位置**：`dev/frontend-react/src/App.tsx` 与整体权限模型。
- **当前情况**：
  - 本轮已通过 `RequireAuth` 组件对 `/admin/users` 与 `/admin/activity` 路由增加“登录态校验”，未登录用户访问将被重定向到 `/login`；
  - 但尚未在前端区分“普通登录用户”和“管理员用户”，所有持有有效 Access Token 的用户理论上都可访问后台页面（虽然后端已有 AuthGuard 保护）。
- **后续目标**：
  - 一旦后端引入管理员角色/权限字段（例如 `User.isAdmin`），应在前端引入对应的权限上下文或 Guard，仅允许管理员访问后台页面；
  - 将“无权限访问后台”场景的 UX（提示文案、跳转逻辑）与后端错误码/HTTP 状态码对齐。

### C24-02：后台用户列表分页能力

- **位置**：`dev/frontend-react/src/features/admin/UserListPage.tsx` 与后端 `AdminService.listUsers`。
- **当前情况**：
  - 当前实现一次性加载所有用户并在前端展示，用户量增大时可能造成加载延迟与页面卡顿；
  - 后端 AdminService 也未定义分页参数，API 无法按页获取数据。
- **后续目标**：
  - 为 `/admin/users` 增加 `page`/`pageSize` 等分页参数，并在 AdminService 中实现对应查询逻辑；
  - 前端 `UserListPage` 引入分页控件与分页状态管理（当前页、总页数等）；
  - 为大数据量场景编写性能与正确性测试。

### C24-03：后台前端单元测试缺失

- **位置**：`dev/frontend-react/src/features/admin/`。
- **当前情况**：
  - 尚未为 `UserListPage`/`UserActivityPage` 等组件编写前端 UT，无法自动验证筛选、封禁/解封、活动列表加载等行为；
- **后续目标**：
  - 使用 Vitest + React Testing Library 编写组件测试，mock `apiClient` 返回值与错误场景；
  - 将后台前端 UT 纳入 CI。

---

## 4. Cycle25（后台用户查询与封禁后端）剩余问题

### C25-02（剩余部分）：管理员身份识别与操作者信息完备性

- **位置**：`dev/backend-node/src/auth/`（尤其是用户实体与权限模型）。
- **当前情况**：
  - 本轮已通过在 `AdminController` 中读取 `req.user.guid`，并在审计日志中以 `meta.operator` 形式记录封禁/解封/强制下线的操作者 GUID；
  - 但当前用户模型尚未显式区分“管理员用户”和“普通用户”，任何通过 AuthGuard 鉴权的用户都可以调用后台 API（前提是持有有效 Token），管理员身份仍依赖部署/调用约定而非明确的权限字段或策略；
  - 审计日志中仅记录 `operator` GUID，尚未携带更丰富信息（如 IP、渠道、角色）。
- **后续目标**：
  - 在 `User` 实体和相关服务中引入管理员角色/权限字段，并在 AuthGuard 或专门的 AdminGuard 中进行角色校验；
  - 扩展审计日志记录更完整的操作者信息（如 IP、app_id、角色），并与安全/合规要求对齐；
  - 补充针对管理员权限与审计字段的 UT/E2E 测试。

---

> 说明：C22-02（dailyCount 内存清理）已通过在 `VerificationCodeService.sendCode` 中引入按日期自动重置 Map 的逻辑完成；C25-01（后台 API 无权限校验）已通过在 `AdminController` 上应用 `@UseGuards(AuthGuard)` 并在前端统一附带 Authorization + `x-app-id` 头完成基础鉴权能力。
