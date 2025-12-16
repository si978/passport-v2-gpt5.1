# Passport 统一认证中心 - 迭代 12 落地计划（Cycle56–60）

> 目标：在认证、后台、Metrics 与 Health Check 均已完善（Cycle1–55）的基础上，为 **审计日志（Audit Log）** 增加最小可用实现与单元测试：记录登录、退出、封禁/解封等关键安全操作，为后续持久化与合规留底打基础。

本迭代仅在 NestJS 后端增加内存级 AuditLogService 与控制器调用点，不引入真实落库或外部系统集成。

---

## 一、Scope 与 Cycle 映射

- **Cycle56** = [OBS-07][NFR][AUDIT][BE] — 实现内存版 AuditLogService，支持 login/logout/ban/unban 审计记录；
- **Cycle57** = [OBS-07][NFR][AUDIT][QA] — 为 AuditLogService 增加 Jest 单元测试；
- **Cycle58** = [OBS-07][NFR][AUDIT][BE] — 在 AuthController 与 AdminController 中接入 AuditLogService；
- **Cycle59** = [OBS-07][NFR][AUDIT][QA] — 为控制器中的审计行为补充 Jest UT；
- **Cycle60** = [OBS-07][NFR][AUDIT][QA] — 全栈回归（Python UT / Node Jest+coverage / React build）。

---

## 二、Cycle56 — AuditLogService 实现（BE）

**目标**：在 NestJS 中提供一个简单的内存版审计日志服务，记录安全敏感操作的基本信息。

**实现要点（dev/backend-node/src/auth）**：

- 新增 `audit-log.service.ts`：
  - 定义 `AuditLogEntry` 接口：`type`（'login'|'logout'|'ban'|'unban'）、`guid?`、`phone?`、`at`（ISO 时间）、`meta?`；
  - `AuditLogService`：
    - 内部维护 `entries: AuditLogEntry[]`；
    - 提供方法：
      - `recordLogin(guid: string, phone: string)`；
      - `recordLogout(meta?: Record<string, any>)`；
      - `recordBan(guid: string)`；
      - `recordUnban(guid: string)`；
    - 提供只读访问：`getEntries()` 返回拷贝，`clear()` 清空（供 UT 使用）。
  - 所有记录统一使用 `new Date().toISOString()` 作为时间戳。

**DoD**：

- AuditLogService 可在内存中按调用顺序保存日志记录，且暴露最小只读 API 供测试与后续集成使用。

---

## 三、Cycle57 — AuditLogService Jest UT（QA）

**目标**：通过 Jest UT 验证 AuditLogService 的基本行为，确保记录内容与顺序正确。

**实现要点**：

- 新增 `audit-log.service.spec.ts`：
  - 构造服务实例，依次调用 `recordLogin/recordLogout/recordBan/recordUnban`；
  - 使用 `getEntries()` 检查：
    - 条目数量与调用次数一致；
    - type 字段按顺序为 'login' → 'logout' → 'ban' → 'unban'；
    - 对 login/ban/unban 至少校验 guid/phone 字段被正确传递；
  - 调用 `clear()` 后 `getEntries()` 返回空数组。

**DoD**：

- AuditLogService 的主要方法在 Jest UT 中有覆盖，并能稳定通过测试。

---

## 四、Cycle58 — 控制器接入审计日志（BE）

**目标**：在不改变业务语义的前提下，将 AuditLogService 接入 AuthController 与 AdminController，对登录成功、退出、封禁与解封操作进行审计记录。

**实现要点**：

- 修改 `auth.module.ts`：
  - 将 `AuditLogService` 加入 `providers`；
- 修改 `auth.controller.ts`：
  - 构造函数新增依赖：`private readonly audit: AuditLogService`；
  - 在 `loginByPhone` 成功路径中调用 `audit.recordLogin(res.guid, dto.phone)`；
  - 在 `logout` 中：
    - 若存在 accessToken，则在成功调用 `logoutByAccessToken` 后调用 `audit.recordLogout({ accessToken })`；
- 修改 `admin.controller.ts`：
  - 构造函数新增依赖：`private readonly audit: AuditLogService`；
  - 在 `banUser` 成功执行后调用 `audit.recordBan(guid)`；
  - 在 `unbanUser` 成功执行后调用 `audit.recordUnban(guid)`。

**DoD**：

- 登录/退出/封禁/解封操作在控制器层面均会产生对应审计记录；
- 若后续接入持久化，只需在 AuditLogService 内部替换实现即可。

---

## 五、Cycle59 — 控制器审计行为 UT（QA）

**目标**：通过 Jest UT 验证控制器在关键操作时正确调用 AuditLogService，而不影响其原有业务行为与 Metrics 行为。

**实现要点**：

- 扩展 `auth.controller.spec.ts`：
  - 引入 mock `AuditLogService`，与已有 Metrics/Service mocks 一同注入；
  - 在登录成功 UT 中断言 `recordLogin` 被调用一次，参数包含 guid 与 phone；
  - 在 logout UT 中断言在有 access_token 时 `recordLogout` 被调用一次。
- 扩展 `admin.controller.spec.ts`：
  - 注入 mock `AuditLogService`；
  - 在 ban/unban UT 中断言分别调用 `recordBan(guid)` 与 `recordUnban(guid)`。

**DoD**：

- 所有新增断言通过，且不破坏已有 Admin/Auth/Metrics UT 行为与覆盖率。

---

## 六、Cycle60 — 全栈回归验证（Python / Node / React）

**目标**：在审计日志服务接入后执行一次全栈回归，确保不对既有 Python PoC、NestJS 行为和 React 编译产生负面影响。

**执行项**：

- Python UT：`python -m unittest discover -s dev/tests -p "test_*.py"`；
- Node UT + 覆盖率：`cd dev/backend-node && npm test -- --coverage`；
- React build：`cd dev/frontend-react && npm run build`。

**DoD**：

- 三类验证全部通过；
- 覆盖率保持在迭代 11 的高水平或略有提升；
- 审计日志的引入未改变任何业务请求的 HTTP 语义或错误码行为。
