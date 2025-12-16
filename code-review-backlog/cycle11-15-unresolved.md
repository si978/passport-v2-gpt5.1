# Passport 统一认证中心 - Cycle11-15 专项审查未解决问题清单（v1.0）

> 依据文档：`code-review/cycle11-15-review.md`
> 说明：本清单仅列出 **截至本次修复仍未在代码中完全落地** 的问题；已在本轮中完成的修复（如 C11-01/C11-03/C12-01/C12-02/C13-01/C13-02/C14-01/C15-01/C15-02 等）不再重复。

---

## 1. Cycle11（前端 SSO 自动登录）剩余问题

### C11-02：SSO app_id 的配置化与多应用协同策略

- **位置**：`dev/frontend-react/src/features/sso/ssoStartup.ts`
- **当前情况**：
  - 已将原来的硬编码 `SSO_APP_ID = 'youlishe'` 调整为 `DEFAULT_SSO_APP_ID`，并在 `handleSessionStatus` 中通过第三个参数 `appId` 允许调用方注入实际的应用标识；
  - 但当前项目中尚无真实调用方（壳层或前端入口）按环境/应用类型传入不同的 `appId`，也未与多应用场景的配置中心打通。
- **后续目标**：
  - 在真实壳层/前端入口中，基于运行环境（如网吧客户端/普通客户端）显式传入对应的 `appId`；
  - 若存在多种应用（如“游离社/九尾狐”等），需要在配置层面定义 app_id → 文案/路由 等映射关系，避免在业务代码中分散判断；
  - 更新相关 PRD/配置文档，明确不同部署环境下的 SSO app_id 约定。

### C11-04：前端 SSO 行为单元测试缺失

- **位置**：`dev/frontend-react/src/features/sso/ssoStartup.ts`
- **当前情况**：
  - 尚未为 `handleSessionStatus` 编写 Vitest 等单元测试；
  - Cycle11 DoD 中关于“各分支行为（sso_available/none、sessionData 缺失、刷新成功/失败）需通过单测验证”的要求尚未覆盖。
- **后续目标**：
  - 引入前端测试框架（推荐 Vitest + jsdom），mock `refreshWithSso`/`window.location.href`/`alert` 等；
  - 为以下路径编写 UT：
    - `status !== 'sso_available'` 时不做任何跳转；
    - `sessionData` 缺失或字段不完整时跳转登录页；
    - 刷新成功时更新 `access_token` 并跳转主页；
    - 刷新失败时弹出“自动登录失败，请重新登录”并跳转登录页；
  - 将前端 UT 纳入 CI。

---

## 2. Cycle12（壳层启动 LocalSession 检查）剩余问题

### C12-03：与真实壳层工程的集成

- **位置**：`dev/shell/sso_startup.py` 以及目标壳层（Electron/C++/C# 等）工程。
- **当前情况**：
  - Python 版 `SsoStartupHandler` 已具备完整的决策逻辑和 UT 覆盖（包括 `VALID/CORRUPTED/EXPIRED_LOCAL`、解密失败、网吧串号等场景）；
  - 但尚未在实际壳层项目中实现同等逻辑，也未与前端 IPC 通道正式对接。
- **后续目标**：
  - 在目标壳层技术栈中实现等价的 LocalSession 读取/解密/校验/删除与状态广播逻辑；
  - 定义与前端的 IPC 协议（事件名、payload 结构），并确保与 `handleSessionStatus(status, sessionData)` 的签名保持一致；
  - 为真实壳层逻辑补充集成测试或端到端测试，验证启动时 SSO 行为符合 PRD 与 PoC 设计。

---

## 3. Cycle13（原生模块 LocalSession）剩余问题

> 说明：C13-01/C13-02 已在本轮中完成（DPAPI 失败警告日志、`refresh_token` 纳入必填字段校验），此处无新增未完成项。

---

## 4. Cycle14（后端 SSO 刷新支持）剩余问题

> 说明：C14-01 已通过在 `TokenService.refreshAccessToken` 中调用 `AuditLogService.recordSsoLogin` 完成，审计日志会记录 `type='sso_login'`、`guid` 与 `appId`，此处无新增未完成项。

---

## 5. Cycle15（SSO 与网吧串号防护测试）剩余问题

### C15-03：前后端联调与端到端 SSO 测试

- **位置**：项目全局（前端 + 壳层 + 后端）。
- **当前情况**：
  - Python PoC 层面已通过 `test_sso_startup_cycle12_15.py` 新增网吧串号与损坏 LocalSession 的测试；
  - 但尚未有真正跨前端/壳层/后端的端到端 SSO 测试脚本，无法自动验证 UI 层行为（如自动跳转、错误提示）与后端日志/审计记录是否一致。
- **后续目标**：
  - 选型浏览器级 E2E 测试框架（Playwright/Cypress），并结合模拟壳层 IPC 的方法，编写完整 SSO 流程测试：
    - 正常 SSO 自动登录；
    - LocalSession 缺失/损坏/超时场景；
    - 网吧串号场景（A 下机后 B 启动不应进 A 账号）；
  - 将这些测试纳入 CI，作为 SSO 相关改动的回归防线。

---

> 维护约定：当以上任一问题被设计评审与实现解决后，请在合并时同步更新本文件（标注已解决的 commit/日期或删除条目），以保证 Cycle11-15 相关 backlog 的实时性和可追踪性。
