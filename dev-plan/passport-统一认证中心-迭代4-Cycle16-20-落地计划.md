# Passport 统一认证中心 - 迭代 4 落地计划（Cycle16–20）

> 目标：在已完成登录 / 刷新 / 验证（Cycle1–10）与 SSO 本地会话逻辑（Cycle11–15）的基础上，落地 **会话销毁（退出登录）流程 FL-05**，确保“用户主动退出 = 全局退出”、“封禁 = 立即失效”，并在 Python 骨架中完成实现与单元测试，为后续在 NestJS/壳层/真实客户端中的迁移提供清晰参照。

关联文档：

- 需求：`passport-统一认证中心-PRD-草稿.md`（US-04 / FL-05 / BR-07 / BR-08 / ERR 13.2）；
- 决策：`passport-统一认证中心-PRD-审查与决策汇总-已决策.md`，`passport-统一认证中心-多视图冲突与决策清单-已决策.md`；
- 总开发计划：`dev-plan/passport-统一认证中心-开发计划.md`（SESS-03 模块，Cycle16～20 定义）；
- 现有实现基线：
  - Python：`dev/backend/*.py`, `dev/native/local_session.py`, `dev/shell/*.py`, `dev/tests/*`；
  - 生产栈骨架：`dev/backend-node/*`, `dev/frontend-react/*`（本迭代优先在 Python 骨架中实现 FL-05 逻辑）。

---

## 一、迭代范围与目标

### 1.1 Scope：覆盖 Cycle16–20 的退出 / 封禁能力

- 按开发计划的定义，本迭代覆盖：
  - **Cycle16**  = [SESS-03][US-04][FL-05][FE] 前端退出交互与状态清理；
  - **Cycle17**  = [SESS-03][US-04][FL-05][SH] 壳层退出广播与本地会话清理；
  - **Cycle18**  = [SESS-03][US-04][FL-05][NM] 原生模块会话删除接口；
  - **Cycle19**  = [SESS-03][US-04][FL-05][BE] 后端会话销毁与封禁联动；
  - **Cycle20**  = [SESS-03][US-04][FL-05][QA] 退出/封禁全局效果测试。

### 1.2 本迭代的具体目标

1. 在 Python 骨架中新增 Logout/Ban 相关服务和测试：
   - 提供按 guid 删除会话的 LogoutService（幂等行为）；
   - 提供按 phone 封禁用户并删除会话的 BanService；
   - 通过 UT 验证退出后刷新/验证失败、封禁后登录失败等行为；
2. 在 LocalSession 模块中补齐文件级操作：
   - 安全地写入/读取/删除本地会话文件（使用占位加密逻辑）；
   - 删除操作幂等，文件不存在时不抛异常；
3. 壳层与前端层面：
   - 提供壳层 LogoutHandler 与前端退出脚本骨架，定义退出 → 调用后端/清理 LocalSession/广播状态的职责边界。

> 注意：本迭代在 Python 层实现退出/封禁的完整业务语义，并为 NestJS/React 与真实壳层/原生模块提供“对照实现”，不强求在本次迭代中同步完成生产栈迁移。

---

## 二、Cycle16–20 详细落地计划

### 2.1 Cycle19 / Cycle18 优先：后端与本地会话删除能力

> 实际编码顺序上，先完成 **后端会话销毁（Cycle19）** 与 **本地会话删除接口（Cycle18）**，再向壳层与前端层扩展，可减少依赖不稳定带来的反复。

#### Cycle19 — [SESS-03][US-04][FL-05][BE] 会话销毁与封禁联动（Python 骨架）

**目标**：在 `dev/backend` 中实现退出/封禁相关服务，使得：

- `logout(guid)` 可以全局删除该用户的会话（InMemorySessionStore 中的记录），重复调用幂等；
- `ban_by_phone(phone)` 更新用户状态为封禁并删除其会话，使后续登录尝试返回 `ERR_USER_BANNED`。

**工作拆分**：

