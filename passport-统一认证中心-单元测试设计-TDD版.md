# Passport 统一认证中心 - 函数级 TDD 单元测试设计（与 Dev Plan / PRD 对齐）

> 基线：
> - 需求：`passport-统一认证中心-PRD-草稿.md`（V1 多视图对齐版，v1.1，SSoT）
> - 开发计划：`passport-统一认证中心-开发计划.md`（AUTH-01 / SSO-02 / SESS-03 / ADMIN-04，Cycle1～Cycle29）
> - 集成/E2E 测试：`passport-统一认证中心-测试用例-DevPlan对齐版.md`

本文件将现有 **Story/FL/Cycle 级测试** 进一步拆解为 **函数级单元测试设计**，用于支持经典 TDD（先写失败的单测 → 写最小实现 → 重构）。  
每条单测用例均标明：关联函数、Cycle、US/FL/BR/ERR。

---

## 0. 约定：单元测试命名与映射规则

- **单元测试 ID**：`UT-<MOD>-<COMP>-<FN>-<序号>`
  - MOD ∈ {AUTH, SSO, SESS, ADMIN}
  - COMP：组件或类名简称（如 AuthSvc, TokenSvc, LocalSessVal）
  - FN：函数名（简写）
  - 序号：两位编号，从 01 开始
- **每条单测的结构**：
  - 目标函数：`Component.function(...)`
  - 关联 Cycle：从 Cycle1～Cycle29 中选择（可以多个）
  - 关联 US / FL / BR / ERR：对应 PRD 定义
  - 前置条件
  - 输入
  - 断言（预期行为）

> 说明：这里的“组件/函数”是逻辑设计抽象，不限定具体语言/框架；在编码阶段可映射为类/方法、模块/函数等。

---

## 1. AUTH-01 模块：身份认证与登录注册

### 1.1 VerificationCodeService（验证码发送与校验，BR-09 / API-01）

#### 1.1.1 `VerificationCodeService.sendCode(phone, scene)`

- **对应 Cycle**：Cycle21（FE 调用约束）、Cycle22（BE 实现）、Cycle23（QA 校验）
- **关联需求**：US-01, FL-06, BR-09, ERR_CODE_TOO_FREQUENT / ERR_PHONE_INVALID

**UT-AUTH-VC-SEND-01** 合法手机号首次发送成功  
- 前置：缓存中不存在该手机号近期发送记录  
- 输入：`phone="13800138000"`, `scene="login"`  
- 断言：
  - 返回 `Result.success`，内部生成 6 位数字验证码；
  - 写缓存：`code="\d{6}"`，`ttl=5min`；
  - 记录频率窗口内的发送计数为 1。

**UT-AUTH-VC-SEND-02** 非法手机号拒绝发送  
- 前置：无  
- 输入：`phone="123456"`, `scene="login"`  
- 断言：
  - 返回错误 `ERR_PHONE_INVALID`；
  - 不调用短信网关，不写验证码缓存。

**UT-AUTH-VC-SEND-03** 频率超限返回 ERR_CODE_TOO_FREQUENT  
- 前置：缓存中已有该手机号近期发送次数达到阈值（如 3 次/5 分钟）  
- 输入：`phone="13800138000"`, `scene="login"`  
- 断言：
  - 返回错误 `ERR_CODE_TOO_FREQUENT`；
  - 不生成新验证码 不更新缓存计数。

#### 1.1.2 `VerificationCodeService.validateCode(phone, code, now)`

- **对应 Cycle**：Cycle2（登录流程中使用）、Cycle23（QA）
- **关联需求**：BR-09、ERR_CODE_INVALID / ERR_CODE_EXPIRED

**UT-AUTH-VC-VAL-01** 正确验证码校验通过  
- 前置：缓存中存在 `{phone="P1", code="C1", expireAt=now+3min}`  
- 输入：`phone="P1"`, `code="C1"`, `now`  
- 断言：
  - 返回 `true`；
  - 可选：使用一次后删除或标记为已用。

**UT-AUTH-VC-VAL-02** 错误验证码返回 ERR_CODE_INVALID  
- 前置：缓存中 `{phone="P1", code="C1"}`  
- 输入：`phone="P1"`, `code="WRONG"`, `now`  
- 断言：
  - 抛出/返回错误 `ERR_CODE_INVALID`；
  - 不删除缓存记录（防止暴力尝试仍需要过期控制）。

