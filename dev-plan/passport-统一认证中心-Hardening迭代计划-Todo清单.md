# Passport 统一认证中心 - Hardening 迭代计划 & 待办清单（v1.0）

> 目的：把 `code-review-backlog/` 中的未解决问题收敛为 **可执行的 Hardening 迭代计划**，并以 Todo 清单形式跟踪进度。
> 说明：本清单按 Hardening 迭代分组（H1/H2/H3...），每条任务使用 `- [ ]`/`- [x]` 标记完成状态，可随着实现进展持续更新。

---

## 一、Hardening 概览

- 主要来源：`code-review-backlog/code-review-unresolved.md` 及各 Cycle backlog（如 `cycle26-30-unresolved.md`, `cycle31-35-unresolved.md`）。
- 当前整体目标：
  - 在 **不扩展主要业务功能** 的前提下，提升系统的安全性、可观测性、可测试性以及生产可用性；
  - 为后续接入真实客户端壳层与生产部署打好基础。

Hardening 迭代分组（建议）：

- **H1：安全 & 基础设施 Hardening**（SEC/LOG/ARCH 高优）
- **H2：可观测性 & 测试 Hardening**（ARCH/TEST）
- **H3：客户端壳层 & 退出/封禁体验 Hardening**（FUNC/SEC）

---

## 二、H1 — 安全 & 基础设施 Hardening

### H1-01 验证码短信网关接入（SEC-01）

- [x] 抽象短信网关接口 `SmsGateway`，新增默认实现 `ConsoleSmsGateway`（开发环境脱敏日志输出）。
- [x] 在 `VerificationCodeService` 中注入可选 `SmsGateway`，在生成验证码后调用 `sendVerificationCode(phone, code)`。
- [ ] 选型并接入真实短信服务提供方（阿里云 / 腾讯云 / 内部短信网关）：
  - [ ] 新增 `AliyunSmsGateway` 或公司内部实现，基于配置读取 AK/SK、签名、模板 ID 等。
  - [ ] 为网关调用失败增加清晰错误处理与 Metrics 计数（发送失败次数）。
  - [ ] 在不同环境（dev/stage/prod）通过环境变量切换 Console / Real 实现。
- [ ] 编写集成测试（或预发验证脚本）验证真实短信下发与错误场景。

---

### H1-02 登录与验证码频率限制（SEC-03）

- [x] 手机号维度：`VerificationCodeService` 已实现单手机号 60 秒间隔 + 每日 10 次上限。
- [x] IP 维度：在 `VerificationCodeService.sendCode(phone, ip?)` 中新增按 IP 的 60 秒滑动窗口限流（每 IP 每分钟最多 30 次），`AuthController.sendCode` 传入 `req.ip`。
- [ ] 登录接口限流：
  - [ ] 为 `/api/passport/login-by-phone` 增加 IP / IP+手机号 限流（可复用当前 IP 窗口逻辑或接入 `@nestjs/throttler`）。
  - [ ] 为 `/api/passport/refresh-token` / `/:guid/refresh-token` 增加适当 QPS 限制，防止暴力刷新攻击。
- [ ] 限流错误路径统一：
  - [ ] 对所有限流场景统一使用 HTTP 429 + `ERR_CODE_TOO_FREQUENT`（或专门的限流错误码）。
  - [ ] 为限流触发增加 Metrics 计数与告警（如 `rate_limit_exceeded_total`）。

---

### H1-03 日志安全 & 脱敏策略（LOG-02）

- [x] 在短信网关实现中对手机号与验证码做初步脱敏（`ConsoleSmsGateway`）。
- [ ] 梳理后端日志输出路径：`TokenService`、`AuthService`、`AuthGuard` 等所有使用 `Logger` 的位置。
- [ ] 定义统一的日志脱敏规则：
  - [ ] 手机号：仅保留前 3 位 + 后 4 位（如 `138****8000`）。
  - [ ] Access/Refresh Token：仅保留前后若干字符或 hash，不输出完整值。
  - [ ] 其他敏感字段（IP、错误描述）按安全规范处理。