1. 在 `backend/services.py` 中新增：
   - `LogoutService`：
     - 构造函数注入 `InMemorySessionStore`；
     - 方法 `logout(guid: str) -> None`：调用 `session_store.delete(guid)`，不抛出异常（幂等行为）；
   - `BanService`：
     - 构造函数注入 `InMemoryUserRepo` 与 `InMemorySessionStore`；
     - 方法 `ban_by_phone(phone: str) -> None`：
       - 查找用户，若不存在则直接返回；
       - 将 `status` 设为 `UserStatus.BANNED`，保存；
       - 调用 `session_store.delete(user.guid)` 删除所有会话。

2. 行为保证：
   - 退出后刷新请求（TokenService.refresh_access_token）因 Session 缺失而返回 `ERR_REFRESH_EXPIRED`；
   - 封禁后再次登录尝试触发 `ERR_USER_BANNED`。

3. 在 `dev/tests` 中新增 `test_logout_cycle19_20.py`：
   - 场景 1：正常登录 → LogoutService.logout(guid) → 会话删除 + 刷新失败 + 重复 logout 不抛异常；
   - 场景 2：正常登录 → BanService.ban_by_phone(phone) → User.status= BANNED + 会话删除 + 再次登录返回 `ERR_USER_BANNED`。

**完成标准（DoD）**：

- 新增 UT 通过且不破坏既有 26 条测试；
- 退出/封禁行为与 PRD BR-07/BR-08 语义一致（退出=全局退出，封禁=立即失效）。

#### Cycle18 — [SESS-03][US-04][FL-05][NM] 原生模块会话删除与错误处理接口

**目标**：在 `dev/native/local_session.py` 中补齐基于 `LocalSessionCrypto` 的文件级读写/删除接口，支持壳层与单测使用。

**工作拆分**：

1. 新增函数：
   - `write_session_file(path, payload: dict) -> None`：
     - 使用 `LocalSessionCrypto.encrypt` 将 payload 加密；
     - 将密文写入指定路径（以字节形式）。
   - `read_session_file(path) -> dict`：
     - 从指定路径读取字节，使用 `LocalSessionCrypto.decrypt` 解密为 dict；
     - 文件不存在时按调用方约定处理（由壳层捕获 FileNotFoundError）。
   - `delete_session_file(path) -> None`：
     - 删除文件，不存在则静默（幂等行为）。

2. 在 `test_local_session_cycle13.py` 中补充 UT：
   - 使用 `tempfile.TemporaryDirectory` 创建临时路径；
   - 验证写入-读取往返与原始 payload 一致；
   - 验证删除函数对不存在文件不抛出异常。

**完成标准（DoD）**：

- 新增 UT 通过；
- 删除行为幂等，满足 FL-05 对“退出后本地会话应被清理”的基础需求。

---

### 2.2 Cycle17 — 壳层退出广播与本地会话清理

#### Cycle17 — [SESS-03][US-04][FL-05][SH] LogoutHandler 壳层逻辑（Python 骨架）

**目标**：在 `dev/shell` 中提供壳层退出处理骨架：统一调用后端退出 API、删除本地会话文件，并通过 IPC 向前端广播会话状态变更。

**工作拆分**：

1. 新增 `shell/logout_handler.py`：
   - `LogoutHandler`：
     - 构造函数注入三个可替换依赖：
       - `api_logout: Callable[[], None]` —— 调用后端退出接口或 Python BE 的 LogoutService；
       - `delete_session_file: Callable[[], None]` —— 调用 LocalSession 文件删除逻辑；
       - `broadcast_status: Callable[[str], None]` —— 通过 IPC 向前端广播状态；
     - 方法 `logout()`：
       - 尝试调用 `api_logout()`，无论成功与否（异常在日志层处理）；
       - 始终调用 `delete_session_file()`；
       - 最终 `broadcast_status("logged_out")`。
   - 可选扩展方法 `on_banned()`：在封禁通知场景下调用 `delete_session_file()` 并 `broadcast_status("banned")`。

2. 在 `test_sso_startup_cycle12_15.py` 或新建测试文件中补充简单 UT：
   - 验证在 `api_logout` 抛异常时，`delete_session_file` 与 `broadcast_status` 仍会被调用；
   - 验证 `on_banned()` 行为（若实现）。

