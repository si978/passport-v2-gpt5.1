## Nest 后端与 Python 参考实现对齐分析（草案）

> 目的：分析 `dev/backend-node` 中 Nest 版 Passport 服务与
> `refactor/backend` Python 参考实现之间的契约一致性，为后续统一收敛提供依据。

### 1. 范围与对象

- Python 参考实现：
  - 领域与用例：`refactor/backend/domain`, `refactor/backend/application/*`；
  - 错误码与流程契约：`refactor/contracts/errors-and-flows.md`。
- Nest 实现：
  - 错误定义与映射：`dev/backend-node/src/auth/auth-error.ts`, `auth-exception.filter.ts`；
  - 登录/注销/刷新等服务：`auth.service.ts`, `token.service.ts`；
  - 会话与用户实体：`session-store.ts`, `session.types.ts`, `user.entity.ts` 等。

### 2. 初步发现（结构层面）

- Nest auth 模块结构清晰：
  - `auth.service.ts`：对应 Python 的 `AuthUseCase`（登录/注册主流程）。
  - `token.service.ts`：对应 Python 的 `TokenRefreshUseCase`。 
  - `login-log.service.ts`, `audit-log.service.ts` 等：对应 Python 侧的 `LoginLogUseCase` 等。
  - `auth-error.ts` + `auth-exception.filter.ts`：集中式错误码与 HTTP 映射。
- 存在专门的 `session-store.ts` 与 `session.types.ts`：
  - 与 Python 中的 `Session`/`AppSession` 结构类似，用于在 Redis/内存中存储会话。
  - 说明 Nest 版本已经在技术选型上向生产形态靠拢。

> 详细的错误码集合、API 入参/出参及行为差异，将在阅读源码后分条列出并更新本文件。

### 2.1 错误码映射（Python vs Nest）

| 业务含义                 | Python 常量                      | Nest 枚举 (`AuthErrorCode`)      | 备注 |
|--------------------------|----------------------------------|----------------------------------|------|
| 验证码无效               | `ERR_CODE_INVALID`              | `ERR_CODE_INVALID`              | 一致 |
| 验证码过期               | `ERR_CODE_EXPIRED`              | `ERR_CODE_EXPIRED`              | 一致 |
| 验证码发送过于频繁       | _暂无_                           | `ERR_CODE_TOO_FREQUENT`         | Nest 侧扩展，建议在契约层补充说明并在 Python 侧预留 |
| 手机号格式/验证码记录异常 | `ERR_PHONE_INVALID`              | `ERR_PHONE_INVALID`              | 一致，Python 侧“无记录”也用此码 |
| 用户被封禁               | `ERR_USER_BANNED`               | `ERR_USER_BANNED`               | 一致 |
| Refresh Token 过期/会话过期 | `ERR_REFRESH_EXPIRED`          | `ERR_REFRESH_EXPIRED`           | 一致 |
| Refresh Token 不匹配     | `ERR_REFRESH_MISMATCH`          | `ERR_REFRESH_MISMATCH`          | 一致 |
| app_id 不匹配            | `ERR_APP_ID_MISMATCH`           | `ERR_APP_ID_MISMATCH`           | 一致（主要在 Access 校验中使用） |
| Access Token 过期        | `ERR_ACCESS_EXPIRED`            | `ERR_ACCESS_EXPIRED`            | 一致（Nest 已实现完整校验逻辑） |
| Access Token 非法        | `ERR_ACCESS_INVALID`            | `ERR_ACCESS_INVALID`            | 一致 |
| 会话未找到               | _暂无（使用 `ERR_REFRESH_EXPIRED`）_ | `ERR_SESSION_NOT_FOUND`    | Nest 将“会话不存在”单独抽出，Python 目前将其视为刷新过期的一种 |
| 服务内部错误             | _暂无_                           | `ERR_INTERNAL`                  | Nest 侧用于包装非 AuthException 的异常，建议在契约层统一 |

从上表可以看出：

