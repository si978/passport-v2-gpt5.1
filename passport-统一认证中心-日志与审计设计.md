# Passport 统一认证中心 - 日志与审计设计（v1.0）

> 目的：在 PRD v1.1 对 LoginLog 与关键日志进行了业务层描述的基础上，补充工程级日志与审计设计，确保认证与会话关键操作可追踪、可审计，并与监控指标形成闭环。

关联文档：PRD 8 章（DM-04）、12 章（日志与监控）、13 章（错误码）、《性能与监控设计方案》、Dev Plan（ADMIN-04 模块相关 Cycle）、测试用例（TC-AUTH-FL01-006、TC-SESS-FL05-004、TC-ADMIN-FL07-001/002 等）。

---

## 1. LoginLog 表结构与语义补充

> 说明：具体 DDL 细节在《数据模型与数据库设计》中定义，这里强调字段语义与审计要求。

- 必填字段：
  - `id`（bigint，自增主键）；
  - `guid`（用户全局唯一标识）；
  - `phone`（登录手机号，建议加掩码或使用独立脱敏视图暴露给非安全角色）；
  - `user_type` / `account_source`；
  - `login_time`（登录成功时间）；
  - `logout_time`（退出时间或最后一次心跳时间，退出前为 NULL）；
  - `channel`（登录渠道，如 `client_jiuweihu` / `client_youlishe` / `admin` 等）；
  - `ip` / `mac` / `gateway` / `netbar_name` 等环境信息；
  - `status`（当前会话状态，如 active / logged_out / banned）。

- 审计要求：
  - 封禁 / 解封操作必须在 LoginLog 或单独审计表中留下记录（含操作人、时间、原因）；
  - 任何“跨设备 / 网吧异常行为”的排查，均可通过 LoginLog 与操作日志联合完成。

---

## 2. 业务操作日志（Operational Logs）

### 2.1 统一字段规范

- 每条业务日志建议至少包含：
  - `timestamp`：时间戳（ISO8601）；
  - `level`：INFO / WARN / ERROR；
  - `trace_id` / `span_id`：链路追踪标识（可选但强烈建议）；
  - `guid`（如已登录）；
  - `app_id`；
  - `operation`（如 `login`, `logout`, `refresh`, `ban_user`, `unban_user`）；
  - `result`（success / fail）；
  - `error_code`（如失败时）；
  - `extra`（JSON，记录环境信息与额外上下文）。

### 2.2 关键操作需强制打点

- 登录相关：
  - 登录成功 / 失败；
  - 验证码发送成功 / 失败（含错误原因）；
  - Token 刷新失败（含 `error_code` 与 Redis 状态）。
- 会话相关：
  - 会话创建 / 删除（包含 Redis key 与 TTL 信息）；
  - 退出登录（用户主动 / 被动，如封禁）。
- 后台操作：
  - 封禁 / 解封用户（包括操作人、旧状态、新状态、原因）；
  - 后台查询 / 导出操作（可按需日志化，主要用于审计与追责）。

---

## 3. 安全与合规要求

- 日志中不得记录：
  - 明文 Token（Access / Refresh）；
  - 完整验证码值；
  - 密码类信息（当前方案中无密码字段，但作为通用要求保留）。
- 对手机号等敏感字段：
  - 推荐在日志中使用脱敏形式（如 `138****8000`），或使用 guid 作为主键进行关联；
  - 对有权限的后台查询提供原文（如运营 / 安全），其访问应受权限控制并记录审计。

---

## 4. 与监控和测试的关系

- 监控：
  - 各类 ERROR 日志与监控指标应一致（例如 Redis 故障时既有 `passport_redis_session_error_total` 指标，也有对应错误日志）；
- 测试：
  - TC-AUTH-FL01-006 / TC-SESS-FL05-004 要求在登录 / 退出 / 封禁后验证 LoginLog 的写入情况；
  - 如需要，可扩展自动化测试校验关键日志字段是否存在（不建议过多依赖具体日志内容，以免测试过度绑定实现细节）。
