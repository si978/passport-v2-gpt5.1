# Passport 统一认证中心 - 迭代 3 落地计划（Cycle11–15）

> 目标：在已完成 AUTH-01 模块登录/刷新/验证（Cycle1–10）的基础上，落地 **SSO-02 模块的跨客户端 SSO 与本地会话流程（FL-04）**，覆盖 Dev Plan 中的 **Cycle11～15**，实现从“同机一次登录”到“多客户端自动登录 + 网吧安全退出”的关键能力骨架与单元测试。

关联文档：

- 需求：`passport-统一认证中心-PRD-草稿.md`（v1.1，US-02/US-03，FL-04，BR-06，AC-02/AC-04）；
- 决策：`passport-统一认证中心-PRD-审查与决策汇总-已决策.md`（Q-01/Q-03/Q-05/Q-07/Q-08/Q-12/Q-18），`passport-统一认证中心-多视图冲突与决策清单-已决策.md`（C-03/C-04/C-05）；
- Dev Plan：`dev-plan/passport-统一认证中心-开发计划.md`（SSO-02 模块，Cycle11～15）；
- 测试：`passport-统一认证中心-测试用例-DevPlan对齐版.md`（TC-SSO-FL04-001～007）；
- UT：`passport-统一认证中心-单元测试设计-TDD版.md`（LocalSessionCrypto/Validator、SsoStartupHandler、SsoSecurityHandler 等）。

---

## 一、迭代范围与目标

### 1.1 本迭代范围（Scope）

- 覆盖 Dev Plan 中的以下 Cycle：
  - **Cycle11** = [SSO-02][US-02][FL-04][FE]
  - **Cycle12** = [SSO-02][US-02][FL-04][SH]
  - **Cycle13** = [SSO-02][US-02][FL-04][NM]
  - **Cycle14** = [SSO-02][US-02][FL-04][BE]
  - **Cycle15** = [SSO-02][US-02][FL-04][QA]

- 业务能力目标：
  1. 在同一 Windows 用户下，实现“客户端启动 → 壳层检查 LocalSession → 前端决定是否自动登录”的完整 SSO 流程骨架；
  2. 落地本地会话文件结构/加解密/完整性校验规则（BR-06），并在多种异常场景下做出安全决策（删除/禁用 SSO，回到登录页）；
  3. 支持同一 GUID 在多个 app_id 下维护独立 Access Token（满足“多客户端共享会话 + 各自 Access Token”的需求），为 SSO 端到端打通刷新能力；
  4. 通过 UT 和逻辑级集成测试覆盖正常 SSO、LocalSession 缺失/损坏/超 2 小时阈值、多应用 SSO 与 DPAPI/ACL 异常降级场景。

### 1.2 不在本迭代范围内（Out of Scope）

- 不实现：
  - Windows 注销/关机的真实集成，仅通过时间与状态模拟网吧下机场景；
  - 真实 DPAPI & 文件 ACL 配置，当前以可测试的加密/解密抽象替代；
  - 退出/封禁联动（FL-05，Cycle16～20）与后台管理（ADMIN-04），留待后续迭代。

---

## 二、Cycle11～15 详细落地计划

### 2.1 Cycle13 优先（NM）：LocalSession 加解密与校验

> 实际编码顺序上，建议先完成 Cycle13 的本地会话组件，再去实现 Cycle12/11/14/15。

**目标**：实现本地会话加解密与完整性/时间校验组件，为壳层启动检查与 SSO 决策提供基础能力。

**工作拆分**：

1. 组件实现（Python 骨架，放在 `dev/native/local_session.py`）：
   - `LocalSessionCrypto`：
     - `encrypt(payload: dict) -> bytes`：将 JSON 序列化后进行简单加密（例如 base64 或对称加密占位），确保“密文不包含明文手机号等敏感字段”；
     - `decrypt(cipher: bytes) -> dict`：解密并反序列化 JSON，密文非法时抛出异常；
   - `LocalSessionValidator`：
     - `validate(struct: dict, now) -> status`，返回状态枚举：`VALID` / `CORRUPTED` / `EXPIRED_LOCAL`；
     - 检查必填字段（guid/phone/created_at/expires_at 等）与时间关系（`expires_at >= created_at`，`now <= expires_at` 等）；
     - 若 `created_at` 距当前时间 >2 小时但 <2 天 → `EXPIRED_LOCAL`，对应“本地 SSO 失效但远端会话仍可能有效”。