**完成标准（DoD）**：

- LogoutHandler 的核心分支通过 UT 覆盖；
- 接口形式便于未来在真实壳层中替换为实际 HTTP/IPC 实现。

---

### 2.3 Cycle16 — 前端退出交互与状态清理

#### Cycle16 — [SESS-03][US-04][FL-05][FE] 退出按钮与前端状态清理（骨架）

**目标**：在前端提供统一的“退出登录”入口和退出脚本：调用后端退出接口（占位），并在成功/失败后均清理本地登录状态并回到登录页。

**工作拆分（针对 Python 前端骨架）**：

1. 在 `dev/frontend/logout/logout.js` 中新增退出脚本：
   - 提供全局函数 `logout()`：
     - 调用 `/api/passport/logout`（占位 URL，当前环境可不真正落地）；
     - 无论接口结果如何，均清理 `localStorage` 中的 `passport_guid` / `access_token` / `refresh_token`；
     - 跳转到登录页（例如 `/login` 或登录 HTML）。
   - 若存在退出按钮（如 `#logout-btn`），为其绑定点击事件触发 `logout()`。

2. 与 React 生产前端的对齐（仅规划，不在本迭代强制实现）：
   - 将相同逻辑迁移到 `frontend-react` 中的 AuthContext 或 Header 组件中，复用 Axios 客户端，并调用 NestJS 的 `/api/passport/logout` 实际接口。

**完成标准（DoD）**：

- Python 前端骨架有明确的退出函数与本地状态清理逻辑；
- 逻辑与 PRD 中“退出后不应残留本地登录态”的要求一致。

---

### 2.4 Cycle20 — QA：退出 / 封禁全局效果测试

#### Cycle20 — [SESS-03][US-04][FL-05][QA] 逻辑级退出 / 封禁测试

**目标**：在 `dev/tests` 中为退出和封禁行为设计与实现逻辑级 UT，验证“Redis 会话 + 本地会话 + 登录入口”三个层面的状态一致性（在当前 Python 骨架中，重点覆盖 Redis 会话与登录入口）。

**工作拆分**：

1. 新建 `test_logout_cycle19_20.py`：
   - 测试 1：退出幂等性与会话删除：
     - 登录获得 guid 与会话；
     - 调用 LogoutService.logout(guid) 后，SessionStore 不再存在该 guid 记录；
     - 再次调用 logout 不抛异常；
     - 尝试刷新 Token，因 Session 缺失而返回 `ERR_REFRESH_EXPIRED`（验证“退出 = 全局退出”）。
   - 测试 2：封禁联动：
     - 登录获得 guid 与会话；
     - 调用 BanService.ban_by_phone(phone)；
     - 确认用户状态为 BANNED，会话被删除；
     - 再次登录同手机号触发 `ERR_USER_BANNED`（验证“封禁 = 立即失效”）。

2. 运行 Python UT 全量回归，确保新增测试通过且无回归：
   - 命令：`python -m unittest discover -s dev/tests -p "test_*.py"`。

**完成标准（DoD）**：

- 与 Cycle16～19 对应的核心逻辑均由单元测试覆盖；
- 测试结果可作为后续在 NestJS/React/壳层中实现退出与封禁时的行为基线。

---

## 三、迭代验收与退出条件

1. 功能层面：
   - 从 Python 骨架视角看，退出与封禁的行为与 PRD BR-07/BR-08 一致：
     - 用户主动退出后，再无有效会话可用于刷新或访问；
     - 用户被封禁后，即刻无法继续刷新或重新登录；
2. 测试层面：
   - 新增 UT 通过且与既有 26 条测试兼容；
   - 退出/封禁相关测试覆盖主要正常与异常分支；
3. 对生产栈的指导意义：
   - 本迭代 Python 实现可直接映射为 NestJS 的服务与控制器实现；
   - 前端与壳层退出逻辑在骨架层明确了职责边界，为后续工程化提供清晰蓝本。

满足以上条件后，可进入下一轮迭代（例如针对后台管理与活跃分析的 ADMIN-04 模块，Cycle21～29）。
