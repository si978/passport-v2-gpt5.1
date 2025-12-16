# Passport 统一认证中心 - 迭代 10 落地计划（Cycle46–50）

> 目标：在认证/后台管理主链路与单元测试体系已完善（Cycle1–45）的基础上，为 **观测性（Metrics）与简单健康度可视化** 补齐代码级实现，使 MetricsService 从 PoC 走向实际接入控制器，并通过 Admin API 提供快照查看能力。

本迭代聚焦 OBS/NFR 维度，不引入新的业务功能，只增强可观测性与测试。

---

## 一、Scope 与 Cycle 映射

- **Cycle46** = [OBS-05][NFR][LOG-MON][BE] — 将 MetricsService 接入 AuthController 登录/发送验证码/刷新接口；
- **Cycle47** = [OBS-05][NFR][LOG-MON][QA] — 为 AuthController + Metrics 整合行为补充 Jest UT；
- **Cycle48** = [OBS-05][NFR][LOG-MON][BE] — 在 AdminController 中提供 `/api/admin/metrics` 快照查看接口；
- **Cycle49** = [OBS-05][NFR][LOG-MON][QA] — 为 Admin metrics 接口增加 Jest UT；
- **Cycle50** = [OBS-05][NFR][LOG-MON][QA] — 回归验证（Python UT / Node Jest+coverage / React build）。

---

## 二、Cycle46 — 将 MetricsService 接入 AuthController（BE）

**目标**：在 `AuthController` 中注入 `MetricsService`，在登录成功/失败、验证码发送失败、刷新失败等关键路径更新计数器。

**实现要点（dev/backend-node）**：

- 修改 `src/auth/auth.module.ts`：将 `MetricsService` 加入 `providers`；
- 修改 `src/auth/auth.controller.ts`：
  - 构造函数新增依赖：`private readonly metrics: MetricsService`；
  - `login-by-phone`：
    - 成功返回前调用 `metrics.incLoginSuccess()`；
    - 捕获 `AuthException` 时调用 `metrics.incLoginFailure()` 后再抛出；
  - `send-code`：
    - 捕获 `AuthException` 时调用 `metrics.incSendCodeFailure()` 后再抛出；
  - `:guid/refresh-token` 与 `refresh-token`：
    - 捕获 `AuthException` 时调用 `metrics.incRefreshFailure()` 后再抛出。

---

## 三、Cycle47 — AuthController+Metrics 集成 UT（QA）

**目标**：对接入 MetricsService 后的 `AuthController` 行为进行 UT 验证，确保计数器调用符合预期且不影响现有路由行为。

**实现要点**：

- 扩展 `src/auth/auth.controller.spec.ts`：
  - 使用 mock MetricsService（含 `incLoginSuccess/incLoginFailure/incSendCodeFailure/incRefreshFailure`）；
  - 在成功路径 UT 中校验：
    - 登录成功时 `incLoginSuccess` 被调用；
    - 发送验证码成功时 **不** 调用 `incSendCodeFailure`；
  - 新增失败路径 UT：
    - 模拟 `loginByPhone` 抛出 `AuthException` → `incLoginFailure` 被调用；
    - 模拟 `sendCode` 抛出 `AuthException` → `incSendCodeFailure` 被调用；
    - 模拟刷新接口抛出 `AuthException` → `incRefreshFailure` 被调用。

---

## 四、Cycle48 — Admin metrics 接口（BE）

**目标**：通过 Admin API 暴露 MetricsService 的当前快照，便于运维/开发在调试环境中查看登录/发送验证码/刷新失败等计数器状态。

**实现要点**：

- 修改 `src/auth/admin.controller.ts`：
  - 构造函数新增依赖：`private readonly metrics: MetricsService`；
  - 新增路由：`GET /admin/metrics`：
    - 调用 `metrics.snapshot()`，返回 `{ metrics: snapshot }`。

---

## 五、Cycle49 — Admin metrics UT（QA）

**目标**：为 Admin metrics 接口新增 Jest UT，验证路由行为与返回结构。

**实现要点**：

- 扩展 `src/auth/admin.controller.spec.ts`：
  - 使用 mock MetricsService（含 `snapshot`）；
  - 新增 UT：调用 `controller.getMetrics()`：
    - 断言 `snapshot` 被调用一次；
    - 断言返回对象中包含 `metrics` 字段且值与 mock 返回一致。

---

## 六、Cycle50 — 回归验证

**目标**：在完成上述改动后执行一轮回归验证，确保未对既有业务行为与测试造成回归。

**执行项**：

- Python PoC UT：`python -m unittest discover -s dev/tests -p "test_*.py"`；
- NestJS Jest UT + 覆盖率：`cd dev/backend-node && npm test -- --coverage`；
- React 构建：`cd dev/frontend-react && npm run build`。

**DoD**：

- 三类验证均通过；
- 覆盖率仍维持在迭代 9 的高水平或有所提升，特别是 `auth.controller.ts` 与 `admin.controller.ts`。
