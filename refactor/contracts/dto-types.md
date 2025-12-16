## Passport 核心 DTO 类型定义（跨实现草案）

> 目的：为 Python 参考实现、Nest 后端、前端与壳层提供一套统一的
> 请求/响应数据结构定义，减少各自重复发明与偏差。

### 1. 登录请求与响应

#### 1.1 登录请求（LoginByPhoneRequest）

```ts
type LoginByPhoneRequest = {
  phone: string;    // 手机号（11 位）
  code: string;     // 短信验证码（6 位）
  app_id: string;   // 调用方应用标识，用于区分多 app SSO 会话
};
```

#### 1.2 登录响应（LoginResponse）

> 对应 Python `LoginResult` / Nest `LoginResponseDto`

```ts
type LoginResponse = {
  guid: string;                 // 用户 GUID
  access_token: string;         // 当前 app 的 Access Token
  refresh_token: string;        // 跨 app 共享的 Refresh Token
  user_status: 1 | 0 | -1;      // 对应 UserStatus.ACTIVE/BANNED/DELETED
  account_source: string;       // 账号来源，例如 'phone'

  access_token_expires_at: string;   // ISO8601 格式
  refresh_token_expires_at: string;  // ISO8601 格式
  expires_in?: number;               // Access Token 剩余秒数（Nest 已提供，Python 可按需补充）

  // Nest 扩展字段（可选）：
  user_type?: string;           // 用户类型标签（如 'admin'/'user'）
  roles?: string[];             // 角色列表
};
```

### 2. Token 刷新请求与响应

#### 2.1 刷新请求（RefreshTokenRequest）

```ts
type RefreshTokenRequest = {
  guid: string;           // 当前用户 GUID
  refresh_token: string;  // 当前持有的 Refresh Token
  app_id: string;         // 当前应用标识
};
```

#### 2.2 刷新响应

> 与 LoginResponse 结构保持一致，以便前端/壳层复用处理逻辑。

```ts
type RefreshTokenResponse = LoginResponse;
```

### 3. 退出登录与本地会话

#### 3.1 退出请求

> 退出可以有多种入口（按 guid / 按 access_token），契约层统一建议：

```ts
type LogoutByGuidRequest = { guid: string };

type LogoutByAccessTokenRequest = { access_token: string };
```

#### 3.2 本地会话结构（LocalSession）

> 由壳层/原生模块负责读写，结构需与服务器侧 Session/Token 契约保持可推导关系。

```ts
type LocalSession = {
  guid: string;
  phone: string;
  created_at: string;      // ISO8601
  expires_at: string;      // ISO8601，对应 RefreshToken 生命周期
  refresh_token: string;
};
```

### 4. Access Token 校验

#### 4.1 校验请求

```ts
type VerifyAccessTokenRequest = {
  access_token: string;
  app_id: string;     // 调用方声明的 app_id，用于检查 app_id 与 token 所属的一致性
};
```

#### 4.2 校验响应

```ts
type VerifyAccessTokenResponse = {
  guid: string;
  app_id: string;
  expires_at: string;   // Access Token 过期时间（ISO8601）
};
```

### 5. 错误响应统一结构

> 无论是 Python、Nest 还是网关，建议对外错误响应采用统一结构：

```ts
type ErrorResponse = {
  code: string;        // 错误码，如 'ERR_REFRESH_EXPIRED'
  message: string;     // 面向开发/日志的简短说明
  // 可选的调试字段（仅在内部环境或特定 header 下返回）：
  trace_id?: string;
  detail?: unknown;
};
```

### 6. 对实现方的约束

- Python 参考实现：
  - 当前的 `LoginResult` / `TokenRefreshUseCase` 返回结构应对齐 `LoginResponse`；
  - 新增字段（如 `expires_in`）时应先在本文件中更新定义，再落地实现。
- Nest 后端：
  - `LoginByPhoneDto` / `LoginResponseDto` / `RefreshTokenDto` / `VerifyTokenDto` 等应与上述类型保持一致；
  - 推荐在 TS 中直接定义与本文件对应的类型/接口，并在 controller 层统一使用。
- 前端/壳层：
  - 消费登录/刷新/校验接口时，应以这些 DTO 为基准；
  - 错误处理逻辑应基于 `ErrorResponse.code` 与 `errors-and-flows.md` 中的策略。
