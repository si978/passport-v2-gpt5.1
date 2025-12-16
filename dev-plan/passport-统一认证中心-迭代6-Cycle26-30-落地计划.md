# Passport 统一认证中心 - 迭代 6 落地计划（Cycle26–30）

> 目标：在已完成验证码发送（AUTH-01 FL-06，Cycle21–25 骨架）与后台用户查询/封禁 PoC 的基础上，补齐 **后台用户 QA（Cycle26）+ 后台活跃明细 FE/BE/QA（Cycle27–29）+ 观测性 PoC（Cycle30）**，为 ADMIN-04 模块与监控/日志能力打下可演进的实现基线。

关联文档：

- 需求：`passport-统一认证中心-PRD-草稿.md`（US-05、BR-08、DM-01/DM-04、NFR 10.x/12.x 日志与监控）；
- 决策：`passport-统一认证中心-PRD-审查与决策汇总-已决策.md`，`passport-统一认证中心-多视图冲突与决策清单-已决策.md`；
- 总开发计划：`dev-plan/passport-统一认证中心-开发计划.md`（ADMIN-04 模块中 Cycle26～29 定义）；
- 现有实现基线：
  - Python：`InMemoryUserRepo` + `BanService` + `UserQueryService`（Cycle25 PoC）；
  - NestJS：认证主链路服务与单元测试（Cycle1–25 支撑 AUTH-01 / SESS-03）；
  - React：`UserListPage` 后台用户列表骨架（Cycle24）。

---

## 一、迭代范围与目标

### 1.1 Scope：覆盖 Cycle26–30

- **Cycle26** = [ADMIN-04][US-05][FL-06][QA]：后台用户信息表与封禁/解封 QA（Python UT 为主）；
- **Cycle27** = [ADMIN-04][US-05][FL-07][FE]：后台用户活跃表页面与导出入口（React 骨架）；
- **Cycle28** = [ADMIN-04][US-05][FL-07][BE]：Python PoC 版 LoginLog 模型与查询服务；
- **Cycle29** = [ADMIN-04][US-05][FL-07][QA]：登录活跃记录查询/导出逻辑级测试；
- **Cycle30** = [OBS-05][NFR][LOG-MON][BE]：NestJS 认证模块观测性 PoC（计数型指标服务 + Jest UT）。

> 说明：Cycle30 在总开发计划中尚未列出，本迭代将其作为对 NFR（日志/监控）要求的增量实现，用于为后续真正接入监控平台预先打好服务与测试基线。

---

## 二、Cycle26 — 后台用户信息表 QA（ADMIN-04 FL-06 QA）

**目标**：通过 Python UT 验证后台用户信息查询与封禁/解封服务（`UserQueryService` + `BanService`）的核心行为，确保 BR-08 与 User.status 语义正确落地，为后续前端/真后台 API 提供可靠基线。

**实现要点**：

- 复用 `InMemoryUserRepo` 与 `UserStatus` 三态（ACTIVE/BANNED/DELETED）；
- 通过 UT 构造多用户样本，验证：
  - `list_users()` 返回全部用户，按创建时间/手机号排序；
  - `list_users(status=…)` 可正确过滤不同状态；
  - `ban_by_phone` 与 `unban_by_phone` 行为会改变用户状态，并在查询结果中即时反映。

**对应实现（本迭代已落地）**：

- Python：`dev/backend/services.py` 中 `UserQueryService` 与增强版 `BanService`；
- UT：`dev/tests/test_admin_user_query_cycle25.py`。

**DoD**：

- `python -m unittest discover -s dev/tests -p "test_*.py"` 全部通过；
- User.status 的变更与查询行为满足 BR-08 与 DM-01 语义。

---

## 三、Cycle27 — 后台用户活跃表前端骨架（ADMIN-04 FL-07 FE）

**目标**：在 React 前端实现“用户活跃表”页面骨架，支持按状态/时间区间等条件查询，并预留导出入口，为后端 LoginLog API 与监控数据接入预留对接点。

**工作拆分**：

1. 新增页面组件 `UserActivityPage`：
   - 路径：`dev/frontend-react/src/features/admin/UserActivityPage.tsx`；
   - 使用 `apiClient.get('/admin/activity', { params })` 调用占位 API；
   - 展示字段：手机号、GUID、登录时间、退出时间、渠道、IP 等（与 DM-04 对齐的子集）。
2. 在 `App.tsx` 中新增路由 `/admin/activity` 指向该页面。

**DoD**：

- `npm run build` 通过，页面可在路由 `/admin/activity` 下成功渲染；
- 不强求本迭代内实现真实后台 API，仅需前端结构清晰、易于后续扩展筛选条件与导出按钮。

