# Passport 统一认证中心 - 代码审查未解决问题清单（v1.0）

> 目的：记录当前尚未在代码中落地的 code-review 问题，按原始编号（SEC/PRD/PERF/FUNC/TEST/ARCH/LOG）归纳，便于后续迭代时逐项处理。
> 说明：仅列出截至 2025-12-03 **仍未实现或仅部分实现** 的条目；已在代码中修复的内容（如 SEC-02/04、PRD-01/02/04、PERF-01/02 等）不再重复。

---

## 1. 高优先级（阻塞上线 / 需专项规划）

### SEC-01：验证码未接入真实短信网关

- **原始描述**：`VerificationCodeService.sendCode` 仅将验证码写入内存 Map，未调用短信网关；无法在真实环境完成登录/注册。
- **当前状态**：已落地可切换短信网关（Nest）：
  - `dev/backend-node/src/auth/sms-gateway.ts`：`AliyunSmsGateway`（Dypnsapi/SendSmsVerifyCode）/ `HttpSmsGateway` / `ConsoleSmsGateway`；
  - `dev/backend-node/src/auth/verification-code.service.ts`：`sendCode` 生成验证码后会调用 `SmsGateway.sendVerificationCode`；
  - 配置样例：`dev/backend-node/.env.example`；
  - 验收脚本（需后端已启动）：`dev/backend-node/scripts/sms_login_smoke.js`（可用 `npm run smoke:sms`）。
- **影响**：具备真实短信下发能力；仍为内存验证码存储（PoC），多实例/HA 需后续落地 Redis/DB 存储与监控告警。
- **后续行动建议**：
  - 选型并接入短信服务提供方（阿里云/腾讯云/内部短信平台）；
  - 在 `VerificationCodeService.sendCode` 中调用网关 SDK 或 HTTP API；
  - 为发送失败增加重试与告警（结合 Metrics/日志）；
  - 新增集成测试与环境配置（API Key、模板 ID 等），注意安全存储密钥。

### FUNC-01：壳层 / 原生模块未与真实客户端集成

- **原始描述**：`dev/native/`、`dev/shell/` 目前为 Python PoC，实现了 LocalSession/SSO 逻辑，但未与 Electron/C++/C# 等真实客户端整合。
- **当前状态**：本仓库已提供可运行的壳层能力与 IPC 集成落地路径：
  - Python 壳层入口：`dev/shell/shell_entry.py`（启动/登录/刷新/退出 + session.dat 管理）；
  - IPC（stdio JSON 协议）：`dev/shell/ipc_stdio_server.py`（含 `get_session` 联调指令）；
  - Node 一键联调演示（默认带 stub 后端）：`dev/shell/ipc_stdio_demo.js`（可用 `npm run demo:shell`）；
  - Electron 主进程示例：`dev/shell/ipc_electron_spawn_stdio.ts`（spawn Python + 转发 sessionStatus + ipcMain.handle）。
  - Windows DPAPI（字符串版）适配：`dev/shell/dpapi_adapter.py`（DPAPI 失败回退明文，仅用于开发/测试）。
- **影响**：已具备“真实宿主工程接线”的代码与脚本入口；仍需在目标 Electron/C++/C# 壳层工程中完成 IPC/事件桥接与发布流程。
- **后续行动建议**：
  - 针对目标平台落地壳层工程（Electron/C++/C# 等）；
  - 实现基于 DPAPI 的 `read/write/delete_session_file` 并在壳层中调用；
  - 实现刷新调度器与前端通信机制（IPC/WebSocket/消息总线）；
  - 按 PRD 2.4/FL-04/FL-05 衔接 SSO 启动与退出行为。

---

## 2. 中优先级（1–2 个迭代内完成）

### SEC-03：缺少全局/IP 级频率限制（Rate Limiting）

- **原始描述**：登录与验证码发送接口未做 IP / 全局维度限流，存在暴力破解与短信轰炸风险。
- **当前状态**：
  - 已在 `VerificationCodeService` 内对单手机号做 60 秒间隔 + 每日 10 次上限；
  - 仍未在控制器层引入 IP 级或全局限流（如基于 `@nestjs/throttler` 或 Redis 滑动窗口）。
- **后续行动建议**：
  - 引入 `@nestjs/throttler` 或自定义基于 Redis 的限流中间件；
  - 按 IP / IP+手机号 维度对 `sendCode` / `login-by-phone` / `refresh-token` 等接口设置 QPS 与每日上限；
  - 超限时返回 HTTP 429 或 `ERR_CODE_TOO_FREQUENT`，并接入 Metrics/告警。

