## Passport 前端修复方案（登录 / SSO / 管理端）

> 目的：针对当前前端实现与 PRD v1.1（SSoT）之间存在的差距，形成可执行的修复路线，明确交付目标、实现路径与验证方式。待本方案评审通过后再实施代码改动。

### 1. 背景与现状

部署验证显示 React 前端已可启动，但与 PRD / 工程视图要求仍存在多处偏差：

1. **SSO 自动登录缺失**：壳层按 FL-04/FL-05 下发 `session.status` 后，前端未订阅/调用 `handleSessionStatus`，导致客户端无法完成“自动刷新+2 小时阈值”流程。
2. **Token 存储与守卫不一致**：`LoginPage` 将 token 写入 `sessionStorage`，而 `RequireAuth` 仅检查 `localStorage`，登录后访问后台仍被重定向。
3. **后台访问缺少角色鉴权**：PRD BR-02/BR-07 约定管理员角色才能操作封禁/活跃查询，当前守卫只看 token 是否存在。
4. **app_id 硬编码**：登录/SSO/API Client 使用不同的硬编码值（`jiuweihu` / `youlishe`），与多入口场景不符，且无法根据部署环境配置。
5. **Session 状态 & 网吧提醒缺失**：PRD AC-02 要求在串号风险或 Refresh 失败时给出明确提示，当前仅 `alert` 并跳转。
6. **错误码覆盖不足**：登录页面只映射 3 种错误，无法满足 PRD 13 章对常见错误的提示要求。

### 2. 修复目标

- **G1**：浏览器加载时能够接收壳层发送的 `session.status` 事件；当状态为 `sso_available` 时自动调用 SSO 刷新接口，失败时展示串号风险提示。
- **G2**：登录成功后，Access Token / Refresh Token / GUID 的存储位置与路由守卫一致，并支持后续 SSO 刷新复用。
- **G3**：后台路由新增 `RequireAdmin`，基于后端返回的 `user_type` 或 `roles` 判定，仅管理员可访问 `/admin/*`。
- **G4**：app_id、SSO 默认 app、短信/验证码提示等前端常量改为统一配置（.env / runtime 配置），并在 Axios 拦截器、登录、SSO 中一致使用。
- **G5**：新增 Session 状态提示组件（例如页面顶部 Banner），在壳层回传 `status: 'none'` 或 Refresh 失败时展示“需要重新登录/下机后清理”等说明。
- **G6**：登录页面补充 PRD ERR-13.x 中至少 8 个核心错误码的提示文案，并提供默认兜底。

### 3. 拆解与实现步骤

| 步骤 | 内容 | 关键点 |
| --- | --- | --- |
| S1 | **SSO 事件总线**：在 `App.tsx` 或入口 `main.tsx` 中监听壳层（`window`）发出的 `sessionStatus` 自定义事件（约定 payload 含 status + sessionData），调用 `handleSessionStatus`。 | 避免多次触发；提供测试 Hook。 |
| S2 | **Token 管理统一**：新增 `tokenStorage.ts`，封装 read/write/clear；`LoginPage`、`LogoutButton`、`RequireAuth`、Axios 拦截器全部改用该模块，并确保 Access Token 长期存 `localStorage`，Refresh Token 存 `localStorage`（或必要时加密）。 | 需兼容已有 `sessionStorage` 旧值，首登录后迁移。 |
| S3 | **Admin 权限守卫**：后端登录响应已包含 `user_type`（根据 Python PoC），前端登录后存储 `user_type`；新增 `RequireAdmin` 组件检查 `user_type === 'admin'`，否则重定向 + 提示。 | 若后端暂缺字段，需同步补充 API。 |
| S4 | **配置抽象**：创建 `config/appConfig.ts`，从 `import.meta.env` 读取 `VITE_APP_ID`, `VITE_SSO_APP_ID`, `VITE_SHOW_SESSION_WARNING` 等；所有 API 调用引用该配置。 | Vite 支持 `.env.local`，方便环境切换。 |
| S5 | **Session 提示组件**：实现 `SessionBanner`，接受 `status` 和 `lastError`；当壳层告知 `status='none'` 或客户端刷新失败时展示醒目提示，可附“重新登录”按钮。 | UX 与 PRD AC-02 对齐，文案参考 Q-18 定义。 |
| S6 | **错误码映射完善**：扩展 `LOGIN_ERROR_MESSAGES`（如 `ERR_USER_DELETED`, `ERR_SESSION_NOT_FOUND`, `ERR_APP_ID_MISMATCH`, `ERR_REFRESH_EXPIRED` 等），并在 Axios 拦截器统一提示（例如 toast/Banner），保证需求覆盖。 | 维护单独的 `errorMessages.ts`，便于复用。 |

