# Passport 统一认证中心 - 迭代 1 落地计划（Cycle1–5）

> 目标：以 **US-01 / FL-01 / FL-02** 为主线，在首个迭代内完成“手机号登录/注册 + 刷新机制骨架”的端到端闭环，并按照 TDD 要求为关键逻辑编写单元测试与集成测试。覆盖 Dev Plan 中的 **Cycle1～Cycle5**。

关联文档：

- 需求：`passport-统一认证中心-PRD-草稿.md`（v1.1，US-01，FL-01/02，BR-01/02/03/04/09，ERR 13.1/13.2）；
- 决策：`passport-统一认证中心-PRD-审查与决策汇总-已决策.md`（Q-01/Q-02/Q-03/Q-11/Q-19）、`passport-统一认证中心-多视图冲突与决策清单-已决策.md`（C-01/C-02/C-03/C-05）；
- Dev Plan：`passport-统一认证中心-开发计划.md`（AUTH-01 模块，Cycle1～5）；
- 测试：`passport-统一认证中心-测试用例-DevPlan对齐版.md`（TC-AUTH-FL01-001～006、TC-AUTH-FL02-001～004 部分前置）；
- UT：`passport-统一认证中心-单元测试设计-TDD版.md`（VerificationCodeService、GuidGenerator、AuthService.loginWithPhone、TokenService.refreshAccessToken 等）。

---

## 一、迭代范围与不在范围内的内容

### 1.1 本迭代范围（Scope）

- 覆盖 Dev Plan 中的以下 Cycle：
  - **Cycle1** = [AUTH-01][US-01][FL-01][FE]
  - **Cycle2** = [AUTH-01][US-01][FL-01][BE]
  - **Cycle3** = [AUTH-01][US-01][FL-01][QA]
  - **Cycle4** = [AUTH-01][US-01][FL-02][FE]
  - **Cycle5** = [AUTH-01][US-01][FL-02][SH]

- 业务能力目标：
  1. 用户可通过手机号 + 验证码完成“已有账号登录 / 新账号注册”流程，得到 GUID + Token；
  2. 登录/注册流程的主要异常路径可被前后端正确处理（封禁、注销、验证码错误/过期）；
  3. 前端具备对“刷新结果”的状态响应能力；
  4. 壳层具备 Token 刷新调度的基础骨架（调用 API-03、调度/重试策略、向前端发事件），为后续 Cycle6/7 准备。

### 1.2 不在本迭代范围内（Out of Scope）

- 不实现：
  - SSO 本地会话相关逻辑（FL-04，Cycle11～15）；
  - 退出 / 封禁具体实现（FL-05，Cycle16～20）；
  - 后台管理与活跃数据（ADMIN-04，Cycle24～29）；
  - 完整性能压测与生产级监控接入（可在后续迭代按《性能与监控设计方案》补齐）。

---

## 二、迭代前置条件（环境 & 设计）

在开始编码前，建议确认或完成以下事项（可与实现部分并行推进）：

1. **后端技术栈确认**（参考《技术方案与架构设计》）：
   - 语言 / Web 框架 / ORM / 测试框架（例如：Java + Spring Boot + JPA / Node.js + NestJS / Go + Gin 等）；
   - 项目结构（API 层 / Service 层 / Domain 层 / Infra 层）。
2. **数据库与 Redis 环境**：
   - 按《数据模型与数据库设计》在本地/测试环境创建 `passport_user` 表；
   - 配置 Redis 并约定 `session:{guid}` 的序列化方式（JSON 或 Hash）。
3. **客户端工程骨架**：
   - Web 前端项目创建并具备基础路由与状态管理能力（登录页路由）；
   - 壳层项目具备定时任务 / IPC 能力（可先用本地 Mock 实现 IPC）。
4. **测试框架与 CI**：
   - 后端单测框架就绪（用于 UT-AUTH-VC-* / UT-AUTH-AUTH-LOGIN-* / UT-AUTH-TOKEN-REF-* 等）；
   - QA 确定集成/E2E 测试框架（可先在本地跑，CI 集成可在后续迭代加入）。

---

## 三、Cycle1～5 详细落地计划

### 3.1 Cycle1 — [AUTH-01][US-01][FL-01][FE]

**目标**：实现“手机号登录/注册”前端页面与交互，完成与后端 API-01/02 的调用对接，并为登录成功后的前端状态管理奠定基础。

**工作拆分**：

1. 登录页面骨架：
   - 新建 `LoginPage` 组件/路由；
   - 包含手机号输入框、验证码输入框、“获取验证码”按钮、协议勾选、登录按钮；