**UT-AUTH-VC-VAL-03** 过期验证码返回 ERR_CODE_EXPIRED  
- 前置：缓存中 `{phone="P1", code="C1", expireAt=now-1s}`  
- 输入：`phone="P1"`, `code="C1"`, `now`  
- 断言：
  - 返回错误 `ERR_CODE_EXPIRED`；
  - 删除缓存记录或标记为失效。

---

### 1.2 GuidGenerator（GUID 生成，BR-01）

#### `GuidGenerator.generate(userType)`

- **对应 Cycle**：Cycle2、Cycle3（登录/注册）
- **关联需求**：BR-01

**UT-AUTH-GUID-GEN-01** GUID 格式正确  
- 前置：`now = 2025-12-01`  
- 输入：`userType="01"`  
- 断言：
  - 返回字符串长度 20；
  - 前 8 位等于 `20251201`；
  - 中间 2 位等于 `"01"`；
  - 后 10 位为数字。

**UT-AUTH-GUID-GEN-02** 同一请求多次生成不重复  
- 前置：无  
- 输入：循环调用 `generate("01")` 1 万次  
- 断言：所有 GUID 唯一（无重复）。

---

### 1.3 AuthService（手机号登录/注册主流程，BR-02 / US-01 / FL-01）

#### `AuthService.loginWithPhone(phone, code, appId)`

- **对应 Cycle**：Cycle2, Cycle3（登录/注册）；Cycle1（FE 调用）
- **关联需求**：US-01, FL-01, BR-02, C-01, BR-08, ERR_USER_BANNED

**UT-AUTH-AUTH-LOGIN-01** 已存在用户 + 正常状态 → 登录路径  
- 前置：
  - UserRepo 中：`phone=P1, status=1, guid=G1`；
  - VerificationCodeService.validateCode 已在单测中验证，此处模拟返回 true。
- 输入：`phone=P1, code=C1, appId="jiuweihu"`  
- 断言：
  - 不调用`UserRepo.create`；
  - 返回 `guid=G1`；
  - 调用 `SessionService.createSession(G1, ...)`。

**UT-AUTH-AUTH-LOGIN-02** 不存在用户 → 注册 + 登录  
- 前置：UserRepo.findByPhone(P2) 返回 null  
- 输入：`phone=P2, code=C1, appId`  
- 断言：
  - 调用 `GuidGenerator.generate` 一次；
  - 调用 `UserRepo.create` 写入新用户；
  - 返回新 GUID，并创建会话。

**UT-AUTH-AUTH-LOGIN-03** 封禁用户 → ERR_USER_BANNED  
- 前置：UserRepo 返回 `status=0`  
- 输入：`phone=P3, code=C1, appId`  
- 断言：
  - 不调用 create/update User；
  - 不创建会话；
  - 返回错误码 `ERR_USER_BANNED`。

**UT-AUTH-AUTH-LOGIN-04** 注销用户（status=-1） → 当新用户处理（C-01）  
- 前置：UserRepo 返回 `status=-1` + 旧 GUID `G_old`  
- 输入：`phone=P4, code=C1, appId`  
- 断言：
  - 调用 `UserRepo.create` 新用户记录，GUID != G_old；
  - 不修改原 status=-1 记录；
  - 返回新 GUID 并创建新会话。

---

### 1.4 TokenService（刷新 Token，BR-03/04，FL-02）

#### `TokenService.refreshAccessToken(refreshToken, appId, now)`

- **对应 Cycle**：Cycle6（BE 刷新）、Cycle4/5/7（FE/SH/QA）
- **关联需求**：FL-02、BR-03/04、ERR_REFRESH_EXPIRED / MISMATCH / ERR_APP_ID_MISMATCH

**UT-AUTH-TOKEN-REF-01** 正常刷新成功  
- 前置：
  - 从 Refresh Token 解出 `guid=G1, appId=jiuweihu, issuedAt=t0`；
  - Redis 中有 `session:G1`，包含相同 `refresh_token`，未过期。
- 输入：`refreshToken=T1, appId="jiuweihu", now=t0+3h`  
- 断言：
  - 生成新 Access Token `AT2`（过期时间 4 小时后）；
  - 更新 Redis 中 `apps.jiuweihu.access_token=AT2`；
  - 返回 `AT2` 与 `expires_in=4h`。

**UT-AUTH-TOKEN-REF-02** Refresh Token 过期 → ERR_REFRESH_EXPIRED  
- 前置：`now > issuedAt + 2d`（或 `refresh_token_expires_at < now`）  
- 输入：`refreshToken=T1, appId`  
- 断言：
  - 抛出/返回 `ERR_REFRESH_EXPIRED`；
  - 不更新 Redis 会话。