### 4. 验证策略

1. **单元测试**：为 `tokenStorage`、`RequireAdmin`、`SessionBanner`、`handleSessionStatus` 增补 Vitest/React Testing Library 测试，验证事件触发、权限判断、错误提示逻辑。
2. **手工联调**：
   - 启动 Docker 环境，使用 `docker compose exec backend` 制造不同错误码响应（可通过 Postman）。
   - 模拟壳层事件：在浏览器控制台执行 `window.dispatchEvent(new CustomEvent('sessionStatus', { detail: { status: 'sso_available', sessionData: {...} } }))`，观察自动登录与提示。
3. **验收对齐**：以 PRD FL-04/FL-05/BR-02/BR-07/ERR 章节为准，逐条打勾，确保串号提示、权限控制、错误提示等均满足。

### 5. 风险与依赖

- **后端字段依赖**：若登录响应尚未返回 `user_type`，需要后端在 `/passport/login-by-phone` 输出；否则 `RequireAdmin` 无法判断。
- **壳层事件协议**：需与客户端壳层约定事件名与数据格式（建议复用视图 2 文档中的 `session.status` 结构）。
- **本地存储安全**：将 Access/Refresh Token 放在 `localStorage` 需评估 XSS 风险，必要时结合 Content Security Policy 与 httpOnly Cookie；本方案暂遵循现有架构，长期可考虑安全增强。

### 6. 下一步

1. 评审本方案，确认需求与实现思路。
2. 依据 S1~S6 顺序提交代码，附带测试与手工验证记录。
3. 若评审过程中新增需求（例如多语言、UX 设计细化），在方案中追加章节更新。

---

## 附录：第二轮对齐待办（2025-12-09）

在第一轮改造后，仍发现以下差距，需要追加一轮修复。为避免遗漏，这里单列 Second Pass 计划。

### A. 现状问题

1. **管理员身份识别不可靠**：登录响应未返回明确 `admin_role`/`user_type`，前端暂以 `account_source === 'admin'` 推断，既可能放错权限，也导致普通账号访问 `/admin` 时 e2e 无法正确模拟。
2. **SSO 事件协议需与壳层对齐**：当前仅监听默认的 `sessionStatus` 事件，字段名假设 `detail: { status, sessionData }`。需要确认是否需要兼容 `window.chrome.webview`/`postMessage` 等多种通路。
3. **错误码文案仍不完整**：尚未覆盖 `ERR_REFRESH_MISMATCH`、`ERR_ACCESS_EXPIRED`、`ERR_REFRESH_EXPIRED` 等在 PRD ERR-13 表中明确要求的提示；Axios 拦截器的默认提示也未统一。
4. **SSO 失败提示弱**：`SessionBanner` 只是简单文本，缺少 PRD AC-02/FL-04 所需的“下机提醒”和具体操作指引。
5. **E2E 测试基线更新**：Playwright 脚本仍按旧逻辑在 `sessionStorage` 检查 token、且未注入管理员角色，导致 e2e 无法通过。

### B. 第二轮实施步骤

| ID | 任务 | 说明 |
| --- | --- | --- |
| B1 | 与后端确认登录响应字段，新增 `roles` 或 `is_admin`，前端 `tokenStorage` 真实保存该信息，`RequireAdmin` 以此判定 | 若短期难改后端，可在前端 mock 管理员配置，仅用于联调/测试 |
| B2 | 抽象 `sessionStatus` 适配器，兼容自定义事件 / `window.chrome.webview.postMessage` / 轮询接口，确保壳层能触发自动登录 | 需要与视图 2 团队对齐协议文档 |
| B3 | 扩展 `errorMessages.ts` 与 Axios 拦截器，覆盖 ERR-13 表中所有主错误码，并在 Banner/Toast 中复用 | 结合 PRD 文案，避免“登录失败：ERR_xx”的生硬提示 |
| B4 | 强化 `SessionBanner`：支持操作按钮（立即登录 / 了解串号风险），并在串号风险时展示 PRD AC-02 提醒 | 可考虑引入简单的 UI 库或模块化样式 |
| B5 | 更新 `dev/frontend-react/e2e/*.spec.ts`，让脚本通过 `localStorage` 注入 token/角色，并新增 “普通账号访问 admin 会被拦截” 的断言 | 确保 CI e2e 恢复绿色 |

### C. 验证

1. 单元测试覆盖 `RequireAdmin`、`SessionBanner` 新逻辑；
2. 本地模拟壳层事件（含错误情况）验证自动登录；
3. Playwright e2e 回归通过；
4. 对照 PRD ERR-13 与 AC-02/FL-04 checklist，再次自查打勾。