2. 前端校验逻辑（对齐 BR-09）：
   - 手机号格式校验（使用 PRD 提供正则）；
   - 验证码长度 / 数字格式的基础校验；
3. 调用后端 API：
   - `POST /api/passport/send-code`（API-01）：
     - 成功：启动倒计时、禁用按钮；
     - 错误码：`ERR_PHONE_INVALID`、`ERR_CODE_TOO_FREQUENT` 显示对应文案；
   - `POST /api/passport/login-by-phone`（API-02）：
     - 成功：保存返回的 `guid` / `access_token` / `refresh_token` / `user_status` 至前端 Session Store；
     - 错误：根据 `ERR_CODE_INVALID` / `ERR_CODE_EXPIRED` / `ERR_USER_BANNED` 等展示错误提示；
4. 前端状态管理：
   - 定义全局 `AuthState`（如 `{guid, accessToken, refreshToken, userStatus, appId}`）；
   - 登录成功后更新状态并跳转到“主页”路由。

**TDD 要求**：

- 在实现前，为关键逻辑编写前端单测（如手机号校验、倒计时行为、错误码处理）；
- 可使用组件测试或 store 层测试验证状态更新行为。

**完成标准（DoD）**：

- 登录页各组件与交互行为可用；
- 与后端联调时，在正确实现 Cycle2 后，可完成完整的登录/注册流程；
- 与 TC-AUTH-FL01-001/002/005 的前端部分预期一致。

---

### 3.2 Cycle2 — [AUTH-01][US-01][FL-01][BE]

**目标**：实现 API-02 `/api/passport/login-by-phone`，完成“已有用户登录 / 新用户注册 / 封禁 / 注销”的完整逻辑，并写入会话与用户数据。

**工作拆分**：

1. API 设计与契约固化：
   - 定义请求体：`{ phone, code, app_id }`；
   - 定义响应体：
     - 成功：`{ guid, access_token, refresh_token, user_status, account_source, expires_in }`；
     - 失败：`{ error_code, message }`（error_code 来自 PRD 13.1/13.2）。
2. 领域逻辑实现（AuthService）：
   - 调用 `VerificationCodeService.validateCode`（参见 UT-AUTH-VC-*）；
   - 根据 UserRepo.findByPhone 结果分支：
     - `status=1`：已有用户登录；
     - 不存在：按 BR-02 创建新用户（调用 GuidGenerator）；
     - `status=0`：封禁 → `ERR_USER_BANNED`；
     - `status=-1`：注销 → 按 C-01 新建用户并生成新 GUID；
   - 通过 SessionService.createSession 写入 Redis `session:{guid}`；
3. 错误码与日志：
   - 错误码使用 PRD 13.1/13.2 中定义值；
   - 按《日志与审计设计》记录登录成功 / 失败日志（不含敏感明文）。

**TDD 要求**：

- 按 `单元测试设计-TDD版` 实现以下 UT：
  - UT-AUTH-VC-VAL-*（可并行进行 Cycle21～23 时强化）；
  - UT-AUTH-AUTH-LOGIN-01/02/03/04；
  - UT-SESS-SS-CREATE-01（SessionService.createSession）。

**完成标准（DoD）**：

- 单元测试全部通过；
- 与前端联调可满足 TC-AUTH-FL01-001～004 主流程；
- 数据库与 Redis 中记录与 DM-01/DM-02 一致。

---

### 3.3 Cycle3 — [AUTH-01][US-01][FL-01][QA]

**目标**：基于 Cycle1/2 的实现，完成登录/注册流程的端到端自动化测试与手工回归方案。

**工作拆分**：

1. 用例实现：
   - 将以下测试用例转化为自动化脚本或可复用测试场景：
     - TC-AUTH-FL01-001：已有用户正常登录；
     - TC-AUTH-FL01-002：新用户注册 + 登录；
     - TC-AUTH-FL01-003：封禁用户尝试登录；
     - TC-AUTH-FL01-004：注销用户重新登录生成新 GUID；
     - TC-AUTH-FL01-005：验证码错误/过期/频率限制；
     - TC-AUTH-FL01-006：登录行为写入 LoginLog；
2. 测试环境准备：
   - 提供构造 User.status 不同取值（1/0/-1）的工具或脚本；
   - 配置可控的验证码服务（可注入固定验证码与过期时间）。
3. 执行与结果：
   - 运行用例，记录通过/失败情况与日志；
   - 将关键断言与期望行为回填到测试报告中（与 PRD AC-01 对齐）。