---

## 四、Cycle28 — LoginLog 模型与查询服务 PoC（ADMIN-04 FL-07 BE）

**目标**：在 Python 骨架中实现登录活跃记录的基础模型与查询服务，为后台活跃表与导出能力提供数据来源，并贴合 DM-04 结构。

**工作拆分**：

1. 在 `dev/backend/domain.py` 中新增：
   - `LoginLog` dataclass：字段含 guid、phone、login_at、logout_at、channel、ip、success、error_code 等核心信息；
   - `InMemoryLoginLogRepo`：支持 `append(log: LoginLog)` 与基于 phone/时间区间/channel 的简单查询方法。
2. 在 `dev/backend/services.py` 中新增：
   - `LoginLogService`：包装仓储，提供：
     - `record_login(...)` / `record_logout(...)` 等记录方法；
     - `query_logs(...)` 支持按手机号/时间区间/渠道过滤并按时间排序。

> 注意：本迭代仅实现 PoC 服务与单测，暂不强制将其注入 AuthService/TokenService 等主流程中，以避免对既有 UT 的大规模改动；后续迭代可在生产栈中逐步接入。

**DoD**：

- Python 单测覆盖 LoginLog 的追加与查询主要分支，确保对 DM-04 的映射正确；
- InMemory 实现足以支撑后台活跃表页面的本地开发与演示。

---

## 五、Cycle29 — 登录活跃记录查询/导出 QA（ADMIN-04 FL-07 QA）

**目标**：通过 Python UT 验证 LoginLog 查询服务对不同过滤条件（手机号、时间区间、渠道）的行为，以及“导出视图”的正确性，为未来后台导出 API 与监控验证提供基础用例。

**工作拆分**：

1. 新增 UT（例如 `test_login_log_cycle28_29.py`）：
   - 构造多条 LoginLog 记录（成功/失败、不同渠道/时间点）；
   - 验证：
     - 按手机号过滤仅返回对应用户记录；
     - 按时间区间过滤能正确截取窗口内记录；
     - 按渠道过滤仅返回指定渠道；
     - “导出视图”（如转换为列表/字典）字段齐全、顺序正确。

**DoD**：

- UT 通过并与 Cycle28 中的 LoginLogService 行为一致；
- 为后续在 NestJS 中实现 LoginLog 查询/导出 API 与监控验证提供直接可复用的用例思路。

---

## 六、Cycle30 — NestJS 认证模块观测性 PoC（OBS-05 LOG/MON BE）

**目标**：在 NestJS 认证模块中实现一个独立的计数型指标服务 PoC，通过 Jest UT 验证指标自增与快照行为，为后续接入真实监控平台（Prometheus/内部监控）提供代码与测试模板。

**工作拆分**：

1. 新增 `metrics.service.ts`：
   - 内部维护若干计数器：登录成功次数、登录失败次数、验证码发送失败次数、Token 刷新失败次数等；
   - 暴露方法：`incLoginSuccess()` / `incLoginFailure()` / `incSendCodeFailure()` / `incRefreshFailure()` 等；
   - 提供 `snapshot()` 方法返回当前计数快照（用于调试与 UT）。
2. 新增 Jest UT：`metrics.service.spec.ts`：
   - 调用各类 `inc*` 方法后验证 `snapshot()` 中的对应计数精确递增；
   - 验证初始快照全为 0。

> 注意：本迭代不强制将该服务接入现有控制器/服务，仅作为观测性 PoC 与后续接入监控的“种子实现”。

**DoD**：

- `npm test` 通过，新增 metrics UT 覆盖指标自增与快照逻辑；
- 覆盖率报告中 `metrics.service.ts` 达到接近 100% 覆盖，为后续扩展留足余地。

---

## 七、迭代验收与退出条件

1. Python 层：
   - `UserQueryService` + `BanService` 的查询与封禁/解封行为 UT 全部通过（Cycle26）；
   - LoginLog 模型与查询服务的 UT 全部通过（Cycle28/29）。
2. React 层：
   - `UserActivityPage` 可在 `/admin/activity` 路由下渲染并调用占位 API，不影响现有登录流程，`npm run build` 通过（Cycle27）。
3. NestJS 层：
   - 新增 metrics 服务 PoC 的 UT 通过，整体 Jest 测试与覆盖率正常（Cycle30）。

满足以上条件后，ADMIN-04 模块将具备：

- 后台用户信息表查询/封禁 PoC（含 QA）；
- 登录活跃记录模型与查询/导出 PoC（含 QA）；
- 认证模块基础观测性能力 PoC，为后续接入日志/监控平台提供直接落地点。