2. UT 落地（`dev/tests/test_local_session_cycle13.py`）：
   - UT-SSO-LSC-ENC-01：加解密往返保持 JSON 一致；
   - UT-SSO-LSC-DEC-02：非法密文解密失败 → 映射为“损坏”；
   - UT-SSO-LSV-VAL-01/02/03：完整/缺少字段/超过 2 小时阈值的校验结果。

**完成标准（DoD）**：

- 加解密与校验 UT 全部通过；
- 本地会话结构和时间规则与 PRD BR-06/C-03 一致。

---

### 2.2 Cycle12 — 壳层启动时 LocalSession 检查与 IPC 状态通知

**目标**：实现壳层启动逻辑，在应用启动时对 LocalSession 进行一次检查，并通过 IPC 向前端广播 `session.status`，为前端自动登录提供决策依据。

**工作拆分**：

1. 组件实现（`dev/shell/sso_startup.py`）：
   - `SsoStartupHandler`：
     - 构造函数接受依赖：`read_session_file`（调用 LocalSessionCrypto + 文件 IO）、`delete_session_file`、`validator`、`broadcast_status`；
     - 方法 `handle_startup(now)`：
       - 调用 `read_session_file()` 获取加密会话；
       - 使用 `LocalSessionValidator.validate` 判断状态：
         - `VALID` → `broadcast_status("sso_available")`；
         - `CORRUPTED` / `EXPIRED_LOCAL` → 删除文件并 `broadcast_status("none")`；
       - 文件不存在时 → `broadcast_status("none")`。

2. UT 落地（`dev/tests/test_sso_startup_cycle12_15.py` 中的一部分）：
   - UT-SSO-SH-START-01：有效 LocalSession → 发送 `sso_available`；
   - UT-SSO-SH-START-02：文件不存在 → 发送 `none`；
   - UT-SSO-SH-START-03：损坏 → 删除文件 + `none`；
   - UT-SSO-SH-START-04：超过 2 小时阈值 → 删除文件 + `none`。

**完成标准（DoD）**：

- SsoStartupHandler 单测覆盖上述分支并全部通过；
- 接口形式可被实际壳层项目平滑对接（read/delete/broadcast 抽象清晰）。

---

### 2.3 Cycle11 — 前端 SSO 自动登录触发与 UI 状态切换

**目标**：在前端实现基于壳层 IPC `session.status` 的自动登录逻辑：有 SSO 可用时调用刷新接口进入登录态，否则保持在登录页。

**工作拆分**：

1. 前端 SSO 启动模块（`dev/frontend/sso/sso_startup.js`）：
   - 定义 `handleSessionStatus(status)`：
     - `"sso_available"`：
       - 从 LocalStorage 或 LocalSession 中获取 Refresh Token（假设壳层/原生在首次登录时已同步写入）；
       - 使用 `apiRequest("/api/passport/refresh-token", ...)` 调用刷新接口；
       - 成功：更新前端 AuthState（guid/access_token/refresh_token）并跳转主页；
       - 失败：回到登录页，提示需重新登录；
     - `"none"`：保持在登录页，不做自动登录尝试。

2. 与通用请求封装集成：
   - 重用 `dev/frontend/request.js` 中 `apiRequest` 对错误码分类处理，避免重复逻辑。

**完成标准（DoD）**：

- 在前端代码中已存在 SSO 启动处理入口，可供实际客户端 IPC 调用；
- 行为与测试用例文档中的 TC-SSO-FL04-001/002 的前端描述一致（有 SSO 时自动登录，无 SSO 时展示登录页）。

