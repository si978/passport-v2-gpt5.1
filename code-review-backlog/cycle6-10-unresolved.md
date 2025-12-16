# Passport 统一认证中心 - Cycle6-10 专项审查未解决问题清单（v1.0）

> 依据文档：`code-review/cycle6-10-review.md`
> 说明：本清单仅记录截至本次修复 **仍未在代码中完全落地** 的问题；已完成的修复（如 C6-01、C6-02 部分、C8-01、C8-04、C9-02 等）不再重复。

---

## 1. Cycle6（Token 刷新后端）剩余问题

### C6-02（部分）：刷新日志的统一规范与集中化

- **位置**：`dev/backend-node/src/auth/token.service.ts`
- **当前情况**：
  - 已为 `refreshAccessToken` / `logoutByAccessToken` / `verifyAccessToken` 添加 `Logger` 日志；
  - 日志内容目前为简单文本 + guid/app_id/code 信息，尚未与《日志与审计设计》中的字段规范完全对齐，也未接入集中式日志系统（如 ELK）。
- **后续目标**：
  - 按《日志与审计设计》整理统一的日志结构（operation/result/error_code/trace_id 等）；
  - 在 NestJS 侧引入统一日志封装（拦截器或 Logger 封装），避免各服务自行拼接字符串；
  - 将日志输出与实际收集方案（文件/ELK/云日志服务）打通。

### C6-03：Access Token 中包含 GUID 的安全评估

- **位置**：`dev/backend-node/src/auth/auth.service.ts` 与 `token.service.ts`（`generateAccessToken`）。
- **当前情况**：
  - Access Token 格式为 `A.{guid}.{random}`，以便 `SessionStore.findByAccessToken` 从 token 中直接解析 GUID，实现 O(1) 查询；
  - GUID 目前被视为内部用户标识，前端/中间人可通过 Token 获取 GUID 文本；
  - 尚未对“GUID 暴露是否可接受、是否需额外混淆/加密或改用 JWT”等安全设计做最终评审。
- **后续目标**：
  - 与安全/架构评审确认 GUID 暴露的风险等级与可接受性；
  - 如需隐藏 GUID，可考虑：
    - 改为 `A.{opaqueId}.{random}` 并在 Redis 中维护反向索引；
    - 或采用 JWT，在 payload 中携带 GUID 并由服务端验证签名；
  - 根据最终决策更新 PRD/NFR 与实现，并补充回归测试。

---

## 2. Cycle7（Token 刷新 QA）剩余问题

### C7-01：Redis 故障场景的测试覆盖

- **位置**：测试层（Python/NestJS/E2E）
- **当前情况**：
  - 代码层面已在 TokenService 中通过 try/catch 将 Redis 异常统一为 `ERR_INTERNAL` 并记录日志，基本符合 C-02 决策；
  - 但缺少针对 Redis 故障的专门测试用例（如使用假 Redis 客户端抛出异常并校验错误码与行为）。
- **后续目标**：
  - 在 NestJS Jest 中为 TokenService/SessionStore 增加 Redis 异常路径 UT：模拟 `get/findByAccessToken/put/delete` 抛出错误；
  - 在 Python PoC 或 E2E 测试中模拟 Redis 不可用场景，验证前端/壳层提示“稍后重试”等行为；
  - 将这些用例与 C-02 决策条目进行显式关联。

### C7-02：刷新流程的端到端（E2E）测试

- **位置**：项目全局
- **当前情况**：
  - 对刷新流程的覆盖仍停留在单元测试层面（Python/NestJS），未有 HTTP 级或浏览器级的完整链路测试；
  - Cycle7 DoD 中要求的“端到端自动化测试”尚未落地。
- **后续目标**：
  - 采用 supertest/Playwright/Cypress 等框架，编写涵盖登录→刷新→刷新失败重试→刷新过期等场景的 E2E 测试；
  - 将测试结果集成进 CI，以防止未来更改导致刷新链路退化。

---

## 3. Cycle8（Token 错误处理前端）剩余问题

### C8-02：ERR_ACCESS_EXPIRED 触发壳层刷新流程