**完成标准（DoD）**：

- 以上 6 条用例全部通过，未出现未预期的错误码或状态；
- 在 LoginLog 中可见正确的登录记录（guid/phone/channel/login_time 等）。

---

### 3.4 Cycle4 — [AUTH-01][US-01][FL-02][FE]

**目标**：实现前端对 Token 刷新结果的状态管理与 UI 响应，为壳层刷新调度提供展示与交互基础。

**工作拆分**：

1. 前端状态扩展：
   - 在 AuthState 中新增“会话状态”字段（如 `sessionStatus: active | expiring | expired`）；
   - 订阅壳层 IPC 事件（如 `session.refresh.success` / `session.refresh.failed`）。
2. 刷新结果处理：
   - 成功：更新 `access_token` 与过期时间，保持登录态；
   - 失败（ERR_REFRESH_EXPIRED / ERR_REFRESH_MISMATCH）：
     - 清理前端登录状态；
     - 跳转到登录页，并展示“会话已过期，请重新登录”等提示；
3. 手动触发入口（可选）：
   - 在调试环境下提供“手动刷新 Token”按钮，以便联调与测试（生产可隐藏或保留内部入口）。

**TDD 要求**：

- 使用前端单测验证：
  - 收到不同 IPC 事件时 AuthState 的变化；
  - 页面是否正确跳转 / 显示提示文案。

**完成标准（DoD）**：

- 与后端/壳层联调时，刷新成功/失败场景在前端均有明确行为；
- 满足 TC-AUTH-FL02-001～004 中与前端相关的期望（尽管完整验证要等 Cycle6 完成刷新接口实现）。

---

### 3.5 Cycle5 — [AUTH-01][US-01][FL-02][SH]

**目标**：实现壳层 Token 刷新调度骨架，与 API-03 对接，并通过 IPC 通知前端刷新结果，具备基础错误处理能力。

**工作拆分**：

1. 刷新调度器实现：
   - 记录“登录成功时间 / 上次刷新成功时间”；
   - 每 3 小时 + 随机抖动（如 0～10 分钟）触发刷新；
   - 刷新失败后在 5 分钟内最多重试 2 次（具体数字参考 PRD 与 Q-09/Q-10）。
2. API-03 调用：
   - 向后端调用 `/api/passport/refresh-token`，携带 Refresh Token 与 app_id；
   - 成功：更新本地持有的 Token 并通过 IPC 通知前端；
   - 失败：根据错误码分类处理：
     - ERR_REFRESH_EXPIRED / MISMATCH：通知前端“会话失效，需重新登录”；
     - Redis 故障等内部错误：按 C-02 处理（统一失败 + 稍后重试提示）。
3. 日志与监控：
   - 在壳层记录刷新成功/失败日志；
   - 为后续监控接入预留钩子（如调用 MetricsClient）。

**TDD 要求**：

- 以 UT-AUTH-TOKEN-REF-* 为后端参考，在壳层侧：
  - 对调度逻辑编写单元测试（可通过模拟时间与计时器验证触发点与重试次数）；
  - 使用 Mock 后端接口验证失败分支的错误处理与 IPC 行为。

**完成标准（DoD）**：

- 在本地环境中模拟长时间登录，观察刷新调度是否符合期望节奏与错误处理策略；
- 与前端联调时，可通过日志与 UI 行为验证 TC-AUTH-FL02-001～004 中关于“刷新成功/失败/过期”的前端 + 壳层协作逻辑。

---

## 四、迭代验收与退出条件（Exit Criteria）

1. 功能层面：
   - 登录/注册流程在典型场景（已有用户 / 新用户 / 封禁 / 注销）下可用；
   - 刷新机制在“刷新成功 / Refresh Token 过期 / 不匹配 / Redis 故障”场景下行为可预期（即便刷新接口实现在下一迭代补完，壳层与前端行为路径已就绪）。
2. 测试层面：
   - 与 Cycle1～3 对应的核心 TC（TC-AUTH-FL01-001～006）已实现并在测试环境跑通；
   - 前端与壳层的关键单元测试（手机号/验证码校验、状态管理、刷新调度）编写完成并通过；
3. 文档与代码质量：
   - 当前迭代涉及的实现已对照《单元测试设计-TDD版》落地关键 UT；
   - 所有新增接口契约已在代码与（如有）接口说明文档中体现，与 PRD/Dev Plan 一致。

满足以上退出条件后，即可进入下一迭代（建议为 Cycle6～10：完整实现 Token 刷新接口与验证流程，以及相应的测试与监控接入）。
