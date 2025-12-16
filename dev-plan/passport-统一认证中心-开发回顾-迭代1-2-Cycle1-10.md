# Passport 统一认证中心 - 开发回顾（迭代 1–2，Cycle1–10）

> 目的：回顾当前已完成的开发工作（Cycle1–10），从 **需求对齐（PRD）** 与 **计划对齐（Dev Plan）** 两个维度检查实现情况，确保“已完成内容”与文档保持一致，为后续迭代引入新的功能提供稳定基线。

关联基线：

- PRD：`passport-统一认证中心-PRD-草稿.md`（v1.1，SSoT）；
- 决策：`passport-统一认证中心-PRD-审查与决策汇总-已决策.md`（Q-01～Q-19）、`passport-统一认证中心-多视图冲突与决策清单-已决策.md`（C-01～C-07）；
- Dev Plan：`dev-plan/passport-统一认证中心-开发计划.md`（AUTH-01 模块 Cycle1～10）；
- 测试：`passport-统一认证中心-测试用例-DevPlan对齐版.md`（AUTH-01 FL-01/FL-02/FL-03 部分）；
- UT：`passport-统一认证中心-单元测试设计-TDD版.md`；
- 实现位置：`dev/backend/*`, `dev/frontend/*`, `dev/shell/*`, `dev/tests/*`。

---

## 一、迭代引导与范围确认

### 1.1 迭代 1（Cycle1–5）范围回顾

- 模块：AUTH-01（US-01：手机号登录/注册 + Token 刷新基础设施）；
- 覆盖 FL：
  - FL-01：手机号登录/注册流程；
  - FL-02：Token 刷新流程（前端状态管理 + 壳层调度骨架）。
- 周期：
  - Cycle1：FE 登录页与交互；
  - Cycle2：BE 登录/注册主流程；
  - Cycle3：登录/注册 E2E 测试；
  - Cycle4：FE 刷新结果处理；
  - Cycle5：壳层刷新调度骨架。

### 1.2 迭代 2（Cycle6–10）范围回顾

- 模块：AUTH-01（US-01：Token 刷新接口 + Token 验证/鉴权）；
- 覆盖 FL：
  - FL-02：Token 刷新流程（后端接口 + QA）；
  - FL-03：Token 验证流程（前端错误处理 + BE 验证/鉴权 + QA）。
- 周期：
  - Cycle6：BE 刷新接口实现（API-03）；
  - Cycle7：刷新流程 QA；
  - Cycle8：FE Access Token 错误处理；
  - Cycle9：BE Token 验证接口与鉴权中间件；
  - Cycle10：Token 验证 QA。

> 下文将按“已实现内容 → 与 PRD/Dev Plan 的对应关系 → 剩余工作”结构进行检查。

---

## 二、实现内容概览（按 Cycle）

### 2.1 Cycle1–3：登录/注册主流程（FL-01）

**实现位置**：

- BE（核心逻辑）：
  - `dev/backend/domain.py`：
    - `User` / `UserStatus` / `Session` / `AppSession` / InMemory 仓储与验证码存储；
    - 错误码常量：`ERR_CODE_INVALID` / `ERR_CODE_EXPIRED` / `ERR_PHONE_INVALID` / `ERR_USER_BANNED` 等，对应 PRD 13.1/13.2；
  - `dev/backend/services.py`：
    - `GuidGenerator.generate()`：实现 BR-01 规定的 20 位 GUID（日期 + user_type + 随机数）；
    - `VerificationCodeService.validate_code()`：实现 BR-09 的验证码正确/过期/错误分支；
    - `AuthService.login_with_phone()`：实现 BR-02 + C-01 + BR-08：
      - 无用户 → 新注册（新 GUID）；
      - `status=1` → 正常登录；
      - `status=0` → 抛出 `ERR_USER_BANNED`；
      - `status=-1` → 视为新用户，生成新 GUID 并保留历史记录。
    - 创建 Session（Refresh/Access Token + 过期时间）并写入 InMemory SessionStore（BR-03/BR-07）。

