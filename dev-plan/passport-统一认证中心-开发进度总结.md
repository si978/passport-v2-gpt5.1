# Passport 统一认证中心 - 开发进度总结（至 NestJS/React 骨架落地节点）

> 目的：在完成 AUTH-01 模块（登录/刷新/验证）逻辑闭环，并搭建生产级 NestJS 后端与 React 前端骨架后，对当前整体开发进度做一次阶段性总结，为后续迭代（SSO 壳层集成、退出/封禁、后台管理等）提供清晰基线。

关联文档：

- 需求基线：`passport-统一认证中心-PRD-草稿.md`（SSoT）；
- 决策基线：`passport-统一认证中心-PRD-审查与决策汇总-已决策.md`，`passport-统一认证中心-多视图冲突与决策清单-已决策.md`；
- 计划基线：`dev-plan/passport-统一认证中心-开发计划.md`；
- 迭代落地计划：
  - `dev-plan/passport-统一认证中心-迭代1-Cycle1-5-落地计划.md`
  - `dev-plan/passport-统一认证中心-迭代2-Cycle6-10-落地计划.md`
  - `dev-plan/passport-统一认证中心-迭代3-Cycle11-15-落地计划.md`
- 开发回顾：`dev-plan/passport-统一认证中心-开发回顾-迭代1-2-Cycle1-10.md`

---

## 一、当前整体完成度总览

1. **需求侧**：
   - PRD v1.1 已作为单一事实源（SSoT）固化，Q/C 决策已映射到 PRD 与多视图文档中；
   - 针对 AUTH-01/SSO-02 模块的 FL/BR/ERR 均有明确规范，具备可实现性与可测试性。

2. **逻辑实现侧（Python 骨架）**：
   - 已完成功能：AUTH-01 模块 US-01（登录/刷新/验证）与 SSO-02 模块 US-02/US-03 的核心逻辑流程；
   - 覆盖迭代：Cycle1–15（登录/刷新/验证 + SSO 本地会话与多 app 子会话），有 26 条单元测试全部通过；
   - 作用：作为“可执行规格说明”和后续多技术栈迁移的逻辑基线。

3. **生产级技术栈实现侧（NestJS + React 骨架）**：
   - 后端：NestJS + TypeORM + PostgreSQL + Redis 的基础工程已搭建，AUTH-01 的登录/刷新/验证接口已完成；
   - 前端：React + Vite + TS 工程已搭建，登录页与 Token 错误处理封装已对齐 PRD/DevPlan；
   - SSO：前端/后端为 SSO 流程预留了接口与能力（多 app 子会话刷新、SSO 启动处理函数），壳层/LocalSession/IPC 仍处于 PoC 阶段。

4. **测试与质量侧**：
   - Python 单元测试：26 条 UT 全部通过，覆盖登录/验证码/刷新调度/刷新接口/Token 验证/LocalSession/SSO 决策；
   - Node/React：尚未建立正式的 UT/集成测试套件，当前依赖 Python 层作为“金标准”。

> 综合判断：对于 **核心认证主链路（US-01：登录/刷新/验证）**，已经具备从规格 → PoC → 生产栈骨架的闭环；SSO 与退出/后台等扩展能力仍需在生产栈中继续演进。

---

## 二、按模块 / 迭代引导的进度拆解

### 2.1 AUTH-01 模块（US-01：登录 / 刷新 / 验证）

**迭代 1：Cycle1–5（登录 + 刷新调度骨架）**

- Python：
  - 后端领域与服务：`dev/backend/domain.py`, `dev/backend/services.py` 实现：
    - `AuthService.login_with_phone`：手机号登录/注册主流程（FL-01），支持已有用户/新用户/封禁/注销再登录；
    - GUID 生成（BR-01）、验证码校验（BR-09）、Session 结构与 Refresh/Access 生命周期（BR-02/03/07/08）。
  - 前端骨架：`dev/frontend/login/login.html` + `login.js` 实现基础登录表单与交互；
  - 刷新调度：`dev/shell/refresh_scheduler.py` + UT 实现周期性刷新与失败重试（Cycle5）。

