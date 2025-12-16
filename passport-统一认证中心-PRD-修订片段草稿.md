# Passport 统一认证中心 - PRD 修订片段草稿

> 说明：本文件选取《passport-统一认证中心-PRD（V1 已决策）》中的 2 个典型片段（API-02 登录 & FL-04 SSO 流程），展示“当前版本”与“建议修订版本”的对比，便于后续在主 PRD 中落地修改。US/BR/FL 编号保持不变。

---

## 1. 片段一：API-02 手机号登录/注册接口

### 1.1 当前 PRD 版本（节选）

> 摘自现有 PRD 的 9.1 / 9.2，略去与本片段无关的部分。

```md
### 9.1 接口列表（语义级）

| ID     | 功能             | 说明 |
| ------ | ---------------- | ---- |
| API-01 | 发送验证码       | 向指定手机号发送登录/注册用验证码。原文仅在流程中提及，未给出 JSON 示例。 |
| API-02 | 手机号登录/注册  | 依据手机号 + 验证码完成登录，若手机号不存在则自动注册后登录。 |
| API-03 | 刷新 Access Token | 使用 Refresh Token 刷新 Access Token。 |
...

#### 9.2 示例接口说明（基于原文 JSON 示例）

> 当前 PRD 仅对 API-03、API-04 给出了 JSON 示例，对 API-02 未给出完整请求/响应示例。
```

### 1.2 建议修订版本（示意稿）

```md
#### API-02 手机号登录/注册

- Method: POST
- Path: /api/passport/login-by-phone
- 调用方：AC-02 客户端应用（Web 前端通过壳层发起 HTTP 请求）
- 功能摘要：依据手机号 + 短信验证码完成登录；若手机号在 User 表中不存在，则自动注册后登录。

**请求体（JSON）**

```json
{
  "phone": "13800138000",
  "code": "123456",
  "app_id": "jiuweihu"
}
```

**成功响应（HTTP 200, JSON）**

```json
{
  "code": 200,
  "message": "登录成功",
  "data": {
    "guid": "20251114011234567890",
    "access_token": "...",
    "refresh_token": "...",
    "user_status": 1,
    "account_source": "jiuweihu"
  }
}
```

**失败响应示例**

- 验证码错误/过期：
  - HTTP 400, `code = "ERR_CODE_INVALID" | "ERR_CODE_EXPIRED"`
- 频率超限：
  - HTTP 429, `code = "ERR_CODE_TOO_FREQUENT"`
- 用户被封禁（BR-08）：
  - HTTP 403, `code = "ERR_USER_BANNED"`

错误码的完整列表与含义见第 13 章《异常处理 & 错误码（ERR）》。
```

> 实际落地时，可将“建议修订版本”替换主 PRD 的 API-02 相关段落，并将错误码同步到第 13 章。

---

## 2. 片段二：FL-04 跨客户端 SSO 流程

### 2.1 当前 PRD 版本（节选）

> 摘自现有 PRD 的 6.1 FL-04，保留主要步骤。

```md
#### FL-04 跨客户端 SSO 流程

- 适用范围：用户已在一个客户端登录，打开另一个客户端时自动登录。
- 关联用户故事：US-02。
- 步骤（对应原文“详细流程”）：
  1. 用户在九尾狐客户端登录成功。
  2. 九尾狐将会话信息写入本地加密文件 `C:\\ProgramData\\Passport\\session.dat`。
  3. 用户打开游利社客户端。
  4. 游利社检测本地会话文件：
     - 若不存在：直接展示登录页面。
     - 若存在：读取并解密，检查会话是否过期（4 小时）。
  5. 若会话未过期：
     - 游利社使用其中的 Refresh Token 调用服务端刷新 Token 接口，获取游利社自身的 Access Token。
     - 自动完成登录，并更新本地会话文件（更新 `last_app` 字段等）。
  6. 若会话已过期：
     - 游利社展示登录页面，要求用户重新登录。
```

### 2.2 建议修订版本（示意稿，强调分层与生命周期）

```md
#### FL-04 跨客户端 SSO 流程（修订稿）

- 适用范围：用户已在一个 Passport 集成客户端（如九尾狐）登录，随后在同一 Windows 用户环境下打开另一个客户端（如游利社）时，希望自动登录。
- 关联用户故事：US-02。

**壳层启动策略**

1. 当 Passport 集成客户端进程启动且首次创建主窗口时：
   - 壳层调用原生模块 `read_session_file()`：
     - 若返回 `ERR_SESSION_NOT_FOUND`：通过 IPC 发送 `session.status = "none"` 给前端，前端展示登录页；
     - 若返回 `ERR_SESSION_CORRUPTED`：壳层删除 `session.dat`，发送 `session.status = "none"`；
     - 若返回合法 `LocalSession` 对象：继续执行步骤 2。
2. 壳层检查 LocalSession：若 `created_at` 距当前时间超过 2 小时，则删除 `session.dat`，并通知前端 `session.status = "none"`；否则通知前端 `session.status = "sso_available"`，并附带 `guid` 与 `refresh_token`。

**前端自动登录流程**

3. 当前端收到 `session.status = "sso_available"` 时：
   - 使用壳层提供的 `refresh_token` 和自身 `app_id` 调用 API-03 刷新 Token；
   - 刷新成功后进入已登录态，并通过 IPC 通知壳层，壳层调用 `write_session_file()` 更新 `last_app`、`updated_at` 字段。
4. 若 API-03 刷新失败（例如 Refresh Token 过期或不匹配）：
   - 前端清空本地登录态，通知壳层执行 `clearSession()`，并展示登录页。

> 通过上述拆分，明确了壳层/原生模块/前端在 FL-04 中的职责分工，有利于多端实现与 AI 代码生成保持一致。
```