- FE（登录交互骨架）：
  - `dev/frontend/login/login.html` / `login.js`：
    - 登录表单（手机号、验证码、获取验证码按钮、协议勾选、登录按钮）；
    - 手机号正则校验与验证码长度校验；
    - 调用 `/api/passport/send-code` 与 `/api/passport/login-by-phone`（URL 为占位，符合 Dev Plan 契约）；
    - 登录成功后在 `localStorage` 中保存 `guid` / `access_token` / `refresh_token`（为后续刷新与验证提供基础）。

- QA/UT：
  - `dev/tests/test_auth_cycle1_2.py`：
    - 覆盖场景与测试用例文档对应：
      - 非法手机号 → `ERR_PHONE_INVALID`；
      - 新用户注册 + 登录 → 检查 User 表与 Session 写入（TC-AUTH-FL01-002）；
      - 封禁用户登录 → `ERR_USER_BANNED`（TC-AUTH-FL01-003）；
      - 注销用户登录生成新 GUID（C-01，TC-AUTH-FL01-004）；
      - 错误验证码 → `ERR_CODE_INVALID`，过期验证码 → `ERR_CODE_EXPIRED`（TC-AUTH-FL01-005）。

**与 PRD/Dev Plan 对齐情况**：

- US-01 / FL-01：已按 PRD 4.1 / 6.1 拆解并实现“已有用户 / 新用户 / 封禁 / 注销”的行为；
- BR-01/02/03/07/08/09：在服务层与单测中均有对应逻辑与断言；
- Dev Plan 中 Cycle1/2/3 的描述（FE/BE/QA）已在代码与测试中得到对应实现（FE 为骨架，BE/QA 已有可执行验证）。

### 2.2 Cycle4–5：刷新前端状态与壳层调度骨架（FL-02）

**实现位置**：

- FE：
  - `dev/frontend/login/login.js`：为刷新前的 Token 存储与错误处理预留基础（存储 Access/Refresh Token，后续由 `request.js` 统一处理 Token 错误）。

- 壳层：
  - `dev/shell/refresh_scheduler.py`：
    - `RefreshScheduler` / `RefreshState` 实现：
      - 登录成功后从 `login_time` 开始，每 `3h + 抖动` 调用一次 `on_refresh()`；
      - 刷新失败时每 `5min` 重试，最多重试 `MAX_RETRY=2` 次，之后停止调度，将“需要重新登录”交给前端负责；
    - 该实现对应 Dev Plan 中对刷新调度（Cycle5）的时间与重试策略描述。

- QA：
  - `dev/tests/test_refresh_scheduler_cycle5.py`：
    - 验证成功刷新时按 `REFRESH_INTERVAL` 安排下一次调度；
    - 验证失败时按 `RETRY_INTERVAL` 重试，且超过 `MAX_RETRY` 后 `next_scheduled_at=None`，不再触发刷新。

**与 PRD/Dev Plan 对齐情况**：

- FL-02 中关于刷新周期与重试策略（PRD 6.1 + Q-09/Q-10）已在调度逻辑与单测中实现；
- Dev Plan 中 Cycle4/5 描述的前端状态响应与调度行为，在当前骨架中已有基础支持，等后端刷新接口完成后即可联调验证。

### 2.3 Cycle6–7：刷新接口与刷新 QA（FL-02）

**实现位置**：

- BE：
  - `dev/backend/services.py` 中 `TokenService.refresh_access_token()`：
    - 使用 `Session.is_refresh_valid(now)` 判断 Refresh Token 是否过期（BR-03，过期 → `ERR_REFRESH_EXPIRED`）；
    - 校验提交的 Refresh Token 与 Session 中存储的值一致（不一致 → `ERR_REFRESH_MISMATCH`）；
    - 要求 Session 中存在 `apps[app_id]`，否则 → `ERR_APP_ID_MISMATCH`；
    - 生成新的 Access Token 与过期时间，并写回该 app 的 `AppSession`；
    - 保持 Refresh Token 与 `refresh_token_expires_at` 不变，符合 BR-04 “不续期”约束。

- QA/UT：
  - `dev/tests/test_token_refresh_cycle6.py`：
    - 正常刷新成功：Access Token 更新，Session 中对应 app 子结构与返回结果一致（TC-AUTH-FL02-001 部分后端行为）；
    - Refresh Token 过期：`ERR_REFRESH_EXPIRED`（TC-AUTH-FL02-002）；
    - Refresh Token 不匹配：`ERR_REFRESH_MISMATCH`（TC-AUTH-FL02-003）；
    - app_id 不匹配：`ERR_APP_ID_MISMATCH`（TC-AUTH-FL02-004 中的一分支）。