**UT-AUTH-TOKEN-REF-03** Refresh Token 不匹配 → ERR_REFRESH_MISMATCH  
- 前置：
  - Token 内部 `refreshToken=T1`；
  - Redis `session:G1.refresh_token=T2`（T1 != T2）。
- 输入：`refreshToken=T1, appId`  
- 断言：返回 `ERR_REFRESH_MISMATCH`。

**UT-AUTH-TOKEN-REF-04** app_id 不匹配 → ERR_APP_ID_MISMATCH  
- 前置：Token 解出 `appId="jiuweihu"`，调用参数 `appId="youlishe"`  
- 输入：`refreshToken=T1, appId="youlishe"`  
- 断言：返回 `ERR_APP_ID_MISMATCH`。

---

### 1.5 TokenValidator（Access Token 验证，BR-05，FL-03）

#### `TokenValidator.validateAccessToken(accessToken, appId)`

- **对应 Cycle**：Cycle9（BE 鉴权）、Cycle8/10（FE/QA）
- **关联需求**：FL-03, BR-05, ERR_ACCESS_EXPIRED / INVALID / ERR_APP_ID_MISMATCH

**UT-AUTH-TOKEN-VAL-01** 有效 Token 验证通过  
- 前置：Token 解密/验签成功，`guid=G1, appId=jiuweihu, exp=now+1h`；Redis 中 session 存在并持有该 Token。  
- 输入：`accessToken=AT1, appId="jiuweihu"`  
- 断言：返回 `ValidResult(guid=G1, isValid=true)`，无错误。

**UT-AUTH-TOKEN-VAL-02** Token 过期 → ERR_ACCESS_EXPIRED  
- 前置：`exp < now`  
- 输入：同上  
- 断言：返回 `ERR_ACCESS_EXPIRED`。

**UT-AUTH-TOKEN-VAL-03** 签名错误 → ERR_ACCESS_INVALID  
- 前置：JWT 签名验证失败  
- 断言：返回 `ERR_ACCESS_INVALID`；日志记录校验失败。

**UT-AUTH-TOKEN-VAL-04** app_id 不匹配 → ERR_APP_ID_MISMATCH  
- 前置：Token `appId="jiuweihu"`，调用 `appId="youlishe"`  
- 断言：返回 `ERR_APP_ID_MISMATCH`。

---

## 2. SSO-02 模块：跨客户端 SSO 与本地会话

### 2.1 LocalSessionCrypto（DPAPI 加解密，BR-06）

#### `LocalSessionCrypto.encrypt(jsonPayload) / decrypt(cipherText)`

- **对应 Cycle**：Cycle13（NM）
- **关联需求**：BR-06，本地安全（10.3）

**UT-SSO-LSC-ENC-01** 加解密往返保持 JSON 一致  
- 前置：payload 为合法 JSON 对象（包含 BR-06 必填字段）。  
- 步骤：`cipher = encrypt(payload)`；`decoded = decrypt(cipher)`  
- 断言：
  - `decoded == payload`；
  - cipher 非明文 JSON（简单检查不包含手机号等明文）。

**UT-SSO-LSC-DEC-02** 非法密文解密失败  
- 输入：随机字节数组或被篡改的密文。  
- 断言：抛出/返回“解密失败”错误，被上层映射为 `ERR_SESSION_CORRUPTED`。

---

### 2.2 LocalSessionValidator（结构完整性 + 2 小时阈值，BR-06/C-03）

#### `LocalSessionValidator.validate(struct, now)`

- **对应 Cycle**：Cycle13（NM）、Cycle12（SH）、Cycle15（QA）
- **关联需求**：BR-06（完整性规则）、C-03（2 小时阈值）

**UT-SSO-LSV-VAL-01** 完整且未过期 → VALID  
- 输入：包含 `guid/phone/user_type/refresh_token/device_id/created_at/expires_at` 且 `expires_at >= created_at`，`now = created_at+1h`  
- 断言：返回 `Valid` 状态。

**UT-SSO-LSV-VAL-02** 缺少必填字段 → CORRUPTED  
- 输入：缺少 `guid` 或 `created_at`  
- 断言：返回 `Corrupted`，供上层映射为 `ERR_SESSION_CORRUPTED`。

