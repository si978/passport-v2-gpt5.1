# Passport 统一认证中心 - 迭代 11 落地计划（Cycle51–55）

> 目标：在认证、后台与观测性（Metrics）已经打通（Cycle1–50）的基础上，补齐 **基础健康检查能力（Health Check）**，为部署与运维提供最小可用的存活探针与进程状态查看能力，并通过 Jest UT 保证行为稳定。

本迭代仅在 NestJS 后端增加 `/api/health` 健康检查端点及其单元测试，不更改已有业务语义。

---

## 一、Scope 与 Cycle 映射

- **Cycle51** = [OBS-06][NFR][HEALTH][BE] — 新增 HealthController 与 `/api/health` 健康检查端点；
- **Cycle52** = [OBS-06][NFR][HEALTH][QA] — 为 HealthController 增加 Jest 单元测试；
- **Cycle53** = [OBS-06][NFR][HEALTH][BE] — 在健康检查中返回基础运行信息（timestamp / uptime）；
- **Cycle54** = [OBS-06][NFR][HEALTH][QA] — 为运行信息字段增加断言，确保格式与语义正确；
- **Cycle55** = [OBS-06][NFR][HEALTH][QA] — 运行全栈回归验证（Python UT / Node Jest+coverage / React build），确认无回归。

---

## 二、Cycle51 — 新增 HealthController 与 /api/health 端点（BE）

**目标**：在 NestJS 服务中提供一个简单的健康检查端点 `/api/health`，可被探针/监控用于基础存活检测。

**实现要点（dev/backend-node）**：

- 新增 `src/health.controller.ts`：
  - `@Controller('health')`；
  - `@Get()` 方法 `health()` 返回 `{ status: 'ok' }`（后续 Cycle53 再扩展字段）；
- 修改 `src/app.module.ts`：
  - 引入 `HealthController`；
  - 在 `@Module` 装饰器中增加 `controllers: [HealthController]`。

**DoD**：

- 启动 Nest 应用后，在全局前缀 `api` 下可通过 `GET /api/health` 获得 `{ status: 'ok' }` 响应；
- 不影响现有 AuthModule 与 TypeORM 配置。

---

## 三、Cycle52 — HealthController 单元测试（QA）

**目标**：为 HealthController 增加最小单元测试，验证返回结构与默认状态值正确。

**实现要点**：

- 新增 `src/health.controller.spec.ts`：
  - 直接实例化 `HealthController`；
  - 调用 `health()` 并断言：
    - `status === 'ok'`；
    - 存在 `timestamp` 与 `uptime` 字段时类型正确（在 Cycle53/54 中补充）。

**DoD**：

- `npm test` 时 HealthController UT 通过，且不依赖 Nest DI 容器。

---

## 四、Cycle53 — 健康检查返回运行信息（timestamp / uptime）（BE）

**目标**：在健康检查返回体中附加基础运行信息，便于运维快速判断实例状态与时间。

**实现要点**：

- 扩展 `HealthController.health()` 返回结构：
  - `status: 'ok'`；
  - `timestamp: new Date().toISOString()`；
  - `uptime: process.uptime()`（单位秒的浮点数）。

**DoD**：

- `GET /api/health` 响应体中包含上述三个字段，字段名与类型稳定可依赖。

---

## 五、Cycle54 — 运行信息字段 UT（QA）

**目标**：为健康检查中的 `timestamp` 与 `uptime` 字段增加 UT 断言，保障其格式与语义正确。

**实现要点**：

- 扩展 `health.controller.spec.ts`：
  - 断言 `typeof res.timestamp === 'string'` 且符合 ISO8601 基本格式（如通过 `Date.parse` 不为 NaN）；
  - 断言 `typeof res.uptime === 'number'` 且 `uptime >= 0`。

**DoD**：

- 健康检查的运行信息在 UT 中有明确语义约束，防止未来重构时破坏字段格式。

---

## 六、Cycle55 — 回归验证（Python / Node / React）

**目标**：在完成健康检查端点与 UT 增强后，执行一轮全栈回归，确保未对既有功能产生回归影响。

**执行项**：

- Python PoC UT：`python -m unittest discover -s dev/tests -p "test_*.py"`；
- NestJS Jest UT + 覆盖率：`cd dev/backend-node && npm test -- --coverage`；
- React 构建：`cd dev/frontend-react && npm run build`。

**DoD**：

- 三类验证全部通过，覆盖率维持在迭代 10 的高水位或略有提升；
- `/api/health` 可作为基础 liveness 探针使用。