---

### 2.4 Cycle14 — 后端对跨客户端 SSO 刷新场景的支持

**目标**：确保后端在 SSO 场景下使用同一 GUID 的 Refresh Token 时，可以为新的 app_id 创建对应的 Access Token 子会话，实现“一次登录，多客户端共享 Refresh Token，各自维护 Access Token”。

**工作拆分**：

1. 调整 `TokenService.refresh_access_token` 逻辑：
   - 当 Session 存在且 Refresh Token 有效时：
     - 若 `apps[app_id]` 存在 → 更新 Access Token（已在 Cycle6 实现）；
     - 若不存在 → 创建新的 `AppSession`（支持 SSO 场景下第二个客户端首次刷新）；
   - 不再将 `apps[app_id]` 缺失视为 `ERR_APP_ID_MISMATCH` 错误。

2. UT 补充（更新 `test_token_refresh_cycle6.py`）：
   - 新增/调整用例：
     - SSO 多应用场景：初始会话仅包含 `app_id="jiuweihu"`，使用相同 Refresh Token 调用 `app_id="youlishe"` 时，应为 youlishe 创建新的 `AppSession` 并生成独立 Access Token，而非报错。

**完成标准（DoD）**：

- 单测通过，确认跨应用刷新行为符合“多 app 子会话”设计（PRD DM-02 与 Dev Plan Cycle14 描述）；
- 原有错误分支（Refresh 过期/不匹配）行为不受影响。

---

### 2.5 Cycle15 — SSO 与网吧串号防护 QA（逻辑级）

**目标**：通过单元测试与逻辑级集成测试验证 SSO 正常路径与异常路径（缺失/损坏/超过 2 小时阈值、多 app SSO），为后续在真实环境中实现完整 QA 提供基线。

**工作拆分**：

1. 在 `dev/tests/test_sso_startup_cycle12_15.py` 中补充逻辑级场景：
   - TC-SSO-FL04-001/002/003/004 对应的核心逻辑：
     - 正常 SSO：`LocalSession` 有效且未超过 2 小时 → `sso_available`，调用刷新后进入登录态；
     - LocalSession 缺失 → `none`，展示登录页；
     - LocalSession 损坏 → 删除文件 + `none`；
     - LocalSession 超过 2 小时阈值 → 删除文件 + `none`；
   - 多应用 SSO（TC-SSO-FL04-005）：
     - 首先在 app_id="jiuweihu" 登录并生成 Refresh Token + LocalSession；
     - 通过刷新为 `"youlishe"` 创建第二个 app 子会话；
     - 验证两个 app 的 Access Token 相互独立。

2. 将上述逻辑与现有 AuthService/TokenService/LocalSession 组件串联，构建“伪端到端”测试路径。

**完成标准（DoD）**：

- 新增/更新的 UT 全部通过；
- 从逻辑层面验证 SSO 主流程与主要异常场景，与 PRD AC-02/AC-04 的要求一致（网吧下机不串号）。

---

## 三、迭代验收与退出条件

1. 功能层面：
   - SSO 正常路径：在 LocalSession 有效的情况下，第二客户端可无输入验证码完成登录；
   - 异常路径：LocalSession 缺失/损坏/超过 2 小时阈值时，系统统一回到登录页并清理本地文件，不进行自动登录；
   - 多应用场景：同一 GUID 在多个 app 下维持独立 Access Token 子会话。
2. 测试层面：
   - 与 Cycle11～15 对应的 UT 全部实现并通过；
   - 在本地逻辑级集成测试中，网吧串号相关场景得到覆盖并通过。
3. 文档与实现对齐：
   - 如实现过程中对 LocalSession 结构或行为有调整，已同步更新 PRD BR-06/FL-04 或相关设计文档（如《数据模型与数据库设计》《日志与审计设计》）；

满足以上条件后，即可进入后续迭代（推荐覆盖退出/封禁与后台管理的 Cycle16～20、Cycle24～29）。