**UT-SSO-LSV-VAL-03** 创建时间超过 2 小时 → EXPIRED_LOCAL（需删除文件）  
- 输入：`now = created_at + 2h +1s`，Refresh Token 仍有效  
- 断言：返回 `ExpiredLocal`，提示壳层删除文件但不修改 Redis。

---

### 2.3 SsoStartupHandler（客户端启动 SSO 检查，FL-04）

#### `SsoStartupHandler.handleStartup(now)`

- **对应 Cycle**：Cycle12（SH）、Cycle11/15（FE/QA）
- **关联需求**：US-02、US-03、FL-04、BR-06

**UT-SSO-SH-START-01** 有效 LocalSession → 发送 sso_available  
- 前置：`read_session_file()` 返回 Valid LocalSession；  
- 断言：
  - 调用 LocalSessionValidator.validate 返回 `Valid`；
  - 通过 IPC 广播 `session.status="sso_available"`。

**UT-SSO-SH-START-02** 文件不存在 → 发送 none  
- 前置：`read_session_file()` 返回 `ERR_SESSION_NOT_FOUND`  
- 断言：IPC 广播 `session.status="none"`，不抛异常。

**UT-SSO-SH-START-03** 文件损坏/结构非法 → 删除文件 + none  
- 前置：`read_session_file()` 返回 `ERR_SESSION_CORRUPTED`  
- 断言：
  - 调用 `delete_session_file()` 一次；
  - 广播 `session.status="none"`。

**UT-SSO-SH-START-04** 创建时间超过 2 小时 → 删除文件 + none  
- 前置：Validator 返回 `ExpiredLocal`  
- 断言：
  - 删除文件；
  - 广播 `session.status="none"`。

---

### 2.4 SsoSecurityHandler（DPAPI/ACL 异常降级，RISK-03）

#### `SsoSecurityHandler.onSessionWriteFailure(error)`

- **对应 Cycle**：Cycle17/18（SH/NM）、TC-SSO-FL04-007
- **关联需求**：BR-06、RISK-03

**UT-SSO-SSH-ERR-01** DPAPI 失败 → 降级为仅在线登录  
- 前置：write_session_file() 抛出特定错误（DPAPI_FAIL）。  
- 断言：
  - 记录错误日志；
  - 标记“禁用本地 SSO”，后续启动不再尝试写 LocalSession；
  - 不影响当前在线登录的成功返回。

---

## 3. SESS-03 模块：会话管理与退出/封禁联动

### 3.1 SessionService（Redis 会话 CRUD，BR-07）

#### `SessionService.createSession(guid, tokens, now) / deleteSession(guid)`

- **对应 Cycle**：Cycle2/6（创建/刷新）、Cycle19（删除）
- **关联需求**：BR-03/04/07

**UT-SESS-SS-CREATE-01** 创建会话设置 TTL=2 天  
- 输入：`guid=G1, now=t0`  
- 断言：
  - 写入 Redis key `session:G1`；
  - TTL 设置为 2 天；
  - 包含 Refresh Token 与 apps 子结构。

**UT-SESS-SS-DELETE-01** 删除会话幂等  
- 前置：一次删除后 Redis 中 key 已不存在  
- 输入：再次调用 `deleteSession(G1)`  
- 断言：不抛异常，返回成功状态。

---

### 3.2 LogoutService（退出登录，FL-05）

#### `LogoutService.logout(guid, reason)`

- **对应 Cycle**：Cycle19（BE）、Cycle16/17（FE/SH）、Cycle20（QA）
- **关联需求**：US-04、FL-05、BR-07、AC-03

**UT-SESS-LOGOUT-01** 正常退出删除会话  
- 前置：Redis 存在 `session:G1`  
- 输入：`guid=G1, reason="user_logout"`  
- 断言：
  - 调用 `SessionService.deleteSession(G1)`；
  - 返回成功，无错误；
  - 记录一条退出日志（可选）。

**UT-SESS-LOGOUT-02** 重复退出 → 幂等  
- 前置：`session:G1` 已不存在  
- 输入：同上  
- 断言：
  - 不抛异常；
  - 返回成功标识。

---

### 3.3 BanService（封禁/解封，BR-08）

#### `BanService.banUser(guid, operator) / unbanUser(guid, operator)`

- **对应 Cycle**：Cycle25/26（后台 BE/QA）、Cycle19（联动退出）
- **关联需求**：BR-08、Story5、AC 中封禁场景

**UT-SESS-BAN-BAN-01** 封禁用户 → 删除会话 + 更新 User.status  
- 输入：`guid=G1, operator="op1"`  
- 断言：
  - 更新用户表：`status=0`；
  - 调用 `SessionService.deleteSession(G1)`；
  - 记录封禁操作日志。

