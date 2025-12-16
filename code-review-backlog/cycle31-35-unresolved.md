# Passport 统一认证中心 - Cycle31-35 专项审查未解决问题清单（v1.0）

> 依据文档：`code-review/cycle31-35-review.md`
> 说明：本清单仅列出 **截至本次修复仍未在代码中完全落地** 的问题；已在前序 Cycle 中解决的已知问题（如 C34-01：后台权限校验，已通过 AdminController 上的 `@UseGuards(AuthGuard)` 与前端 `RequireAuth` 登陆态校验部分完成）不再重复。

---

## 1. Cycle35（后台活跃明细 PoC）剩余问题

### C35-01：LoginLog 活跃数据持久化与真实存储方案

- **位置**：
  - Python 栈：`dev/backend/domain.py` 与 `LoginLog`/`InMemoryLoginLogRepo`、`LoginLogService`；
  - NestJS 栈：`dev/backend-node/src/auth/login-log.service.ts` 及其在 `AdminService.listActivity` 中的使用。

- **当前情况**：
  - 目前 LoginLog 实现均基于内存存储（InMemory Repo 或 in-memory 数组），适合作为 PoC 与单元测试支撑；
  - 服务重启后所有登录活跃记录会丢失，无法满足生产环境下的审计与运营分析需求；
  - PRD 与日志/审计设计文档中提到的长期留存和查询需求尚未在存储层实现。

- **后续目标（建议方向）**：
  - 为 LoginLog 设计持久化模型（例如关系型表 `login_logs` 或时序/日志型存储），字段覆盖 guid、phone、login_at、logout_at、channel、ip、success、error_code 等；
  - 在 Python 与 NestJS 两栈中分别实现基于真实存储的 `LoginLogRepo`/`LoginLogService`，并保留当前内存实现作为开发/测试双模；
  - 更新 `AdminService.listActivity` 及相关查询接口，使其从持久化存储中分页查询数据，并在必要时提供归档/清理策略；
  - 为新的存储层实现补充 UT/集成测试，并在文档中更新“活跃数据持久化”的实现状态。

---

> 说明：Cycle31-34 的审查问题均已在前序 Cycle 的 backlog 中记录并部分或全部解决，本轮新增 backlog 仅包含 C35-01 这一 PoC → 生产化的后续演进项。
