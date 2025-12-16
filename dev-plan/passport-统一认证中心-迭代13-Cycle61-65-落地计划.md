# Passport 统一认证中心 - 迭代 13 落地计划（Cycle61–65）

> 目标：在前期已完成 Metrics、Health Check 与内存审计日志（AuditLogService）的基础上，为 **登录活跃记录（LoginLog）** 提供 NestJS 侧的 PoC 实现，与 Python PoC 与《日志与审计设计》保持一致，并打通 `/api/admin/activity` 后台活跃明细接口。

---

## 一、Scope 与 Cycle 映射

- **Cycle61** = [LOG-01][DM-04][BE] — 实现内存版 LoginLogService（记录 login/logout 与查询能力）；
- **Cycle62** = [LOG-01][DM-04][BE] — 在 AuthService 中接入 LoginLogService，记录登录成功与封禁登录失败；
- **Cycle63** = [LOG-01][DM-04][BE] — 在 TokenService 与 AdminService 中接入 LoginLogService，实现退出登录与后台活跃明细查询；
- **Cycle64** = [LOG-01][DM-04][QA] — 为 LoginLogService 与 AdminService 活跃明细行为补充 Jest 单元测试；
- **Cycle65** = [LOG-01][DM-04][QA] — 全栈回归（Python UT / Node Jest+coverage / React build），确认无回归。

---

## 二、Cycle61 — LoginLogService 内存实现（BE）

**目标**：在 NestJS 中提供与 Python PoC 语义对齐的内存版登录活跃记录服务，支撑后续控制器与后台查询。

**实现要点（dev/backend-node/src/auth）**：

- 新增 `login-log.service.ts`：
  - 定义 `LoginLogEntry`：`guid`、`phone`、`loginAt`、`logoutAt?`、`channel?`、`ip?`、`success`、`errorCode?`；
  - `LoginLogService`：
    - 内部维护 `logs: LoginLogEntry[]`；
    - `recordLogin(guid, phone, success, opts)`：记录登录成功/失败；
    - `recordLogout(guid, phone?, opts)`：找到最近一条未设置 `logoutAt` 的同 guid（与可选 phone）记录并补齐退出时间与渠道/IP；
    - `queryLogs({ phone?, start?, end?, channel? })`：按条件过滤日志；
    - `clear()`：清空日志（主要用于 UT）。

**DoD**：

- LoginLogService 可在内存中按调用顺序保存与查询登录/退出记录，支持按 phone/time/channel 过滤，与 Python 版 LoginLogService 语义基本一致。

---

## 三、Cycle62 — AuthService 接入登录日志（BE）

**目标**：在不改变现有业务语义的前提下，AuthService 在登录成功与封禁登录失败时写入登录日志。

**实现要点**：

- 修改 `auth.module.ts`：
  - 将 `LoginLogService` 加入 providers；
- 修改 `auth.service.ts`：
  - 构造函数新增依赖：`private readonly loginLog: LoginLogService`；
  - 在登录成功路径中（创建 Session 并 `sessions.put` 之后）调用 `loginLog.recordLogin(user.guid, user.phone, true, { channel: dto.app_id })`；
  - 在封禁用户分支（抛出 `ERR_USER_BANNED` 前）调用 `loginLog.recordLogin(user.guid, user.phone, false, { channel: dto.app_id, errorCode: AuthErrorCode.ERR_USER_BANNED })`。

**DoD**：

- 成功登录与封禁导致的登录失败均会被记录到 LoginLogService 中；
- 现有 AuthService 行为（返回值、异常类型）保持不变，相关 Jest UT 可通过适配 mock 继续通过。

---

## 四、Cycle63 — TokenService 与 AdminService 接入登录日志（BE）

**目标**：补齐退出登录与后台活跃明细查询对 LoginLog 的使用，使 `/api/admin/activity` 能返回真实活跃记录。

**实现要点**：

- 修改 `token.service.ts`：
  - 构造函数新增依赖：`private readonly loginLog: LoginLogService`；
  - 在 `logoutByAccessToken` 中：找到 Session 后，在调用 `sessions.delete(session.guid)` 前后调用 `loginLog.recordLogout(session.guid)`，以更新最近一条该 guid 记录的 `logoutAt`；
- 修改 `admin.service.ts`：
  - 构造函数新增依赖：`private readonly loginLogs: LoginLogService`；
  - 实现 `listActivity()`：调用 `loginLogs.queryLogs()`，并将结果映射为 `{ guid, phone, login_at, logout_at, channel, ip }[]` 结构返回；
  - 说明：当前仅实现内存 PoC，不做分页与复杂过滤，后续可在 LoginLogService 与 AdminController 扩展查询条件。

**DoD**：

- 用户退出登录后，其最近一条 LoginLog 记录会被补齐 `logoutAt`；
- 调用 `/api/admin/activity`（通过 AdminService.listActivity）可以看到当前进程内的登录活跃记录列表。

---

## 五、Cycle64 — LoginLog 与后台活跃明细 Jest UT（QA）

**目标**：通过 Jest UT 验证 LoginLogService 与 AdminService 的登录活跃明细功能行为正确且稳定。

**实现要点**：

- 新增 `login-log.service.spec.ts`：
  - 覆盖：
    - 多条 `recordLogin` + `recordLogout` 后，`queryLogs(phone=...)` / `queryLogs(channel=...)` / `queryLogs(start,end)` 过滤行为；
    - `recordLogout` 只更新最近一条未登出的匹配记录；
    - `clear()` 能正确清空日志；
- 扩展 `admin.service.spec.ts`：
  - 在构造 AdminService 时注入 LoginLogService；
  - 为 `listActivity` 增加用例：预置若干 LoginLog，调用 `listActivity()`，断言返回列表长度与字段映射正确（`login_at` 与 `logout_at` 等）。

**DoD**：

- LoginLogService 与 AdminService 的新增行为在 Jest UT 中得到覆盖，整体覆盖率保持在迭代 12 水平或略有提升。

---

## 六、Cycle65 — 全栈回归验证（Python / Node / React）

**目标**：在接入登录日志并打开 `/api/admin/activity` 后，确认未对既有功能产生回归影响。

**执行项**：

- Python PoC UT：`python -m unittest discover -s dev/tests -p "test_*.py"`；
- NestJS Jest UT + 覆盖率：`cd dev/backend-node && npm test -- --coverage`；
- React 构建：`cd dev/frontend-react && npm run build`。

**DoD**：

- 三类验证全部通过；
- NestJS 覆盖率维持在迭代 12 的高水平或略有提升；
- `/api/admin/activity` 可返回真实登录活跃记录列表，为后续接入 DB 持久化与审计提供基础。