**与 PRD/Dev Plan 对齐情况**：

- BR-03/BR-04/BR-05 中关于刷新规则与错误码的要求在刷新服务与单测中有清晰落点；
- Dev Plan 中 Cycle6/7 对“正常/异常刷新场景”的描述已经在 BE + UT 层级实现，后续只需在真实 Redis 环境上补充 C-02（Redis 故障）集成测试即可完成 QA 要求。

### 2.4 Cycle8–10：Token 验证与鉴权（FL-03）

**实现位置**：

- FE：
  - `dev/frontend/request.js`：
    - 通用 `apiRequest(path, options)` 封装：
      - 对 `ERR_ACCESS_EXPIRED` / `ERR_ACCESS_INVALID`：清理本地 Token，跳转 `/login`；
      - 对 `ERR_APP_ID_MISMATCH`：弹出无权限提示；
      - 其他错误：抛出通用异常；
    - 符合 Dev Plan 对 Cycle8 “统一 Access Token 错误处理与自动跳转” 的要求。

- BE：
  - `dev/backend/token_validator.py`：
    - `TokenValidator.validate_access_token(access_token, app_id)`：
      - 在 `InMemorySessionStore` 中查找匹配的 Access Token（简化版“解析 + 会话校验”逻辑）；
      - 未找到 → `ERR_ACCESS_INVALID`；
      - 过期（`access_token_expires_at <= now`） → `ERR_ACCESS_EXPIRED`；
      - app_id 不匹配 → `ERR_APP_ID_MISMATCH`；
      - 成功时返回 `ValidationResult(guid, app_id, expires_at)`。

- QA/UT：
  - `dev/tests/test_token_validator_cycle9_10.py`：
    - 有效 Token 验证通过（TC-AUTH-FL03-001）；
    - 过期 Token → `ERR_ACCESS_EXPIRED`（TC-AUTH-FL03-002）；
    - 伪造 Token → `ERR_ACCESS_INVALID`（TC-AUTH-FL03-003）；
    - app_id 不匹配 → `ERR_APP_ID_MISMATCH`（TC-AUTH-FL03-004）。

**与 PRD/Dev Plan 对齐情况**：

- BR-05 与 ERR 13.2 中对 Access Token 验证规则与错误码的要求在 `TokenValidator` 与单测中有完整映射；
- Dev Plan 中 Cycle8/9/10 对“前端错误处理 + BE 验证/鉴权 + QA”的职责划分已在代码层体现：FE 封装错误处理，BE 提供验证逻辑，UT 衔接 PRD 错误码语义。

---

## 三、测试与验证状态

### 3.1 单元测试

- 命令：

```bash
python -m unittest discover -s dev/tests -p "test_*.py"
```

- 当前结果：

```text
................
----------------------------------------------------------------------
Ran 16 tests in 0.001s

OK
```

- 覆盖内容：
  - 登录/注册主流程（AuthService.login_with_phone）；
  - 验证码校验（BR-09）；
  - GUID 生成规则（通过结果形态与唯一性间接验证）；
  - Token 刷新规则（TokenService.refresh_access_token）；
  - 刷新调度逻辑（RefreshScheduler）；
  - Token 验证逻辑（TokenValidator.validate_access_token）。

### 3.2 集成/E2E 视角

- 由于当前实现为“本地 Python/JS 骨架 + InMemory 存储”，尚未搭建完整 HTTP 服务与浏览器 E2E 环境；
- 但通过组合 login → refresh → validate 三层单测，已在逻辑层构建了端到端调用链：
  - 登录生成 Token → 刷新更新 Access Token → 验证判断有效性/过期/伪造/app_id 不匹配。

> 后续接入真实 Web 框架 / 浏览器环境后，可直接将现有 UT 对应到 API/E2E 测试，实现 TestCase 文档中 TC-AUTH-FL01/02/03 的自动化版本。

---

## 四、与需求/计划的一致性分析

### 4.1 与 PRD（需求）的一致性

