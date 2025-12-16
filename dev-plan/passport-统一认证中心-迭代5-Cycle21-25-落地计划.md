# Passport 统一认证中心 - 迭代 5 落地计划（Cycle21–25）

> 目标：在已完成登录/刷新/验证（Cycle1–10）与会话销毁/封禁（Cycle16–20）基础上，补齐 **验证码发送流程（FL-06 AUTH-01）** 与 **后台用户信息查询与封禁流程（FL-06 ADMIN-04）** 的核心实现与测试，覆盖 Dev Plan 中的 Cycle21～25。

关联文档：

- 需求：`passport-统一认证中心-PRD-草稿.md`（US-01 BR-09/ERR 13.1 验证码、US-05 后台管理、BR-08 封禁逻辑、DM-01 用户表）；
- 决策：`passport-统一认证中心-PRD-审查与决策汇总-已决策.md`，`passport-统一认证中心-多视图冲突与决策清单-已决策.md`；
- 总开发计划：`dev-plan/passport-统一认证中心-开发计划.md`（AUTH-01 / ADMIN-04 模块中 Cycle21～25）；
- 现有实现基线：
  - Python：登录/刷新/验证/会话销毁/封禁（Cycle1–20），含验证码校验逻辑；
  - NestJS：登录/刷新/验证、验证码发送骨架 `/passport/send-code`、退出 `/passport/logout`；
  - React：登录页、发送验证码按钮交互骨架、Token 错误处理。

---

## 一、迭代范围与目标

### 1.1 Scope：覆盖 Dev Plan 中的 Cycle21～25

- AUTH-01 / FL-06：验证码发送流程（BR-09 / API-01）
  - **Cycle21** = [AUTH-01][US-01][FL-06][FE]
  - **Cycle22** = [AUTH-01][US-01][FL-06][BE]
  - **Cycle23** = [AUTH-01][US-01][FL-06][QA]
- ADMIN-04 / FL-06：后台用户信息查询与封禁流程
  - **Cycle24** = [ADMIN-04][US-05][FL-06][FE]
  - **Cycle25** = [ADMIN-04][US-05][FL-06][BE]

> 本迭代优先在 Python + NestJS + React 三层为验证码与后台用户管理打通一条“从逻辑到生产栈”的主干，QA 部分以 Python/NestJS UT 的形式先行落地，后续可再补 UI/E2E 级测试。

---

## 二、Cycle21–23：验证码发送流程（AUTH-01 FL-06）

### 2.1 Cycle21 — [AUTH-01][US-01][FL-06][FE] 发送验证码前端交互优化

**目标**：在前端完善“获取验证码”按钮逻辑，确保调用实际 API-01 `/api/passport/send-code`，并对手机号格式与错误码进行统一处理。

**工作拆分**：

1. React 前端（`dev/frontend-react`）：
   - 已有 `sendCode(phone)` 调用 `/passport/send-code`，本迭代确认其在 `LoginPage` 中：
     - 使用 PRD 正则 `^1[3-9][0-9]{9}$` 校验手机号；
     - 成功发送后启动 60 秒倒计时并禁用按钮；
     - 捕获后端返回错误码（如 `ERR_PHONE_INVALID` / 未来的 `ERR_CODE_TOO_FREQUENT`），在页面上展示友好提示。

2. Python HTML 前端骨架（可选）：
   - 如有需要，可在 `dev/frontend/login/login.js` 中对接 `/api/passport/send-code` 的实际错误码并统一提示（目前已有基础逻辑）。

**完成标准（DoD）**：

- React 登录页点击“获取验证码”时实际调用后端 `/api/passport/send-code`，手机号校验严格；
- 错误码通过前端消息区域可见，行为与 PRD 错误语义一致。

> 本仓库当前重点在逻辑与后端实现，因此 Cycle21 前端侧主要是确认与已有实现对齐，无需大幅改动代码结构。

---

### 2.2 Cycle22 — [AUTH-01][US-01][FL-06][BE] 验证码发送 API 与错误码行为

**目标**：在 NestJS 后端中完善验证码发送服务：

- 校验手机号格式并返回 `ERR_PHONE_INVALID`；
- 生成 6 位数字验证码并存入内存存储（后续可替换为 Redis）；
- 为测试与 PoC 目的提供基础实现，并通过 Jest UT 覆盖主分支。

**当前实现与补充**：

1. 已有实现（本次修复前已完成）：
   - `VerificationCodeService.sendCode(phone)`：
     - 使用正则校验手机号，不合法 → 抛出 `ERR_PHONE_INVALID`；
     - 生成 6 位随机验证码并调用 `saveCode(phone, code, 5 * 60)` 存储 5 分钟有效期；
     - 留有 TODO 以接入实际短信网关。
   - `AuthController.sendCode`：
     - `POST /api/passport/send-code` 接收 `SendCodeDto`（包含手机号），调用 `vcService.sendCode` 并返回 `{ success: true }`。

2. 补充计划（保留在未来迭代）：
   - 频率限制与 `ERR_CODE_TOO_FREQUENT` 错误码；
   - 接入真实短信网关及错误回退策略；
   - 在 Python PoC 中按 BR-09 实现频控与对应 UT。

