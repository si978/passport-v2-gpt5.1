# Passport 统一认证中心 - Cycle1-5 专项审查未解决问题清单（v1.0）

> 依据文档：`code-review/cycle1-5-review.md`
> 说明：本清单仅列出 **截至本次修复仍未在代码中完全落地** 的问题；已修复的条目（如 C1-01/C1-04 的部分内容、C2-01、C5-04 等）不再重复。

---

## 1. Cycle1（前端登录页）剩余问题

### C1-02：未使用全局 AuthState 状态管理

- **位置**：`dev/frontend-react/src/`（整体架构）
- **当前情况**：
  - 登录成功后仍通过 `localStorage` 写入 `guid` / `access_token`；
  - 没有统一的 React Context / 状态管理（如 Zustand）抽象出 `AuthState`；
  - 其他组件无法响应式感知登录状态变化，刷新 Token / 退出等操作也缺乏集中管理点。
- **后续目标**：
  - 设计 `AuthState` 接口（如 `{guid, accessToken, refreshToken?, userStatus?, sessionStatus?, appId}`）；
  - 使用 Context 或轻量状态库实现全局认证状态容器；
  - 将 `LoginPage`/后台页面/SSO 启动逻辑统一迁移到该状态容器上，减少直接操作 `localStorage` 的散点逻辑。

### C1-03：前端单元测试缺失

- **位置**：`dev/frontend-react/` 整体
- **当前情况**：
  - 项目无任何 `*.test.tsx` / `*.spec.tsx` 文件；
  - Cycle1/4 DoD 中要求对手机号校验、验证码发送按钮倒计时、错误码提示等关键逻辑进行 UT 覆盖尚未落实。
- **后续目标**：
  - 引入 Vitest + React Testing Library；
  - 为 `LoginPage` 编写单测，覆盖：
    - 手机号格式校验（含 `ERR_PHONE_INVALID` 场景）；
    - 60 秒倒计时行为与按钮禁用逻辑；
    - 登录时错误码映射到友好文案的分支；
  - 将前端 UT 集成进 CI 流程，作为每次变更的回归检查项。

---

## 2. Cycle2（登录后端）剩余问题

### C2-02：注销用户登录应“保留历史记录”的实现策略

- **位置**：`dev/backend-node/src/auth/auth.service.ts` 注销用户分支；数据库实体：`user.entity.ts`（`phone` 唯一约束）。
- **当前情况**：
  - 实现逻辑：当 `status=-1` 时，为该用户生成新 GUID 并直接覆盖同一行记录（更新 `guid` 和 `status`），以满足“注销用户再次登录视为新用户”的语义；
  - 由于 `phone` 字段存在唯一约束，当前表结构下无法简单插入第二条使用同一手机号的新记录，否则会违反唯一性；
  - Python PoC 的 `InMemoryUserRepo` 以 `phone` 为 key，也意味着旧记录会被逻辑上覆盖，而非保留多条历史行。
- **PRD/决策对齐情况**：
  - 已满足 C-01 关于“注销用户再次登录重新生成 GUID 并视为新用户”的行为语义；
  - 但“旧记录保留用于审计/统计”的要求在当前 Schema 下尚未实现，需要通过独立审计表或归档机制完成。
- **后续目标（建议方案）**：
  - 设计独立的审计/历史表（如 `user_history`），在注销时将原记录写入历史表，然后在主表中标记删除/替换 GUID；
  - 或通过 LoginLog / AuditLog 增强记录维度，使“用户状态变更”可被完整追溯；
  - 调整 PRD/数据模型文档，明确“保留历史记录”的工程实现路径与约束（与唯一性约束保持一致）。

### C2-03：LoginLog 字段未完全覆盖 PRD DM-04

- **位置**：`dev/backend-node/src/auth/login-log.service.ts`；关联文档：`passport-统一认证中心-日志与审计设计.md`。
- **当前情况**：
  - LoginLogEntry 当前字段：`guid`、`phone`、`loginAt`、`logoutAt`、`channel`、`ip`、`success`、`errorCode`；
  - PRD DM-04 及日志设计文档还提到 `mac`、`gateway`、`netbar_name` 等字段，这些尚未体现在 LoginLogService 中；
  - 控制器层目前只传入 `channel`/`ip` 信息，未采集更多环境字段。
- **后续目标**：
  - 根据 PRD/日志设计文档扩展 LoginLogEntry 字段集，并在 Auth/Admin 控制器中按需传入对应值；
  - 与前端/壳层约定好这些环境信息的采集与上报方式（例如通过请求头或 body 传入）；
  - 更新后台活跃明细接口 `/api/admin/activity` 的返回结构与前端页面展示，使其暴露关键环境字段，方便运维排查。

---

## 3. Cycle3（登录 QA）剩余问题

### C3-01：缺少端到端（E2E）测试

- **位置**：项目全局
- **当前情况**：
  - 目前仅有 Python/NestJS 单元测试和少量手工验证；
  - Cycle1-5 审查报告已经将 E2E 测试列为必选项，但尚未选型/落地 Playwright/Cypress 等框架。