### FUNC-02：退出登录未清理本地 session.dat（客户端侧）

- **原始描述**：`TokenService.logoutByAccessToken` 仅删除 Redis 会话，没有触发本地 `session.dat` 删除。
- **当前状态**：后端已保证服务端会话删除与审计/登录日志记录；本地文件清理仍交由客户端实现，尚无实际壳层集成。
- **后续行动建议**：
  - 在前端/壳层中约定退出成功后的回调路径，调用原生模块 `delete_session_file()`；
  - 在 QA 用例中补充“退出后重启客户端不应使用旧 session.dat 继续 SSO”场景的集成测试。

### FUNC-03：封禁后未主动踢出已登录用户

- **原始描述**：封禁操作更新 User.status 并删除 Redis 会话，但没有主动通知现有连接，依赖后续请求发现被封禁。
- **当前状态**：
  - 后端封禁逻辑正确，Redis 会话删除 + 封禁错误码返回都已实现；
  - 未实现 WebSocket/推送等实时踢出机制，前端只能在下一次 API 调用时发现封禁状态。
- **后续行动建议**：
  - 设计并实现服务器 → 客户端的实时通知机制（WebSocket/SignalR/自定义长连接）；
  - 封禁时向所有在线客户端推送“封禁事件”，客户端收到后清理本地状态并跳转登录页；
  - 在测试用例中增加“封禁后无操作也会在下一个心跳/轮询中强制退出”的场景。

### FUNC-04：后台管理模块功能不完整

- **原始描述**：后台仅有部分封禁/解封与简单查询，缺少完整的用户列表分页、活跃记录导出等能力。
- **当前状态**：
  - 已实现：用户按状态过滤的列表查询、封禁/解封、`/api/admin/activity` 返回内存 LoginLog 明细；
  - 未实现：分页、复杂筛选（时间窗口、渠道）、导出接口（CSV/Excel）以及前端配套 UI。
- **后续行动建议**：
  - 在 AdminController 中扩展查询参数（分页、时间范围、channel 等）；
  - 增加导出端点（如 `/api/admin/activity/export`），输出 CSV/Excel；
  - 对应前端页面补齐筛选条件与导出按钮，增加 UT/E2E 覆盖。

### TEST-01：React 前端缺少单元测试

- **原始描述**：`dev/frontend-react` 下没有任何 `*.test.tsx` / `*.spec.ts` 文件。
- **当前状态**：前端已可构建，并提供登录页与后台页面骨架，但仍完全依赖手工测试。
- **后续行动建议**：
  - 引入 Vitest + React Testing Library；
  - 为 LoginPage 编写 UT：手机号校验、验证码按钮节流、错误提示分支（含 `ERR_CODE_TOO_FREQUENT`）；
  - 为后台页面编写 UT：用户列表渲染、封禁/解封按钮行为、接口错误处理等。

### TEST-02：缺少端到端（E2E）测试

- **原始描述**：无 Playwright/Cypress 等 E2E 测试覆盖完整用户流。
- **当前状态**：仅有 Python/NestJS 单元测试与少量手工验证，无自动化端到端链路校验。
- **后续行动建议**：
  - 选型 Playwright 或 Cypress；
  - 覆盖场景：登录/注册完整流程、Token 刷新与过期处理、SSO 自动登录（含网吧场景）、退出与封禁效果；
  - 将 E2E 测试集成进 CI 流程。

### ARCH-03：监控指标仅内存存储

- **原始描述**：`MetricsService` 只在进程内累加计数，未接入 Prometheus 等监控系统。
- **当前状态**：已广泛使用 MetricsService（Auth/Admin 控制器 + UT 覆盖），但未暴露 `/metrics` 或对接监控平台。
- **后续行动建议**：
  - 使用 `prom-client` 接入 Prometheus，定义与文档一致的指标（login/refresh/sendCode/redis 错误等）；
  - 通过单独的 `/metrics` 端点或网关导出指标；
  - 在监控平台配置对应 Dashboard 与告警规则。

### ARCH-04：Redis 高可用未配置

