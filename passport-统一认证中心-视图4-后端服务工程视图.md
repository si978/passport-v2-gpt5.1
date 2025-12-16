# Passport 统一认证中心 - 视图 4：后端服务工程视图

> 说明：本视图从后端服务（API + 数据持久化）角度审查《passport-统一认证中心-PRD-草稿.md》（V1 多视图对齐版）中对实体、API、状态机、权限模型和幂等性的描述，识别那些会让后端实现出现多种可能的点。所有 US/BR/FL/DM/ERR 编号与主 PRD 保持一致。本视图仅作为后端工程视角的补充，如与主 PRD 存在任何不一致，应一律以主 PRD 为准。

---

## 1. 与后端相关的 US / BR / FL 覆盖总览

| 类型 | ID   | 在主 PRD 中的位置              | 对后端的相关性 | 视图结论 |
|------|------|--------------------------------|----------------|----------|
| US   | US-01 | 登录/注册                     | 很高           | 登录/注册状态机与错误码需细化 |
| US   | US-02 | 跨客户端 SSO                  | 中             | 主要依赖 Token 刷新与 Session 结构 |
| US   | US-03 | 网吧下机自动登出              | 低             | 多由系统与客户端处理，后端侧较弱 |
| US   | US-04 | 用户主动退出登录               | 高             | 涉及会话删除及幂等性 |
| US   | US-05 | 后台查看与封禁/解封           | 很高           | 涉及查询、筛选、更新状态与审计 |
| BR   | BR-01 | GUID 生成规则                 | 高             | 需实现唯一 ID 生成服务，未完全约束并发行为 |
| BR   | BR-02 | 手机号登录/注册判定规则       | 很高           | 与 User.status/封禁/注销状态的关系未完全说明 |
| BR   | BR-03 | Token 有效期                  | 高             | 影响 JWT 签发配置与缓存策略 |
| BR   | BR-04 | Token 刷新规则                | 很高           | 幂等性、错误码、并发刷新需明确 |
| BR   | BR-05 | Token 验证规则                | 很高           | 错误分类（401/403）和日志记录需定义 |
| BR   | BR-06 | 本地会话文件规则              | 低             | 主要为客户端能力，后端仅需关注 Refresh Token 一致性 |
| BR   | BR-07 | 会话 TTL 与全局退出           | 高             | Redis TTL 与会话状态机需严格对齐 |
| BR   | BR-08 | 封禁/解封规则                 | 很高           | 封禁对现有会话与接口访问的即时影响需细化 |
| FL   | FL-01 | 登录/注册流程                 | 很高           | 控制流清晰，但错误分支未结构化 |
| FL   | FL-02 | Token 刷新流程                | 很高           | 幂等和并发更新 Redis 的细节需明确 |
| FL   | FL-03 | Token 验证流程                | 很高           | API-04 行为与通用中间件行为需一致 |
| FL   | FL-04 | SSO 流程                       | 中             | 主要体现在 API-03 刷新逻辑上 |
| FL   | FL-05 | 会话销毁（退出登录）           | 高             | 删除 Redis 会话的正确性与幂等性 |

---

## 2. 关键歧义点与建议

### 2.1 发送验证码接口设计（API-01, BR-02, DM-01）

**问题描述**

- PRD 仅以一句“发送验证码”提到 API-01，没有：
  - 请求体 schema（是否包含 `phone`、`scene`、`device_id` 等）；
  - 响应体结构（是否返回 `request_id` / `expire_at`）；
  - 限流与风控规则（每手机号/设备/IP 每分钟、每天上限等）；
  - 错误码定义（例如运营通道异常 vs 业务频率限制）。
- AI 生成后端控制器与风控逻辑时，只能凭经验假设，难以与前端、运维达成一致。

**建议补充（示意）**

在 9.2 中增加 API-01 的详细说明，并在 BR 或 ERR 中增加相应规则：

```md
API-01：发送登录验证码

- Method: POST
- Path: /api/passport/send-code
- Request Body:
  - phone: string（见 BR-09 手机号规则）
  - scene: string，固定为 "login"（预留其它场景）
- Response Body:
  - code: 200 表示发送成功
  - message: string

业务规则：
- 同一手机号在 60 秒内最多发送 1 次登录验证码；
- 同一手机号每日最多发送 N 次（N 待定）；
- 触发频率限制时返回错误码 ERR_CODE_TOO_FREQUENT。
```

---

### 2.2 登录/注册状态机与 User.status（US-01, BR-02, DM-01, BR-08）