- [ ] 实现集中式日志封装或拦截器，对敏感字段统一掩码后再输出。
- [ ] 为典型日志场景（登录失败、刷新失败、Redis 异常等）编写 UT，断言不会输出明文敏感信息。

---

### H1-04 审计日志与登录活跃记录持久化（LOG-01, C35-01）

- [ ] 设计数据库表结构：
  - [ ] `audit_logs`：记录 login/logout/ban/unban/sso_login、operator、时间及 meta。
  - [ ] `login_logs`：记录 guid/phone/login_at/logout_at/channel/ip/success/error_code。
- [ ] 将 NestJS 内存版 `AuditLogService` 与 `LoginLogService` 扩展为：
  - [ ] 生产环境写入数据库（TypeORM Repository）；
  - [ ] 测试环境仍可配置使用内存实现，保持 UT 简洁。
- [ ] 更新 `AdminService.listActivity` 使其从 DB 分页查询，并支持现有筛选条件（phone/start/end/channel）。
- [ ] 为新的持久化路径补充 Jest UT / 集成测试，确保重启服务不会丢失日志。

---

### H1-05 Redis 高可用支持（ARCH-04）

- [x] 在 `AuthModule` 的 `REDIS` provider 中增加 Sentinel 模式支持：
  - [x] 通过 `REDIS_SENTINELS`（`host:port,host:port`）与 `REDIS_MASTER_NAME` 配置哨兵节点与主节点名；
  - [x] 无该环境变量时保留原有 `REDIS_URL` 单实例行为。
- [ ] 在部署/运维层面完成 Redis Sentinel 的实际部署与配置验证（不在本仓库内实现，仅在说明中记录）。
- [ ] 视需要扩展对 Redis Cluster 模式的支持，并在配置文档中补充示例。

---

## 三、H2 — 可观测性 & 测试 Hardening

### H2-01 Prometheus 指标导出（ARCH-03）

- [x] 已有 MetricsService：记录登录成功/失败、验证码发送失败、刷新失败、退出成功。
- [x] 新增 `MetricsController`，提供 Prometheus 文本端点：
  - [x] `GET /api/metrics` 返回 `text/plain; version=0.0.4`，包含 `passport_*_total` 计数器。
  - [x] 编写 `metrics.controller.spec.ts` UT 验证文本格式与数值。
- [ ] 在实际环境中配置 Prometheus 或等效监控系统抓取 `/api/metrics`（部署/运维侧）。
- [ ] 设计基础 Dashboard 与告警规则（如登录失败率、验证码异常率、刷新失败率等）。

---

### H2-02 前端单元测试体系（TEST-01）

- [x] 引入 Vitest + React Testing Library + jsdom：
  - [x] `package.json` 中将 `npm test` 切换为 `vitest`；
  - [x] 新增 `vitest.config.ts` 与 `vitest.setup.ts`（集成 `@testing-library/jest-dom`）。
- [x] 已实现的关键 UT：
  - [x] `LoginPage.test.tsx`：手机号格式校验、调用 `sendCode`、`ERR_CODE_TOO_FREQUENT` 友好文案；
  - [x] `UserListPage.test.tsx`：加载用户列表、点击“封禁”触发 `/admin/users/:guid/ban`；
  - [x] `UserActivityPage.test.tsx`：初始加载活跃数据、填入筛选条件并点击“查询”触发 `/admin/activity` 请求。
- [ ] 扩展前端 UT 范围：
  - [ ] Login 流程中登录失败错误码映射（`ERR_CODE_INVALID/EXPIRED/USER_BANNED`）。
  - [ ] SSO 自动登录失败提示（`ssoStartup.ts` 相关逻辑）。
  - [ ] LogoutButton 行为（调用 `/passport/logout` + 清理 localStorage）。

---

### H2-03 端到端（E2E）测试基础设施（TEST-02）

- [ ] 选型并搭建 E2E 测试框架（Playwright 或 Cypress）：
  - [ ] 搭建基础项目结构与运行脚本（本地 + CI）。
