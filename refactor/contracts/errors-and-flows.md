## Passport 错误码与典型流程速查表（草案）

> 目的：为前端 / 壳层 / Nest 后端等实现提供一个统一的错误码与流程语义对照表，
>  避免各自根据经验猜测含义。

### 1. 核心错误码对照

- `ERR_PHONE_INVALID`
  - 场景：手机号格式错误，或未找到对应的验证码记录。
  - 触发用例：登录（`AuthUseCase.login_with_phone`）。
  - 前端处理建议：提示用户“手机号或验证码不正确”，不清理现有会话。

- `ERR_CODE_INVALID`
  - 场景：验证码不匹配（用户输入错误）。
  - 触发用例：登录。
  - 前端处理建议：提示“验证码错误”，允许重试，尊重 PRD 中的输错次数限制策略。

- `ERR_CODE_EXPIRED`
  - 场景：验证码已过有效期。
  - 触发用例：登录。
  - 前端处理建议：提示“验证码已过期，请重新获取”，触发新的发送验证码流程。

- `ERR_CODE_TOO_FREQUENT`
  - 场景：用户在短时间内重复请求发送验证码，触发风控/频控策略。
  - 触发用例：发送验证码接口（当前在 Nest 实现中已使用，Python 参考实现中暂未实现发送逻辑）。
  - 前端处理建议：
    - 提示“操作过于频繁，请稍后再试”；
    - 阻止立即重复请求，可配合按钮倒计时或灰显处理。

- `ERR_USER_BANNED`
  - 场景：用户被封禁。
  - 触发用例：登录；封禁用例（`BanUseCase`）会更新状态并清理会话。
  - 前端/壳层处理建议：
    - 展示封禁原因（若上层有更详细字段）；
    - 清理本地会话数据并阻止自动重试登录。

- `ERR_REFRESH_EXPIRED`
  - 场景：刷新 Token 时，Session 不存在或 Refresh Token 已过期。
  - 触发用例：`TokenRefreshUseCase.refresh_access_token`。
  - 前端/壳层处理建议：
    - 立即清理本地 Refresh Token 与 Access Token；
    - 强制跳转登录页或触发重新登录流程；
    - 在多 app 场景下，按照 PRD 规则通知其他客户端注销。

- `ERR_REFRESH_MISMATCH`
  - 场景：请求中的 Refresh Token 与服务端保存的不一致（可能是串号或过期缓存）。
  - 触发用例：刷新 Token。
  - 前端/壳层处理建议：与 `ERR_REFRESH_EXPIRED` 相同，视为不可恢复的会话，需要重新登录。

- `ERR_ACCESS_EXPIRED` / `ERR_ACCESS_INVALID`
  - 场景：Access Token 已过期或非法。
  - 触发用例：后续在 API 网关 / Passport 服务的鉴权逻辑中使用（Python 参考实现中暂未完全展开）。
  - 前端/壳层处理建议：
    - 默认先尝试调用刷新接口（若仍在 Refresh 有效期）；
    - 刷新失败后再按照 `ERR_REFRESH_EXPIRED` 策略处理。

- `ERR_SESSION_NOT_FOUND`
  - 场景：服务端未找到对应 GUID 或 Access Token 的会话记录。
  - 触发用例：Nest TokenService 刷新/校验逻辑中已使用；Python 参考实现目前将其归入 `ERR_REFRESH_EXPIRED` 的一类情况。
  - 前端/壳层处理建议：
    - 与 `ERR_REFRESH_EXPIRED` 类似，视为不可恢复会话，直接清理本地会话并重定向登录；
    - 可在诊断日志中区分“过期”和“从未存在/已被服务端清理”。

- `ERR_INTERNAL`
  - 场景：服务端内部错误（例如 Redis/DB 故障）被包装为统一的对外错误码。
  - 触发用例：Nest TokenService / AuthService 等在捕获非 AuthException 异常时使用。
  - 前端/壳层处理建议：
    - 展示通用的“系统繁忙，请稍后再试”；
    - 不主动清理本地会话，让用户稍后重试；
    - 建议配合监控/告警，以便后端排查。

> 说明：上述错误码常量在 Python 参考实现中由 `refactor.backend.domain` 定义，
>  Nest 后端与前端/壳层应复用相同字符串，以减少跨语言集成成本。

### 2. 典型流程与契约要点

#### 2.1 登录流程（手机号 + 验证码）

- 用例入口：`AuthUseCase.login_with_phone(phone, code, app_id)`。
- 关键行为：
  - 校验手机号格式（失败 -> `ERR_PHONE_INVALID`）；
  - 从 `VerificationCodeStore` 读取验证码：
    - 不存在 -> `ERR_PHONE_INVALID`（无记录视为非法请求）；
    - 过期 -> `ERR_CODE_EXPIRED`；
    - 不匹配 -> `ERR_CODE_INVALID`；
  - 根据用户状态：
    - 无用户 -> 根据 BR-02 注册新用户并生成 GUID；
    - `BANNED` -> `ERR_USER_BANNED`；
    - `DELETED` -> 按原 user_type 生成新 GUID 并视为新用户。
  - 创建 Session：
    - 生成 Refresh Token 与 Access Token；
    - 为当前 `app_id` 建立 `AppSession`；
    - 写入 SessionStore。
- 契约要点（对 Nest/前端/壳层）：
  - 响应体需至少包含：`guid`, `access_token`, `refresh_token`, `access_token_expires_at`, `refresh_token_expires_at`, `user_status`, `account_source`；
  - 错误返回需携带上述错误码之一，前端据此渲染文案与后续动作。

#### 2.2 Token 刷新流程

- 用例入口：`TokenRefreshUseCase.refresh_access_token(guid, refresh_token, app_id)`。
- 关键行为：
  - 若 Session 不存在或 Refresh Token 已过期 -> `ERR_REFRESH_EXPIRED`；
  - 若 Refresh Token 不匹配 -> `ERR_REFRESH_MISMATCH`；
  - 否则：
    - 为当前 `app_id` 生成新的 Access Token 与过期时间；
    - 更新 `last_active_at`；
    - 不改变 Refresh Token 与其过期时间。
- 契约要点：
  - 同一 GUID 的 Refresh Token 应跨 app 共享；
  - 前端/壳层在调用刷新接口时，需明确传入 `guid`、`refresh_token` 与当前 `app_id`；
  - 刷新成功后，客户端仅更新 Access Token 相关信息。

#### 2.3 退出登录流程

- 用例入口：`LogoutUseCase.logout(guid)`。
- 关键行为：
  - 按 GUID 删除 Session（幂等）；
  - 本地/壳层负责清理本地会话文件与 Token。
- 契约要点：
  - 上层在调用时需确保 GUID 来源可信（通常来自当前有效的 Access Token 解析结果）。

### 3. 使用建议

- Nest 后端：
  - 在控制器层返回与 Python 参考实现相同的错误码字符串；
  - 尽量复用 `refactor` 目录中的领域/用例定义，或在 TS 中建立等价的类型与枚举。
- Web 前端与客户端壳层：
  - 按本文件中的“前端处理建议”对错误码进行分类处理；
  - 将错误码映射到产品文案时，保留错误码以便排查问题（例如在日志或上报中携带）。