**问题描述**

- BR-02 目前只区分“手机号存在/不存在”，而 User.status 有 3 种值：1 正常，0 封禁，-1 注销/删除：
  - 对 status=0 的用户，API-02 是否允许登录？
  - 对 status=-1 的用户，是视为全新注册（新 guid）还是恢复旧 guid？
- BR-08 已说明封禁时要删除 Redis 会话，但未明确登录时对封禁用户的接口行为。

**建议补充（示意）**

在 BR-02 中扩展：

```md
登录/注册判定扩展：

- 当手机号对应 User.status = 1（正常）：
  - 行为同现有描述，直接登录并签发 Token。
- 当 User.status = 0（封禁）：
  - API-02 必须返回 HTTP 403，错误码 ERR_USER_BANNED，不签发任何 Token，不创建/更新会话；
- 当 User.status = -1（注销/删除）：
  - 当前信息不足，需产品与风控评审后决定：
    - 方案 A：允许重新注册，生成新的 guid；
    - 方案 B：禁止重新注册，视同封禁；
```

并在 ERR 表中增加 ERR_USER_BANNED 等条目。

---

### 2.3 Token 刷新与验证错误码（BR-04, BR-05, FL-02, FL-03, API-03, API-04）

**问题描述**

- 虽然 9.1.1 标明 API-03、API-04 幂等，但错误场景仅以自然语言描述：
  - 刷新时 Refresh Token 不存在/不匹配/过期；
  - 验证时 Access Token 不匹配/过期/签名错误。
- 未明确 HTTP 状态码和错误码，AI 在实现时会随意使用 400/401/403/500。

**建议补充（示意）**

在 13 章增加 Token 错误码表，并在 BR-04/BR-05 中引用：

```md
Token 相关错误码示例：

- ERR_REFRESH_EXPIRED：Refresh Token 已过期（HTTP 401）
- ERR_REFRESH_MISMATCH：Refresh Token 与 Redis 中不一致（HTTP 401）
- ERR_ACCESS_EXPIRED：Access Token 已过期（HTTP 401）
- ERR_ACCESS_INVALID：Access Token 无法解析或签名错误（HTTP 401）
- ERR_APP_ID_MISMATCH：Token 中 app_id 与调用方不匹配（HTTP 403）
```

在 BR-04/BR-05 中加上：“上述场景必须返回对应错误码，供上游组件区分处理（刷新 vs 重新登录 vs 拒绝访问）。”

---

### 2.4 Session 状态机与 Redis TTL 对齐（DM-02, 6.2 状态机, BR-07）

**问题描述**

- 6.2 定义了 ST-01 ACTIVE、ST-02 EXPIRED、ST-03 DESTROYED，但未：
  - 绑定到 Redis key 状态（存在/不存在）；
  - 明确 TTL 到期 vs Refresh Token 过期谁优先生效；
  - 说明逻辑删除（封禁时）与自然过期的区分方式（是否记录在日志）。
- AI 在生成后台任务（清理脚本）或诊断工具时，容易混淆状态。

**建议补充（示意）**

在 6.2 中扩展定义：

```md
Redis 中的会话状态：

- ST-01 ACTIVE：
  - 条件：存在 key `session:{guid}`，且 `refresh_token_expires_at > now()`；
- ST-02 EXPIRED：
  - 条件：Redis key 不存在，且无显式封禁/退出记录；
  - 表示会话通过 TTL 或 Refresh Token 到期自然失效；
- ST-03 DESTROYED：
  - 条件：会话被显式删除（退出登录或封禁）；
  - 建议在登录日志或审计日志中记录销毁原因（logout / banned）。
```

---

### 2.5 退出登录与封禁的幂等与并发（FL-05, BR-07, BR-08, API-05）

**问题描述**

- BR-07/BR-08 要求“退出 = 全局退出”、“封禁 = 立即全局失效”，但未：
  - 明确 API-05 是否应设计为幂等（多次调用 DELETE session:{guid} 不视为错误）；
  - 指出封禁与退出并发发生时，以什么状态为准。

**建议补充（示意）**

在 BR-07/BR-08 中增加：

```md
- API-05（退出登录）以及封禁操作在删除 Redis 会话时必须是幂等的：
  - 若 `session:{guid}` 已不存在，仍视为成功，返回 200；
- 当封禁与退出在短时间内并发发生时：
  - 以封禁后的最终状态为准，即用户被封禁后不得再登录；
  - 无论何种顺序，最终应保证 Redis 中不存在 `session:{guid}`。
```