- [ ] 首批 E2E 用例（建议）：
  - [ ] 手机号登录成功路径：输入手机号+验证码 → 登录成功 → Home 页展示/重定向；
  - [ ] 验证码错误路径：错误码 → 显示对应错误文案；
  - [ ] 退出路径：点击“退出登录” → 会话删除 & 跳转登录页；
  - [ ] 管理员进入后台 → 封禁/解封用户 → 列表状态变化。
- [ ] 后续可扩展：
  - [ ] SSO 自动登录（有壳层模拟时）；
  - [ ] 封禁后在下一个心跳/请求中强制退出。

---

## 四、H3 — 客户端壳层 & 退出/封禁体验 Hardening

### H3-01 壳层 / 原生模块与真实客户端集成（FUNC-01/FUNC-02）

- [ ] 明确目标壳层技术栈（Electron / Win32 WebView2 / C# / C++ 等），新建对应客户端工程。
- [ ] 将 Python PoC 中的 LocalSession/SSO 设计迁移到真实壳层：
  - [ ] 基于 DPAPI 的 `read/write/delete_session_file`；
  - [ ] 启动时 SSO 决策逻辑（VALID / CORRUPTED / EXPIRED_LOCAL 等分支）；
  - [ ] 与前端的 IPC 协议（`sso_available` + `{ guid, refresh_token }` 数据载荷）。
- [ ] 在前端 `ssoStartup.ts` 中与壳层 IPC 集成，完成 SSO 自动登录闭环。
- [ ] 在退出/封禁流程中，与壳层约定并实现本地 `session.dat` 删除（FUNC-02）。

---

### H3-02 封禁后主动踢出在线用户（FUNC-03）

- [ ] 设计后端 → 客户端实时通知通道（WebSocket/SignalR/自定义长连接/壳层 IPC）：
  - [ ] 定义封禁事件 payload（guid/原因/时间等）。
- [ ] 在 `AdminController.banUser` 逻辑中触发封禁事件通知：
  - [ ] 封禁成功时：发出“封禁事件”，客户端收到后清理本地状态并跳转登录页。
- [ ] 在客户端/前端添加对应的事件处理逻辑，并补充相应 UT/E2E 用例。

---

## 五、低优先级 / 工程化与一致性任务（H4 以后）

### ARCH-01 / TEST-03：Python 与 NestJS 行为契约测试

- [ ] 为关键服务定义统一的输入/输出用例（AuthService/TokenService/LocalSessionValidator/LoginLogService）。
- [ ] 编写脚本分别调用 Python PoC 与 NestJS 实现，比较响应与错误码是否一致。
- [ ] 对差异进行归档：
  - [ ] 若为 PRD 设计差异 → 补齐文档与行为；
  - [ ] 若为暂时允许的不一致 → 在文档中注明理由与影响范围。

---

### ARCH-02：OpenAPI/Swagger 契约文档

- [ ] 引入 `@nestjs/swagger`：
  - [ ] 在 `AuthController` 与 `AdminController` 上添加基本 Swagger 装饰器；
  - [ ] 在 `main.ts` 中为 dev/stage 环境提供 Swagger UI（生产环境关闭或限权）。
- [ ] 将生成的 OpenAPI JSON 作为前端/测试/第三方集成的接口单一真相源。

---

### SEC-05：Refresh Token 存储策略进一步收紧

- [x] LoginPage 已移除 `refresh_token` 的 localStorage 存储，仅保留 `guid/access_token`。
- [ ] 评估使用 HttpOnly Secure Cookie 存储刷新 Token 的可行性，并在 PRD/NFR 中固化方案。
- [ ] 若采用 Cookie 策略：
  - [ ] 调整后端刷新接口为设置/更新 Cookie；
  - [ ] 前端移除对 Refresh Token 的显式管理；
  - [ ] 补充对应安全测试用例与文档说明。

---

> 使用约定：
> - 每次完成或修改上述任一条任务后，请同步更新本清单（将 `- [ ]` 改为 `- [x]`，或补充子任务说明）。
> - 新增 Hardening 需求时，继续沿用 H1/H2/H3/H4 的分组方式，便于与现有迭代规划对齐。