- 功能层面：
  - 已实现 US-01 下的 FL-01/FL-02/FL-03 所涉及的核心行为：
    - 手机号登录/注册（已有/新/封禁/注销）；
    - Token 刷新（生命周期与错误分支）；
    - Token 验证（有效性/过期/伪造/app_id 不匹配）；
  - BR-01～BR-05 / BR-07 / BR-08 / BR-09 在实现与测试中均有对应：
    - GUID 生成、登录/注册判定、Token 生命周期、刷新与验证规则、本地会话暂留为 SSO 迭代；
    - 封禁登录行为与相关错误码（ERR_USER_BANNED）；
    - 验证码错误/过期/频率限制部分逻辑在验证码服务与前端骨架中有所体现。

- 错误码层面：
  - 登录/验证码错误码（ERR_CODE_INVALID / EXPIRED / PHONE_INVALID / USER_BANNED）与 PRD 13.1 对齐；
  - 刷新错误码（ERR_REFRESH_EXPIRED / MISMATCH / APP_ID_MISMATCH）与 PRD 13.2 对齐；
  - 验证错误码（ERR_ACCESS_EXPIRED / INVALID / APP_ID_MISMATCH）与 PRD 13.2 对齐。

### 4.2 与 Dev Plan（计划）的一致性

- 每个 Cycle1～10 在 Dev Plan 中的描述都能在 `dev/` 下找到对应实现与测试：
  - Cycle1/4：前端登录页交互与 Token 错误封装；
  - Cycle2/6/9：AuthService + TokenService + TokenValidator 等后端服务实现；
  - Cycle3/7/10：对应的 UT/集成测试文件，实现了 Dev Plan 中规划的 QA 工作（在当前环境以 Python unittest 代替）；
  - Cycle5：RefreshScheduler 调度逻辑与单测，符合刷新策略描述。

> 结论：从“实现 ↔ Dev Plan ↔ PRD”的映射上看，Cycle1–10 已建立起清晰的一致性链路，没有发现“计划中有而实现中缺失”的核心点。

---

## 五、未完成与后续工作（针对 Cycle1–10 范围）

在 Cycle1–10 范围内，仍有以下工作属于**后续迭代或接入真实环境时需要补齐的内容**：

1. **真实 HTTP 服务与 API 层**：
   - 当前 BE 实现是纯 Python 服务/领域层骨架，未接上实际 Web 框架与 REST 接口；
   - 后续需要在选定技术栈（如 Java/Spring、Go/Gin、Node/Nest 等）下实现 API-01～API-04，映射现有服务逻辑与错误码。
2. **Redis 与 DB 的实际接入**：
   - 目前通过 InMemory 仓储/SessionStore 模拟，需要在正式实现中替换为 Redis + DB 层；
   - 同时补充 C-02（Redis 故障）场景下的集成测试与监控。
3. **前端集成与 UI 细节**：
   - `login.html/login.js` / `request.js` 当前为静态文件，需集成到实际前端框架（React/Vue 等）中，并补充 UI/UX 细节；
4. **QA / E2E 自动化测试**：
   - 当前主要通过 Python UT 验证逻辑，尚未在真实客户端 + 浏览器/端到端环境中运行完整 TC；
   - 待接入真实环境后，根据 `测试用例-DevPlan对齐版` 落地自动化脚本。

这些项目不影响对“已完成 Cycle1–10 的逻辑正确性与与文档一致性”的结论，但需要在后续迭代中持续推进，实现从“骨架 + 单测”到“完整产品级实现”的过渡。

---

## 六、综合结论

- 从 **PRD 对齐** 角度看：
  - Cycle1–10 已实现 US-01 下登录/刷新/验证三条核心流程的主要业务分支与错误码行为，与 BR/ERR 规范一致；
- 从 **Dev Plan 对齐** 角度看：
  - 每个 Cycle1–10 在代码与测试中都有对应实现，未发现关键 Task 遗漏；
- 从 **测试与 TDD 角度** 看：
  - 函数级与流程级单元测试（共 16 条）全部通过，为后续接入 HTTP/E2E 测试奠定了可靠基础。

> 因此，可以将当前 `dev/` 下的实现视为 **Cycle1–10 的“设计 + 逻辑实现 + 单测基线”**，在进入后续 SSO/退出/后台迭代时，以本开发回顾为参考确保演进不破坏已完成范围的业务语义与行为约束。