- 登录与刷新相关的核心错误码在 Python 与 Nest 间是一致的；
- Nest 对“验证码频控”“会话不存在”“内部错误”等场景做了额外细分；
- 为了统一契约，建议：
  - 在 `errors-and-flows.md` 中纳入 `ERR_CODE_TOO_FREQUENT` / `ERR_SESSION_NOT_FOUND` / `ERR_INTERNAL` 三类错误码；
  - 在 Python 参考实现中预留这些常量（即便短期内仅在文档或测试中使用），避免未来出现“实现中有、契约中没有”的情况。

### 3. 对齐目标（规划）

1. 错误码集合与语义一致：
   - Nest `AuthErrorCode` 或等价枚举中的值，应与 `refactor.backend.domain` 中的常量保持一一对应；
   - 对同一业务场景（如刷新 Token 过期、验证码错误），后端不同实现必须使用相同错误码字符串。

2. 登录/刷新/退出 API 契约一致：
   - 请求参数：手机号/验证码/app_id/guid/refresh_token 等字段命名与语义一致；
   - 响应体：至少包含 Python 契约文档中列出的字段，或有明确的映射关系；
   - 行为：
     - 新用户注册/注销用户重新生成 GUID；
     - 多 app SSO 刷新策略（共享 Refresh Token，按 app_id 拆分 Access Token）。

3. 会话结构一致：
   - Nest 中的 `Session`/`AppSession` 或等价类型，应包含与 Python 参考实现相同的字段和 TTL 规则；
   - 对多 app 的支持方式一致（以 app_id 为 key 的子会话映射）。

4. 对前端/壳层的契约一致：
   - 错误码与处理建议以 `errors-and-flows.md` 为源；
   - Nest 控制器返回的结构能被前端/壳层直接消费或通过薄适配层消费。

### 4. 行为流程对照（Python vs Nest）

> 以下仅列出关键用例的行为对照，便于在后续修改时有“金标准”。

#### 4.1 登录（手机号 + 验证码）

- Python：`AuthUseCase.login_with_phone(phone, code, app_id)`
  1. 验证手机号格式（不合法 -> `ERR_PHONE_INVALID`）。
  2. 从 `VerificationCodeStore` 读取验证码：
     - 无记录 -> `ERR_PHONE_INVALID`；
     - 已过期 -> `ERR_CODE_EXPIRED`；
     - 不匹配 -> `ERR_CODE_INVALID`。
  3. 用户状态判断：
     - 不存在 -> 按 user_type=1 生成 GUID 并创建新用户（`account_source=phone`，`status=ACTIVE`）。
     - `BANNED` -> 抛 `ERR_USER_BANNED`。
     - `DELETED` -> 生成新 GUID，保留 user_type/account_source，视为新用户。
  4. 生成 Refresh/Access Token，TTL 为 2 天 / 4 小时；为当前 app_id 创建 `AppSession` 并写入 SessionStore。
  5. 返回 LoginResult DTO（guid, access_token, refresh_token, 两个过期时间等）。

- Nest：`AuthService.loginByPhone(dto: LoginByPhoneDto)`
  1. 调用 `VerificationCodeService.validateCode(phone, code, now)`：
     - 逻辑与 Python 一致（错误码相同），额外可能抛出 `ERR_CODE_TOO_FREQUENT`。
  2. 使用 TypeORM 按 `phone` 查询 `User` 实体：
     - 不存在 -> 使用 `GuidGenerator.generate(1, now)` 创建用户，字段与 Python 约定一致；
     - `status === 0` -> 记录登录日志（errorCode=`ERR_USER_BANNED`）并抛 `AuthException(ERR_USER_BANNED)`；
     - `status === -1` -> 生成新 GUID，将状态改为 1 并保存。
  3. 生成 Refresh/Access Token，TTL 为 2 天 / 4 小时；构建 `Session`（包含 userType, accountSource, roles, apps[app_id]）；写入 `SessionStore`。
  4. 通过 `LoginLogService` 记录登录行为。
  5. 返回 `LoginResponseDto`：在 Python 契约字段基础上，增加了 `user_type` 文本和 `roles`。