**完成标准（DoD，本迭代）**：

- NestJS 后端 `/passport/send-code` 可以正确校验手机号并生成验证码，错误码行为与现有 Jest UT 一致；
- 留好接口与扩展点以支持后续引入频率限制与网关集成。

---

### 2.3 Cycle23 — [AUTH-01][US-01][FL-06][QA] 验证码发送逻辑级测试

**目标**：通过 Jest 与 Python UT 验证验证码发送与校验逻辑的主要分支，确保 FE/BE 对验证码行为有可依赖的基线。

**工作拆分**：

1. NestJS UT（已完成）：
   - `verification-code.service.spec.ts`：
     - `saveCode + validateCode`：正确验证码通过，错误验证码抛 `ERR_CODE_INVALID`；
     - `sendCode` 对非法手机号抛 `ERR_PHONE_INVALID`；
2. Python UT（已完成）：
   - `test_auth_cycle1_2.py` 等：覆盖 `VerificationCodeService.validate_code` 的正确/错误/过期场景。

**完成标准（DoD，本迭代）**：

- Node 侧 Jest 用例与 Python 侧 unittest 的行为保持一致，均验证核心错误码分支；
- 后续在引入频控与短信网关时，可在此基础上继续扩展测试矩阵。

---

## 三、Cycle24–25：后台用户信息查询与封禁（ADMIN-04 FL-06）

> 本迭代在代码层先构建 **Python PoC 级后台查询/封禁能力 + NestJS 骨架**，用于验证 BR-08 与 US-05 的主要行为，前端 UI 与完整权限体系在后续迭代逐步补齐。

### 3.1 Cycle25 优先：后端用户查询与封禁接口 PoC

#### Cycle25 — [ADMIN-04][US-05][FL-06][BE] Python 后端用户查询与封禁接口（PoC）

**目标**：在 `dev/backend` 中基于已有的 `InMemoryUserRepo` 与 `BanService`，提供简单的“用户列表查询 + 封禁/解封”服务接口与单测，验证后台管理核心行为与 PRD BR-08 对齐。

**工作拆分**：

1. 在 `backend/services.py` 中新增：
   - `UserQueryService`：
     - 方法 `list_users(status: Optional[UserStatus] = None) -> list[User]`：
       - 直接从 `InMemoryUserRepo` 返回全部用户，按创建时间/手机号排序；
       - 可根据 `status` 过滤（ACTIVE/BANNED/DELETED）。
   - `BanService` 已实现基础封禁；本迭代可选增加 `unban_by_phone(phone: str)` 恢复为 ACTIVE。

2. 新增 UT `test_admin_user_query_cycle25.py`：
   - 场景 1：创建多个用户（ACTIVE/BANNED/DELETED），验证 `list_users()` 返回所有用户，排序正确；
   - 场景 2：按不同 status 过滤，结果集中状态正确；
   - 场景 3：封禁/解封后查询结果实时反映最新状态。

**完成标准（DoD）**：

- Python 层有最小可用的后台用户查询/封禁服务 + UT；
- 行为与 PRD BR-08（封禁）和 DM-01（User.status 语义）一致。

---

### 3.2 Cycle24 — [ADMIN-04][US-05][FL-06][FE] 后台用户列表前端骨架

**目标**：在 React 前端中为后台用户列表提供最小骨架：一个可扩展的“用户列表页面”组件，调用（未来的）NestJS 后台查询 API，并支持按状态简单筛选。

**工作拆分**：

1. 新增 `frontend-react/src/features/admin/UserListPage.tsx`（骨架）：
   - 使用 `useEffect` 调用占位 API `/api/admin/users`（未来由 NestJS 提供）；
   - 显示基本字段：手机号、guid、状态、来源；
   - 预留状态筛选下拉框（ALL/ACTIVE/BANNED/DELETED）。
2. 当前迭代不强制实现完整后台 API，仅搭好前端结构与调用点，为后续 NestJS 实现提供对接位置。

**完成标准（DoD）**：

- React 代码中存在用户列表组件骨架，可路由到该页面（例如 `/admin/users`）；
- 逻辑清晰区分“数据获取层（API）”与“展示/筛选层”，便于后续扩展查询条件与封禁操作按钮。

---

## 四、迭代验收与退出条件

1. 验证码发送流程：
   - React 登录页可实际调用 NestJS `/passport/send-code`，手机号校验正确，错误码行为与 Jest/Python UT 一致；
   - VerificationCodeService 的发送/校验核心逻辑在 Node 与 Python 层都由自动化测试覆盖。
2. 后台用户管理 PoC：
   - Python PoC 中存在 `UserQueryService` 与增强版 `BanService`，并有 UT 验证查询与封禁/解封行为；
   - React 前端存在用户列表页面骨架，与未来后台 API 有明确对接点。
3. 验证：
   - Python：`python -m unittest discover -s dev/tests -p "test_*.py"` 全部通过；
   - Node：`cd dev/backend-node && npm test` 通过（涵盖验证码与 Token、AuthService）；
   - React：`cd dev/frontend-react && npm run build` 通过，确保新增骨架组件可编译。

满足以上条件后，可进入覆盖后台活跃数据与日志/监控的迭代 6（Cycle26～29）。
