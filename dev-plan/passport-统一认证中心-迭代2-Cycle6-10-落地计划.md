# Passport 统一认证中心 - 迭代 2 落地计划（Cycle6–10）

> 目标：在迭代 1 已完成“手机号登录/注册 + 刷新调度骨架（Cycle1–5）”的基础上，进一步完成 **Token 刷新接口（API-03）与 Token 验证/鉴权（API-04）** 的后端实现与端到端测试，覆盖 Dev Plan 中的 **Cycle6～10**。

关联文档：

- 需求：`passport-统一认证中心-PRD-草稿.md`（v1.1，US-01，FL-02/FL-03，BR-03/BR-04/BR-05，ERR 13.2）；
- 决策：`passport-统一认证中心-PRD-审查与决策汇总-已决策.md`（Q-01/Q-02/Q-09/Q-10），`passport-统一认证中心-多视图冲突与决策清单-已决策.md`（C-02/C-03/C-05）；
- Dev Plan：`dev-plan/passport-统一认证中心-开发计划.md`（AUTH-01 模块，Cycle6～10）；
- 测试：`passport-统一认证中心-测试用例-DevPlan对齐版.md`（TC-AUTH-FL02-001～004、TC-AUTH-FL03-001～004）；
- UT：`passport-统一认证中心-单元测试设计-TDD版.md`（TokenService.refreshAccessToken、TokenValidator.validateAccessToken 等）。

---

## 一、迭代范围与目标

### 1.1 本迭代范围（Scope）

- 覆盖 Dev Plan 中的以下 Cycle：
  - **Cycle6**  = [AUTH-01][US-01][FL-02][BE]
  - **Cycle7**  = [AUTH-01][US-01][FL-02][QA]
  - **Cycle8**  = [AUTH-01][US-01][FL-03][FE]
  - **Cycle9**  = [AUTH-01][US-01][FL-03][BE]
  - **Cycle10** = [AUTH-01][US-01][FL-03][QA]

- 业务能力目标：
  1. 实现完整的 API-03 刷新接口：校验 Refresh Token 与 Redis 中会话的一致性，根据 BR-03/BR-04 更新 Access Token；
  2. 补齐刷新流程的集成测试（包括 Redis 故障与 C-02 决策场景），验证 FE/SH/BE 协作逻辑；
  3. 实现 API-04 Token 验证接口与通用鉴权中间件，根据 BR-05 和 ERR 13.2 对 Access Token 做解析与校验；
  4. 实现前端对 Token 错误码（过期/伪造/app_id 不匹配）的统一处理逻辑，并通过 E2E 用例验证。

### 1.2 不在本迭代范围内（Out of Scope）

- 不实现：
  - SSO 本地会话相关逻辑（FL-04，Cycle11～15，留待迭代 3）；
  - 退出/封禁具体实现（FL-05，Cycle16～20）；
  - 后台管理与活跃数据（ADMIN-04，Cycle24～29）。

---

## 二、迭代前置条件

1. 迭代 1（Cycle1–5）已完成并通过对应单测/E2E 测试：
   - AuthService.loginWithPhone 基本可用，Session 结构已在 Redis/InMemory 层落地；
   - 壳层刷新调度骨架可正常触发刷新调用并处理成功/失败/重试。
2. 后端基础设施：
   - Redis 与用户会话结构（`session:{guid}`）已按《数据模型与数据库设计》与 Dev Plan 约定实现或在 InMemory 版本中模拟；
3. 测试环境：
   - 可模拟 Redis 故障（断网/关闭实例）以验证 C-02 决策；
   - 测试框架支持 API 级集成测试与部分 E2E 测试。

---

## 三、Cycle6～10 详细落地计划

### 3.1 Cycle6 — [AUTH-01][US-01][FL-02][BE]

**目标**：实现 API-03 `/api/passport/refresh-token` 后端逻辑，对 Refresh Token 进行完整校验并更新会话，遵循 BR-03/BR-04 与错误码规范。

**工作拆分**：

1. API 契约与路由：
   - 请求体：`{ refresh_token, app_id }`；
   - 响应体：
     - 成功：`{ access_token, expires_in }`；
     - 失败：`{ error_code, message }`（ERR_REFRESH_EXPIRED / ERR_REFRESH_MISMATCH / ERR_APP_ID_MISMATCH 等）。