- **位置**：`dev/frontend-react/src/api/client.ts` 与未来壳层集成
- **当前情况**：
  - 前端已在 axios 拦截器中处理 `ERR_ACCESS_EXPIRED` / `ERR_ACCESS_INVALID` / `ERR_REFRESH_EXPIRED` / `ERR_REFRESH_MISMATCH` / `ERR_SESSION_NOT_FOUND`，清理本地状态并跳转登录页；
  - 但 DoD 中提出的“若壳层可主动刷新，在 Access 过期时先尝试通过 IPC 请求壳层刷新 Token，再决定是否跳转”尚未实现。
- **后续目标**：
  - 与壳层约定 IPC 接口（如 `auth.refreshTokenRequested`/`auth.refreshTokenResult`）；
  - 在客户端拦截器中，在清理状态和跳转前先尝试调用 IPC 刷新流程，并根据结果决定是否继续留在当前页面；
  - 为该交互逻辑编写前端 UT 与集成测试。

### C8-03：前端 API 层单元测试

- **位置**：`dev/frontend-react/src/api/`
- **当前情况**：
  - 目前尚无针对 axios 拦截器的 UT，无法自动验证各类 `error_code` 下的行为（清理状态、跳转、告警等）。
- **后续目标**：
  - 使用 Vitest + MSW/axios-mock-adapter 编写测试，覆盖：
    - `ERR_ACCESS_EXPIRED/INVALID`、`ERR_REFRESH_EXPIRED/MISMATCH`、`ERR_SESSION_NOT_FOUND` 的统一处理；
    - `ERR_APP_ID_MISMATCH` 弹出“无权限访问”提示；
  - 将这些测试纳入前端 CI 流程。

---

## 4. Cycle9（Token 验证后端）剩余问题

### C9-01：AuthGuard 尚未应用到实际业务路由

- **位置**：`dev/backend-node/src/auth/auth.guard.ts` & 控制器层
- **当前情况**：
  - 已实现 `AuthGuard`，可基于 Authorization Bearer Token 与 `x-app-id`/body.app_id 调用 `TokenService.verifyAccessToken` 并在请求上填充 `req.user`；
  - 但尚未在任何实际路由（如业务服务的受保护接口）上使用该 Guard，当前项目中它仅通过 `auth.guard.spec.ts` 被测试。
- **后续目标**：
  - 为需要鉴权的控制器/路由（例如未来业务模块）添加 `@UseGuards(AuthGuard)`；
  - 如有网关服务，可在网关层统一应用该 Guard；
  - 补充集成测试，验证 Guard 对正常/异常 Token 的处理是否与 `verifyAccessToken` 行为一致。

### C9-03（部分）：验证相关日志的集中化

- **位置**：`dev/backend-node/src/auth/token.service.ts`
- **当前情况**：
  - 已为 `verifyAccessToken` 添加成功/失败日志，但与整体日志规范仍不完全一致（同 C6-02 问题）。
- **后续目标**：
  - 待全局日志规范与采集方案确定后，对 Token 验证相关日志进行结构化与集中管理（见上文 C6-02）。

---

## 5. Cycle10（Token 验证 QA）剩余问题

### C10-01：登录 → 刷新 → 验证的完整端到端测试链路

- **位置**：项目全局
- **当前情况**：
  - 对登录/刷新/验证的测试目前分散在 Python/NestJS 单元测试中，缺少一个横跨三步的端到端场景；
  - Cycle10 DoD 要求“在典型与主要异常场景下验证完整调用链”，尚未实现。
- **后续目标**：
  - 使用 supertest/Playwright/Cypress 编写 E2E：
    1. 调用登录接口获取初始 Access/Refresh Token；
    2. 使用 Refresh Token 调用刷新接口；
    3. 使用新 Access Token 调用验证接口并检查返回 guid/app_id；
    4. 追加错误场景（过期/伪造/app_id 不匹配等）。

### C10-02：前后端联调测试

- **位置**：项目全局
- **当前情况**：
  - 目前主要依赖手工联调验证前端错误处理是否按预期工作（清理状态、跳转、提示文案等），缺少自动化联调测试。
- **后续目标**：
  - 使用浏览器端 E2E（Playwright/Cypress）模拟真实用户操作，从前端发起请求并观察页面跳转、提示文案与后端日志/监控是否一致；
  - 将关键联调场景固化为测试脚本，纳入 CI 周期性执行。

---

> 维护约定：当以上任一问题被设计评审与实现解决后，请在合并时同步更新本文件（标注已解决的 commit/日期或删除条目），以保证 Cycle6-10 相关 backlog 的实时性和可追踪性。