- NestJS / React：
  - Nest：`POST /api/passport/login-by-phone` 实现与 Python 版一致的登录/注册逻辑与错误码语义；
  - React：`LoginPage.tsx` + `sendCode/loginByPhone` 调用后端接口，前端校验与 UX 与 DevPlan 一致。

> 状态：AUTH-01/FL-01 在 Python 与 Nest/React 层均已落地，差异仅在于验证码发送实现仍为占位（待接入短信网关）。

**迭代 2：Cycle6–10（刷新接口 + 验证接口）**

- Python：
  - 刷新接口：`TokenService.refresh_access_token` + `test_token_refresh_cycle6.py`，覆盖正常刷新/过期/不匹配/多 app 子会话创建；
  - 验证接口：`TokenValidator.validate_access_token` + `test_token_validator_cycle9_10.py`，覆盖有效/过期/伪造/app_id 不匹配；
  - 前端错误处理骨架：`dev/frontend/request.js` 聚合 Token 错误处理与自动跳转行为。

- NestJS / React：
  - Nest：
    - `POST /api/passport/:guid/refresh-token` + `POST /api/passport/refresh-token`：与 Python 刷新逻辑对齐，支持多 app 子会话；
    - `POST /api/passport/verify-token`：与 Python 验证逻辑对齐，返回 guid/app_id/expires_at；
  - React：
    - `api/client.ts` 拦截错误码：`ERR_ACCESS_EXPIRED/INVALID` → 清理登录态并跳转登录页，`ERR_APP_ID_MISMATCH` → 无权限提示；
    - 所有后续 API 可统一通过该客户端访问。

> 状态：AUTH-01/FL-02, FL-03 在 Python 与 Nest/React 层已经形成比较完整的一致性闭环，下阶段重点是增加 Node/React 侧的自动化测试与鉴权中间件集成。

### 2.2 SSO-02 模块（US-02/US-03：跨客户端 SSO + 网吧场景）

**迭代 3：Cycle11–15（本地会话 + 壳层启动 + 多 app SSO）**

- Python：
  - LocalSession：`dev/native/local_session.py` + `test_local_session_cycle13.py`
    - base64 占位加密（可替换为 DPAPI），结构/时间校验实现 BR-06 与 2 小时阈值（C-03）；
  - 壳层启动：`dev/shell/sso_startup.py` + `test_sso_startup_cycle12_15.py`
    - 启动一次性检查 LocalSession，根据 VALID/CORRUPTED/EXPIRED_LOCAL 决定是否删除文件与广播 `sso_available/none`；
  - 多 app SSO：
    - TokenService 支持同 GUID 不同 app_id 子会话，UT 验证“共享 Refresh、独立 Access”。

- NestJS / React：
  - Nest：多 app 子会话刷新能力已在 TokenService 中实现，适合作为 SSO 场景后端支点；
  - React：`features/sso/ssoStartup.ts` 提供 `handleSessionStatus`，在 `sso_available` 时使用现有 guid/refresh_token 调用刷新接口并进入登录态。

> 状态：
> - 逻辑层：SSO 的核心决策规则（本地会话结构/阈值、多 app SSO 刷新）已在 Python 中实现并被单测覆盖；
> - 生产栈：Nest/React 侧完成了 SSO 所需的关键后端能力与前端入口，但壳层 IPC 与真实 LocalSession 文件操作仍未在生产环境实现，当前仍处于“可行性验证 + 接口预留”阶段。

### 2.3 后续模块（退出/封禁、后台管理、日志/监控）

- PRD 与 DevPlan 已对以下模块做拆分与排期：
  - FL-05：退出/封禁联动（Cycle16–20）；
  - FL-06/FL-07：后台查询/导出 + 日志/监控工程化（Cycle21–29）；
- 当前状态：
  - Python 与 Nest/React 均 **尚未开始具体实现**，只有文档/计划与部分数据模型/日志设计作为前置；
  - 对整体 AUTH-01/SSO-02 主链路不构成阻塞，但对运维可观测性与运营能力是必要的后续迭代内容。

---