2. TokenService.refreshAccessToken 实现加强版：
   - 基于迭代 1 已有骨架，完善以下检查：
     - 刷新 Token 过期：根据 `refresh_token_expires_at` 判断（BR-03），过期 → `ERR_REFRESH_EXPIRED`；
     - 刷新 Token 不匹配：提交的 `refresh_token` 与 Session 中不同 → `ERR_REFRESH_MISMATCH`；
     - app_id 不匹配：如 Token 中 app_id 与调用参数不一致 → `ERR_APP_ID_MISMATCH`；
   - 成功时：
     - 为对应 app_id 生成新的 Access Token；
     - 更新 `apps.{app_id}.access_token` 与过期时间；
     - 保留 Refresh Token，不延长其生命周期（BR-04）。

3. 错误处理与日志：
   - 按《日志与审计设计》记录刷新成功/失败日志，包含 guid/app_id/error_code 等非敏感字段；
   - 对 Redis 访问异常（连接失败/超时等）返回统一内部错误，并由 C-02 策略驱动“统一失败 + 稍后重试提示”。

**TDD 要求**：

- 在 `dev/tests` 中实现并通过以下 UT（参考 `单元测试设计-TDD版`）：
  - UT-AUTH-TOKEN-REF-01：正常刷新成功；
  - UT-AUTH-TOKEN-REF-02：Refresh Token 过期 → ERR_REFRESH_EXPIRED；
  - UT-AUTH-TOKEN-REF-03：Refresh Token 不匹配 → ERR_REFRESH_MISMATCH；
  - UT-AUTH-TOKEN-REF-04：app_id 不匹配 → ERR_APP_ID_MISMATCH。

**完成标准（DoD）**：

- 单元测试 100% 通过；
- 与壳层刷新调度（Cycle5）联调时，正常/异常路径行为与 PRD/Dev Plan 一致；
- 日志中可清晰区分不同失败原因（不过度暴露敏感信息）。

---

### 3.2 Cycle7 — [AUTH-01][US-01][FL-02][QA]

**目标**：为 Token 刷新流程（FL-02）编写端到端测试用例与自动化脚本，覆盖正常与异常场景，并验证 Redis 故障策略（C-02）。

**工作拆分**：

1. 测试用例实现（对应 `测试用例-DevPlan对齐版`）：
   - TC-AUTH-FL02-001：正常定时刷新 Access Token；
   - TC-AUTH-FL02-002：Refresh Token 过期；
   - TC-AUTH-FL02-003：Refresh Token 不匹配/伪造；
   - TC-AUTH-FL02-004：Redis 故障时刷新行为（C-02）。

2. 测试场景构造：
   - 构造不同签发时间与过期时间的 Refresh Token 样本；
   - 通过测试环境配置模拟 Redis 不可用（关闭实例或断开网络）。

3. 执行与结果收集：
   - 跑通所有场景，确保：
     - 对应错误码与 HTTP 状态与 PRD 一致；
     - 前端与壳层对错误码的处理符合预期（例如过期 → 回到登录页，Redis 故障 →“稍后重试”提示）；
     - 监控中刷新失败率与 Redis 错误率能正确反映模拟场景。

**完成标准（DoD）**：

- 所有关联 TC 实现并在测试环境通过；
- 报告中对 C-02 决策场景的行为有清晰说明；
- 测试结果可作为后续回归的基线。

---

### 3.3 Cycle8 — [AUTH-01][US-01][FL-03][FE]

**目标**：在前端实现 Access Token 错误处理与自动跳转逻辑，对 401/403 与关键错误码进行统一拦截与 UI 响应（FL-03）。

**工作拆分**：

1. 通用请求封装层：
   - 在前端项目中实现 HTTP 请求封装（如 `request()` 方法），统一处理响应：
     - 2xx：正常返回数据；
     - 401/403：根据 `error_code` 判断行为；
2. 错误码处理策略：
   - `ERR_ACCESS_EXPIRED`：触发刷新流程（若壳层可主动刷新）或直接清理登录态并跳转登录页；
   - `ERR_ACCESS_INVALID`：视为会话失效，直接回登录页；
   - `ERR_APP_ID_MISMATCH`：展示“无权限访问”提示，不当作“未登录”；
3. 状态与路由：
   - 将错误处理结果映射到前端 AuthState 与路由跳转（登录页 / 无权限页 / 当前页重试等）。

**TDD 要求**：

- 使用前端单元测试/组件测试验证：
  - 不同 HTTP 状态 + error_code 的输入下，路由与状态变化符合预期；
  - 不出现“Token 已过期但页面仍展示已登录”的假登录态。