**UT-SESS-BAN-UNBAN-01** 解封用户 → status 变为 1  
- 输入：`guid=G1`  
- 断言：User.status 由 0 变为 1；不创建会话。

---

## 4. ADMIN-04 模块：后台管理与用户活跃分析

### 4.1 UserQueryService（用户信息查询，FL-06）

#### `UserQueryService.queryUsers(filter, pagination)`

- **对应 Cycle**：Cycle25（BE）、Cycle24/26（FE/QA）
- **关联需求**：US-05、BR-08、UI 7.2、DM-01

**UT-ADMIN-UQ-QUERY-01** 多条件筛选  
- 输入：`filter={phoneLike:"1380", source:"jiuweihu", status:1}, pagination={pageIndex:1,pageSize:20}`  
- 断言：
  - SQL/Query 生成条件正确；
  - 返回结果只包含匹配条件的记录；
  - total 与 items 数量正确。

---

### 4.2 ActivityQueryService（活跃记录查询，FL-07）

#### `ActivityQueryService.queryActivities(filter, pagination)`

- **对应 Cycle**：Cycle28（BE）、Cycle27/29（FE/QA）
- **关联需求**：US-05、DM-04

**UT-ADMIN-AQ-QUERY-01** 按手机号/时间/渠道筛选  
- 输入：`phone="13800138000", timeRange=[t1,t2], channel="jiuweihu"`  
- 断言：
  - 查询条件映射到 DM-04 字段；
  - 返回记录的 login_time/渠道/IP/MAC 等字段正确。

---

### 4.3 ActivityExportService（导出 CSV，FL-07）

#### `ActivityExportService.exportActivities(filter, maxRows)`

- **对应 Cycle**：Cycle28/29
- **关联需求**：US-05、FL-07、NFR（导出限制）

**UT-ADMIN-AE-EXP-01** 小结果集导出成功  
- 前置：结果行数 < maxRows  
- 断言：生成 CSV 内容，列顺序与 DM-04 一致。

**UT-ADMIN-AE-EXP-02** 大结果集超限 → 拒绝导出  
- 前置：预估行数 > maxRows  
- 断言：抛出/返回“超限错误”，不执行大量 SQL/IO。

---

### 4.4 PermissionChecker（后台角色权限，11 章）

#### `PermissionChecker.canBan(userRole)`

- **对应 Cycle**：Cycle25/26
- **关联需求**：PRD 11 章角色矩阵

**UT-ADMIN-PC-CANBAN-01** 仅运营可封禁/解封  
- 输入：`userRole="运营"` → true；`"客服"` / `"技术支持"` → false。

---

### 4.5 MetricsRecorder / MonitorClient（监控上报，NFR 10.2 / 12.2）

#### `MetricsRecorder.recordLoginSuccess() / recordLoginError(reason) / ...`

- **对应 Cycle**：Cycle28/29、部分 AUTH/SSO/SESS QA Cycle
- **关联需求**：NFR 10.2、12.2

**UT-ADMIN-METRIC-REC-01** 登录成功/失败计数上报  
- 前置：Mock MonitorClient  
- 输入：调用 `recordLoginSuccess()` N 次，`recordLoginError("code_invalid")` M 次。  
- 断言：MonitorClient 接收到正确的 metric 名称与标签（如 `status="success"/"error"`, `reason="code_invalid"`）。

---

## 5. 总结：函数级 TDD 的可执行路径

1. **每个函数都有明确职责和错误分支**，并映射到具体单元测试 ID（UT-...），同时关联了 Cycle 与 US/FL/BR/ERR，满足 TDD 的可追踪性要求。  
2. 在实际开发中，可以按如下模式工作（以 `AuthService.loginWithPhone` 为例）：
   - 先实现 `UT-AUTH-AUTH-LOGIN-01/02/03/04` 的测试（使用 Mock 的 UserRepo/SessionService/VerificationCodeService）；  
   - 运行测试（全部失败）→ 实现 loginWithPhone 最小逻辑 → 直到所有 UT 通过；  
   - 再运行上层集成/E2E 用例（如 TC-AUTH-FL01-001…005）验证端到端行为。  
3. 通过这样的“自下而上（单元）+ 自上而下（集成/E2E）”组合，项目可以在 **PRD → Dev Plan → Cycle → Unit Test → E2E Test** 的全链路上实施经典 TDD，同时保证与需求的精确对齐。