- **后续目标**：
  - 选型 E2E 测试框架（推荐 Playwright）；
  - 用测试用例文档中的 TC-AUTH-FL01-001～006 作为蓝本，编写端到端测试脚本；
  - 将 E2E 测试接入 CI，作为关键路径回归验证。

### C3-02：测试环境构造工具缺失

- **位置**：`dev/tests/` 与相关测试脚本
- **当前情况**：
  - 测试中按需手动构造用户（ACTIVE/BANNED/DELETED），缺少统一的构造工具或 fixture；
  - 不利于后续扩展更多测试场景或分享构造逻辑。
- **后续目标**：
  - 引入 `test_fixtures.py` 或类似模块，封装创建不同 `User.status` 组合数据的逻辑；
  - 在 Python/NestJS 测试中统一复用该工具，减少样板代码并提升可维护性。

---

## 4. Cycle4（前端刷新状态）剩余问题

### C4-01：AuthState.sessionStatus 未实现

- **位置**：`dev/frontend-react/src/`
- **当前情况**：与 C1-02 一致，项目尚未引入全局 AuthState，自然也不存在 `sessionStatus` 字段；
- **后续目标**：
  - 在实现全局 AuthState 时，同时引入 `sessionStatus: 'active' | 'expiring' | 'expired'` 字段；
  - 根据刷新调度与 Token 有效期更新该字段，并驱动 UI（如顶部状态提示、重新登录提示等）。

### C4-02：未实现 IPC 事件订阅

- **位置**：`dev/frontend-react/src/`（需与目标壳层项目协同）
- **当前情况**：
  - 前端尚未实现与壳层之间的 IPC 监听逻辑；
  - DoD 中提到的 `session.refresh.success` / `session.refresh.failed` 等事件目前仅存在于设计层面。
- **后续目标**：
  - 根据目标壳层栈（Electron / WebView2 等）约定 IPC 通道与事件名；
  - 在前端初始化阶段订阅这些事件，并更新 AuthState/页面提示；
  - 为 IPC 事件处理逻辑补充前端 UT。

### C4-03：缺少手动刷新 Token 调试入口

- **位置**：`dev/frontend-react/src/`
- **当前情况**：
  - DoD 要求在调试环境提供手动刷新 Token 的按钮，便于联调；
  - 当前前端页面未提供该入口。
- **后续目标**：
  - 在开发模式下（如 `NODE_ENV=development`）渲染调试面板，提供“手动刷新 Token”按钮；
  - 按 API-03 调用刷新接口，并在 UI 中显示结果与错误码。

---

## 5. Cycle5（壳层刷新调度）剩余问题

> 说明：`refresh_scheduler.py` 中 jitter 逻辑（C5-04）已按审查建议改为 0～JITTER_MAX 之间的随机值；以下为仍未实现的部分。

### C5-01：未与真实壳层/IPC 集成

- **位置**：`dev/shell/refresh_scheduler.py` 及实际壳层工程（尚未接入）
- **当前情况**：
  - 当前 Python 版 RefreshScheduler 仅为算法骨架，用于验证时间与重试逻辑；
  - 未在真实 Electron/C++ 壳层中实现调用 API-03 与 IPC 通知前端的逻辑。
- **后续目标**：
  - 在目标壳层项目中实现：
    - 定时器驱动的调用 `on_refresh` → 实际 HTTP 请求调用后端刷新接口；
    - 根据返回值/错误码更新本地 Token 与 AuthState；
    - 通过 IPC 将刷新结果通知前端。

### C5-02：Redis 故障处理策略未落地

- **位置**：`dev/shell/refresh_scheduler.py` 与后端错误码/监控设计
- **当前情况**：
  - C-02 决策要求 Redis 故障时统一失败并提示“稍后重试”；
  - 当前 RefreshScheduler 仅根据 `on_refresh` 返回的 True/False 决定是否重试，未区分错误类型（如 Redis 故障 vs 用户需重新登录）。
- **后续目标**：
  - 扩展 `on_refresh` 签名（如返回枚举：SUCCESS / RETRYABLE_ERROR / FATAL_ERROR）；
  - 在 Redis 故障（可恢复错误）时应用 C-02 策略，提示用户稍后再试，并增加监控告警；
  - 在 Refresh Token 过期等不可恢复错误时停止重试并引导用户重新登录。

### C5-03：缺少壳层侧日志与监控钩子

- **位置**：`dev/shell/refresh_scheduler.py` 与实际壳层项目
- **当前情况**：
  - DoD 要求在壳层记录刷新成功/失败日志，并预留监控钩子；
  - 当前骨架未引入 logging，也未调用任何 MetricsClient。
- **后续目标**：
  - 在实际壳层中集成 logging 机制，记录刷新调度的重要事件与错误；
  - 视监控体系设计，在壳层侧上报基础指标或通过后端 API 转发指标信息。

---

> 后续维护：当上述任一问题被设计评审与代码实现解决后，请在合并时同步更新本文件（例如添加“已解决于 commit xxx / 日期”说明，或直接删除相关条目），以保持 code-review backlog 的实时性和可操作性。