**完成标准（DoD）**：

- 所有与 Token 验证相关的接口调用都通过统一封装层；
- 与后端联调时，TC-AUTH-FL03-002/003/004 中前端行为符合预期描述。

---

### 3.4 Cycle9 — [AUTH-01][US-01][FL-03][BE]

**目标**：实现 API-04 `/api/passport/verify-token` 与服务端通用鉴权中间件，依据 BR-05 和 ERR 13.2 校验 Access Token。

**工作拆分**：

1. TokenValidator 实现：
   - 解析 Access Token（例如 JWT 或自定义格式），校验：
     - 签名与结构有效性（无篡改）；
     - 过期时间（exp < now → `ERR_ACCESS_EXPIRED`）；
     - Redis 中是否存在对应 Session（如需要二次校验）；
     - Token 中 app_id 与调用方 app_id 是否匹配（不匹配 → `ERR_APP_ID_MISMATCH`）。

2. API-04 与鉴权中间件：
   - API-04 接口：
     - 请求：`{ access_token, app_id }` 或通过 Header 传递；
     - 响应：成功时返回 `guid`, `expires_at` 等信息；失败时返回 PRD 定义错误码；
   - 通用鉴权中间件：
     - 供业务服务在网关 / 控制器层统一调用；
     - 使用 TokenValidator，验证通过后将 guid / app_id 注入请求上下文。

3. 日志与监控：
   - 对签名错误、过期、app_id 不匹配等情况记录日志；
   - 可选择性为验证成功/失败增加监控指标（与《性能与监控设计方案》对齐）。

**TDD 要求**：

- 按 `单元测试设计-TDD版` 实现以下 UT：
  - UT-AUTH-TOKEN-VAL-01：有效 Token 验证通过；
  - UT-AUTH-TOKEN-VAL-02：Token 过期 → ERR_ACCESS_EXPIRED；
  - UT-AUTH-TOKEN-VAL-03：签名错误 / 伪造 → ERR_ACCESS_INVALID；
  - UT-AUTH-TOKEN-VAL-04：app_id 不匹配 → ERR_APP_ID_MISMATCH。

**完成标准（DoD）**：

- UT 覆盖主要分支并全部通过；
- API-04 与鉴权中间件可在模拟业务接口中复用，行为一致；
- 日志中可追踪关键错误场景，便于排查问题。

---

### 3.5 Cycle10 — [AUTH-01][US-01][FL-03][QA]

**目标**：为 Token 验证接口与鉴权中间件编写集成/E2E 测试，验证各错误码分支与前端行为，与登录/刷新用例形成完整调用链。

**工作拆分**：

1. 测试用例实现（对应 `测试用例-DevPlan对齐版`）：
   - TC-AUTH-FL03-001：有效 Access Token 验证通过；
   - TC-AUTH-FL03-002：Access Token 过期；
   - TC-AUTH-FL03-003：Token 签名错误 / 伪造；
   - TC-AUTH-FL03-004：app_id 不匹配。

2. 测试数据构造：
   - 利用登录/刷新接口生成真实 Token；
   - 手工构造过期 Token、伪造 Token（篡改 payload 或签名）、app_id 不匹配场景。

3. 前后端联调验证：
   - 验证前端通用请求封装是否对错误码进行正确分类处理；
   - 验证在不同错误场景下，用户体验与 PRD 描述一致（需重新登录 / 提示无权限等）。

**完成标准（DoD）**：

- 所有关联 TC 在测试环境通过；
- 登录 → 刷新 → 验证的端到端调用链在典型场景与主要异常场景下表现正确；
- 测试报告可作为后续版本的回归基线。

---

## 四、迭代验收与退出条件

1. 功能层面：
   - API-03 与 API-04 已在正式或测试环境中部署可用；
   - 刷新与验证的主要异常场景（过期、伪造、不匹配、Redis 故障）行为与 PRD/Dev Plan 一致；
2. 测试层面：
   - 与 Cycle6～10 对应的 UT 与 TC 均实现并通过；
   - 从“登录 → 刷新 → 验证”的完整调用链在自动化测试中被覆盖；
3. 文档与实现对齐：
   - 如实现过程中对接口契约或行为有调整，已同步更新 PRD/Dev Plan/测试用例文档；

满足以上条件后，即可进入下一个迭代（推荐覆盖 SSO 与 LocalSession 的 Cycle11～15）。