## 三、测试与质量保障现状

1. **Python 单测基线**：
   - 命令：`python -m unittest discover -s dev/tests -p "test_*.py"`
   - 当前结果：26 条测试全部通过；
   - 覆盖范围：
     - 登录/注册 & 验证码（正确/错误/过期、封禁/注销）；
     - Token 刷新接口与刷新调度（成功/过期/不匹配/多 app SSO）；
     - Token 验证（有效/过期/伪造/app_id 不匹配）；
     - LocalSession 加解密与 2 小时阈值、本地会话损坏/缺失/过期决策；
     - 壳层启动 SSO 决策与多 app SSO 刷新逻辑。

2. **Node/React 侧测试与验证**：
   - 当前尚未引入 Jest/Playwright 等测试框架；
   - 生产级后端/前端的正确性主要通过“与 Python 行为对齐”与人工审查保证；
   - 下一步建议：
     - 在 NestJS 中为 Auth/Token 服务增加单元测试，将 Python UT 的关键断言迁移过来；
     - 在 React 中为 `LoginPage` 与 SSO 启动逻辑增加最小组件测试/集成测试；
     - 逐步将 Python 单测的行为转化为 Node/React 侧的自动化测试用例，从而统一测试基线。

---

## 四、风险与未完成项清单（截至本次总结）

1. **生产环境集成风险**：
   - Redis 与 DB 未做规模/索引优化（SessionStore 使用 SCAN 查 Token），大规模并发下可能有性能瓶颈；
   - 验证码发送与频控仍为占位实现（无真实短信网关与安全策略）。

2. **SSO 工程化风险**：
   - 本地会话的 DPAPI/ACL、安全擦除策略仅在设计与 Python PoC 中体现，未在实际壳层/原生模块中落地；
   - IPC 协议与错误处理在真实客户端中尚未实现，可能导致 UX 与安全行为与 PRD 偏差。

3. **测试与可观测性不足**：
   - Node/React 侧缺乏系统化自动化测试与监控指标，错误只能通过日志/人工验证发现；
   - 日志与监控方案在文档侧已有设计，但尚未在 Nest/React 工程中接入。

4. **后续模块空缺**：
   - 退出/封禁、后台管理、活跃数据查询/导出仍为未实现状态，暂不影响核心认证，但影响完整产品化能力。

---

## 五、下一步建议（高优先级）

1. **落地 NestJS/React 与现有 Python Baseline 的一致性测试**：
   - 在本地搭建最小 Postgres + Redis 环境，部署 NestJS 后端与 React 前端；
   - 选取几条代表性业务流（登录、刷新、验证、失败分支）编写 Node/React 侧自动化测试，确保行为与 Python UT/PRD 一致。

2. **完善 AUTH-01 在生产栈中的工程细节**：
   - 接入真实短信/验证码服务与频控策略；
   - 增加 NestJS 鉴权 Guard/Decorator，将 `verify-token` 封装到中间件层，供业务服务复用；
   - 接入日志与监控，至少覆盖登录/刷新/验证错误与关键路径性能指标。

3. **推进 SSO-02 的工程落地**：
   - 基于 Python LocalSession/壳层 PoC，为目标平台（例如 Win32 C++/C#/Electron）设计实际的 LocalSession 存储/DPAPI 加密实现；
   - 确定壳层 → 前端的 IPC 协议，并将 `handleSessionStatus` 集成到真实 UI 生命周期中；
   - 引入 QA 侧针对 SSO/网吧场景的端到端测试脚本。

4. **按 DevPlan 推进后续迭代**：
   - 迭代 4+：实现退出/封禁（FL-05）、后台管理与活跃数据（FL-06/07），并在 Nest/React 层一并落地；
   - 持续维护“PRD ↔ DevPlan ↔ 实现 ↔ 测试”四个层面的强一致性。

> 本次进度总结可作为后续评估“是否进入更大规模集成测试 / 灰度发布”的参考基线：核心认证链路已具备从设计到生产栈骨架的闭环，SSO 与运营/运维能力则需要在接下来两到三个迭代中重点补齐。
