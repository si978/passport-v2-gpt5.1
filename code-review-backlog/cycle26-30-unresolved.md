# Passport 统一认证中心 - Cycle26-30 专项审查未解决问题清单（v1.0）

> 依据文档：`code-review/cycle26-30-review.md`
> 说明：本清单仅列出 **截至本次修复仍未在代码中完全落地** 的问题；已在本轮实现的修复（如 C27-01/C27-02/C28-01/C30-02/C30-03 等）不再重复。

---

## 1. Cycle27（后台用户活跃表前端）剩余问题

### C27-03：用户活跃明细分页能力

- **位置**：`dev/frontend-react/src/features/admin/UserActivityPage.tsx` 与后端 `AdminService.listActivity`。
- **当前情况**：
  - 本轮已为活跃明细页面补充导出功能和筛选条件（手机号、开始/结束时间、渠道），并在后端 `/admin/activity` 接口与 `LoginLogService.queryLogs` 之间打通过滤参数；
  - 但前后端仍一次性返回全部匹配记录，未引入 `page`/`pageSize` 等分页参数，大数据量场景下可能存在性能隐患。
- **后续目标**：
  - 为 `GET /admin/activity` 增加分页参数（例如 `page`、`pageSize` 或 `limit`、`offset`），后端按参数进行分页查询；
  - 在 `UserActivityPage` 中增加简单的分页控件和状态管理，并在导出时明确是“导出当前页”还是“导出全部满足条件的数据”；
  - 视需要为分页行为编写前端/后端测试用例。

---

## 2. Cycle29（登录活跃记录 QA）剩余问题

### C29-01：导出视图的测试覆盖

- **位置**：`dev/tests/test_login_log_cycle28_29.py`（Python）及潜在的 Node 侧测试。
- **当前情况**：
  - 现有测试覆盖了 LoginLog 的过滤条件（手机号/时间窗口/渠道）以及 `logout_at` 更新行为；
  - DoD 中提到的“导出视图字段齐全、顺序正确”的测试尚未实现；当前导出功能仅在前端以 CSV 形式实现，后端尚无专门的“导出视图”接口。
- **后续目标**：
  - 若后端计划提供专门的导出接口（例如 `GET /admin/activity/export`），需在 Python/NestJS 层增加相应测试验证导出字段和顺序；
  - 对于当前前端 CSV 导出实现，可在前端 UT 或 E2E 测试中验证生成的 CSV 内容格式。

---

## 3. Cycle30（NestJS 观测性 PoC）剩余问题

### C30-01：Metrics 计数器持久化与观测平台接入

- **位置**：`dev/backend-node/src/auth/metrics.service.ts` 及监控平台配置。
- **当前情况**：
  - MetricsService 仍使用进程内内存计数器，服务重启后计数归零；
  - 尚未接入 Prometheus/StatsD 等外部观测系统，也未通过中间件/拦截器自动采集更多指标。
- **后续目标**：
  - 结合 OBS-05 的整体监控方案，将登录/验证码/刷新/退出等指标暴露为 Prometheus 指标或发送到统一监控平台；
  - 评估是否需要将关键计数持久化（例如落库或由监控系统长期存储），并为采集端的可用性/性能编写测试与告警策略。

---

> 说明：
> - C27-01 已通过在 `UserActivityPage` 中实现“导出当前结果”为 CSV 文件的前端逻辑完成；
> - C27-02 已通过为 `/admin/activity` 引入 `phone`/`start`/`end`/`channel` 查询参数并在前端提供对应筛选控件完成；
> - C28-01 已通过统一 Python/NestJS 两栈中 `LoginLogService.record_logout` 的匹配策略（guid + 可选 phone，自后向前查找首条未登出的记录）完成；
> - C30-02 已通过在 MetricsService 中添加 `logoutSuccess` 计数器，并在 `AuthController.logout` 成功调用后累加完成；
> - C30-03 已在前一轮通过在 `AdminController` 上应用 `@UseGuards(AuthGuard)` 完成基础权限校验，本轮未再重复列出。