- **原始描述**：`AuthModule` 中 Redis 连接使用单实例 URL，未考虑哨兵/集群模式。
- **当前状态**：当前配置适合作为开发/测试环境，但不适用于生产高可用部署。
- **后续行动建议**：
  - 在生产部署配置中使用 Redis Sentinel 或 Cluster；
  - 更新 `SessionStore` 初始化逻辑以支持多种连接模式（单实例/哨兵/集群）；
  - 在架构文档中补充 Redis HA 拓扑与故障切换策略。

### LOG-01：审计日志仅内存存储

- **原始描述**：`AuditLogService` 使用内存数组存储 login/logout/ban/unban 记录，服务重启后丢失。
- **当前状态**：已在 Auth/Admin 控制器中接入审计记录，并有 Jest UT 覆盖行为，但未接入数据库或日志系统。
- **后续行动建议**：
  - 在 DB 设计中补充 AuditLog 表（或复用 LoginLog 表增加操作类型字段）；
  - 将 AuditLogService 改为写入数据库或专用日志系统（如 ELK）；
  - 为后台增加审计查询接口与权限控制。

### LOG-02：日志脱敏策略未落地

- **原始描述**：全局日志可能包含手机号、Token 等敏感信息，缺少统一脱敏策略。
- **当前状态**：尚未引入集中式日志记录组件，对敏感字段未做系统性处理。
- **后续行动建议**：
  - 定义日志格式规范（字段、级别、trace_id 等），明确哪些字段必须脱敏；
  - 在日志输出层（拦截器/中间件）对手机号/Token 做掩码处理；
  - 编写相应 UT/集成测试验证不会输出明文敏感数据。

---

## 3. 低优先级 / 工程化与一致性（可结合重构执行）

### TEST-03：Python 与 NestJS 行为未做“契约测试”对比

- **原始描述**：Python 与 Node 各自有完整 UT，但缺少“同一输入 → 同一输出”的跨语言对比测试。
- **后续行动建议**：
  - 选取关键服务（AuthService/TokenService/LocalSessionValidator/LoginLogService），为其定义一组标准化输入/输出用例；
  - 编写脚本分别调用 Python 与 NestJS 实现，比较响应与错误码是否一致；
  - 将差异反馈到 PRD/实现层，必要时统一行为。

### ARCH-01：Python 与 Node 的重复实现

- **原始描述**：核心认证逻辑在 Python PoC 与 NestJS 中各实现一套，增加维护成本。
- **当前状态**：Python PoC 已在多个 Cycle 中用于设计验证与测试，但生产落地聚焦 NestJS；两者在行为上通过 UT 尽量保持一致。
- **后续行动建议**：
  - 在后续阶段将 Python 实现的“规格价值”沉淀为更系统的文档（例如更细致的 BR/ERR 表格或伪代码）；
  - 明确 Python PoC 的生命周期（例如仅用于 v1 阶段设计验证），并在合适时对仓库做精简；
  - 或通过契约测试持续验证两者一致性。

### ARCH-02：缺少 OpenAPI/Swagger 契约文档

- **原始描述**：NestJS 后端未集成 `@nestjs/swagger`，前后端依赖手工对齐接口定义。
- **后续行动建议**：
  - 引入 `@nestjs/swagger` 并为 Auth/Admin 控制器添加 Swagger 装饰器；
  - 在 `main.ts` 中配置 Swagger UI（仅在 dev/staging 环境开放）；
  - 将生成的 OpenAPI 文档作为前端/测试/第三方集成的单一接口规范来源。

### SEC-05：Refresh Token 存储策略进一步收紧（部分已处理）

- **原始描述**：LoginPage 将 `refresh_token` 写入 `localStorage`，存在 XSS 窃取风险。
- **当前状态**：已移除 `refresh_token` 的 localStorage 存储，仅保留 guid/access_token；仍未引入 HttpOnly Cookie 等更强保护手段。
- **后续行动建议**：
  - 评估改用 HttpOnly Secure Cookie 传递与存储 Refresh Token 的可行性；
  - 在 PRD/NFR 中明确前端 Token 存储策略；
  - 根据最终策略调整前端与后端接口（如设置/刷新 Cookie），并补充安全测试用例。

---

> 维护约定：
> - 每次 code-review 或实现变更消除上述任一条问题后，应同步更新本文件的状态（例如标记为“已解决于 commit/日期”或直接移除条目）；
> - 新增问题请继续沿用原有编号风格（SEC-/PRD-/PERF-/FUNC-/TEST-/ARCH-/LOG-），并在代码审查文档与本 backlog 中双向记录。