结论：

- 行为和错误码与 Python 参考实现一致，Nest 在日志与角色信息上更丰富；
- 前端/壳层可以以 Python 契约为最小集，Nest 返回的是其超集。

#### 4.2 Token 刷新

- Python：`TokenRefreshUseCase.refresh_access_token(guid, refresh_token, app_id)`
  1. 从 SessionStore 获取 Session：
     - 不存在或 Refresh 过期 -> `ERR_REFRESH_EXPIRED`；
     - Refresh 不匹配 -> `ERR_REFRESH_MISMATCH`。
  2. 生成新的 Access Token 和过期时间；更新指定 app_id 的 `AppSession`；
  3. 不改变 Refresh Token 与其过期时间；
  4. 返回新的 LoginResult（包含新 Access Token 与过期时间）。

- Nest：`TokenService.refreshAccessToken(guid, dto: RefreshTokenDto)`
  1. 从 `SessionStore.get(guid)` 获取 Session：
     - 不存在 -> 抛 `ERR_SESSION_NOT_FOUND`；
     - Refresh 过期 -> 抛 `ERR_REFRESH_EXPIRED`；
     - Refresh 不匹配 -> 抛 `ERR_REFRESH_MISMATCH`。
  2. 生成新的 Access Token 和过期时间；按 app_id 更新/创建 `AppSession`；
     - 若是首次在该 app 登录，则调用 `auditLog.recordSsoLogin(guid, app_id)`。
  3. 写回 SessionStore；
  4. 返回 `LoginResponseDto`，与登录时的结构一致。

结论：

- 刷新逻辑与 Python 一致，追加了更细致的错误码（`ERR_SESSION_NOT_FOUND`）与 SSO 审计记录；
- 在契约层可以认为：`ERR_SESSION_NOT_FOUND` 与 `ERR_REFRESH_EXPIRED` 都属于“会话不可恢复，需要重新登录”的类别。

#### 4.3 退出登录与 Access Token 校验

- Python：
  - 退出登录：`LogoutUseCase.logout(guid)` 仅按 guid 删除 Session，幂等；
  - Access Token 校验：当前参考实现未完全展开，行为以 Nest 为准。

- Nest：`TokenService.logoutByAccessToken` / `logoutByGuid` / `verifyAccessToken`
  - `logoutByAccessToken(accessToken)`：
    - 通过 `SessionStore.findByAccessToken` 查会话；
    - 找不到时视为幂等成功；
    - 记录 logout 日志并删除 Session。
  - `logoutByGuid(guid)`：
    - 通过 `SessionStore.get(guid)` 获取 Session；
    - 找不到时视为幂等成功；
    - 记录 logout 日志并删除 Session。
  - `verifyAccessToken(dto: VerifyTokenDto)`：
    - 通过 `findByAccessToken` 查 Session；
    - 查不到或找不到匹配 appSession -> `ERR_ACCESS_INVALID`；
    - Access 过期 -> `ERR_ACCESS_EXPIRED`；
    - app_id 不匹配 -> `ERR_APP_ID_MISMATCH`；
    - 否则返回 guid/app_id/expires_at。

结论：

- 登出行为在两边保持幂等语义；
- Access Token 校验在 Nest 中已是“权威实现”，Python 参考实现可以在需要时向其靠拢。

### 5. 下一步工作

- [x] 逐文件阅读 `auth-error.ts`，列出 Nest 错误码枚举与 Python 错误码常量的映射表；
- [x] 初步分析 `auth.service.ts` 与 `token.service.ts` 中的登录/刷新/登出/验证逻辑，与 Python 用例行为对比；
- [x] 补充关键行为流程对照（本文件第 4 节）；
- [ ] 给出“保持兼容前提下的收敛方案”，包括：
  - 在 Nest 侧引入一个来源于 `refactor/contracts` 的统一错误码/DTO 定义；
  - 在 Python 侧补充频控/内部错误相关逻辑或测试；
  - 为前端/壳层定义一组通用的错误码处理策略和中间层封装。
