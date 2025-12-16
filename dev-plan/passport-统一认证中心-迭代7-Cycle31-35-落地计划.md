# Passport 统一认证中心 - 迭代 7 落地计划（Cycle31–35）

> 目标：在 AUTH/SESS/ADMIN 核心能力已通过 PoC 与生产栈骨架验证的基础上，为 **ADMIN-04 后台管理模块** 补齐 NestJS 后端接口与 React 前端闭环：实现后台用户查询 + 封禁/解封 + 活跃明细查询的最小可用链路，并保持现有 Python PoC 作为行为基线。

关联文档与基线实现：

- 需求/设计：`passport-统一认证中心-PRD-草稿.md`（US-05/BR-08/DM-01/DM-04）、`passport-统一认证中心-技术方案与架构设计.md`；
- 总开发计划：`dev-plan/passport-统一认证中心-开发计划.md`（ADMIN-04 模块，Cycle24～29）；
- 已有实现：
  - Python：`UserQueryService` + `BanService` + `LoginLogService`（PoC，Cycle25/28/29）；
  - NestJS：认证主链路（登录/刷新/验证/退出）与 Metrics PoC（Cycle1–30）；
  - React：`UserListPage` 与 `UserActivityPage` 骨架页面（Cycle24/27）。

本迭代补齐 **Cycle31–35**：

- **Cycle31** = [ADMIN-04][US-05][FL-06][BE] — NestJS 后台用户查询接口 `/api/admin/users`；
- **Cycle32** = [ADMIN-04][US-05][FL-06][BE] — NestJS 后台封禁/解封接口 `/api/admin/users/:guid/(ban|unban)`；
- **Cycle33** = [ADMIN-04][US-05][FL-06][QA] — AdminService/AdminController 的 Jest 单元测试；
- **Cycle34** = [ADMIN-04][US-05][FL-06][FE] — React 用户列表页接入真实后端 API，增加封禁/解封操作；
- **Cycle35** = [ADMIN-04][US-05][FL-07][BE/FE] — 后台活跃明细 `/api/admin/activity` 接口 PoC + 前端接入校验。

---

## 一、Cycle31 — 后台用户查询接口（NestJS BE）

**目标**：在 NestJS 后端实现基础的后台用户查询接口 `/api/admin/users`，支持按状态（ACTIVE/BANNED/DELETED）筛选，并返回精简字段，为 React 用户列表页提供真实数据源。

**实现要点（dev/backend-node）**：

1. 新增 `AdminService`：
   - 位置：`src/auth/admin.service.ts`；
   - 依赖：`InjectRepository(User)` 与 `SessionStore`；
   - 方法：
     - `listUsers(status?: number): Promise<User[]>`：
       - 无 status → 返回所有用户，按 `createdAt ASC, phone ASC` 排序；
       - 有 status → 按 status 过滤（1=ACTIVE, 0=BANNED, -1=DELETED）。
2. 新增 `AdminController`：
   - 位置：`src/auth/admin.controller.ts`；
   - 路由前缀：`@Controller('admin')`；
   - 接口：
     - `GET /admin/users?status=ACTIVE|BANNED|DELETED`：
       - 将状态字符串映射为数值；
       - 调用 `AdminService.listUsers`；
       - 返回形如 `{ users: [{ guid, phone, status: 'ACTIVE'|'BANNED'|'DELETED', account_source }] }` 的结构。
3. `AuthModule` 中注册：将 `AdminService` 加入 `providers`，`AdminController` 加入 `controllers`。

**DoD**：

- `GET /api/admin/users` 能被前端成功调用，返回 JSON 数组；
- 对 `status` 查询参数的映射与前端枚举（ACTIVE/BANNED/DELETED）一致；
- 不引入实际 DB/Redis 依赖到 Jest UT（通过 mock/stub 实现）。

---

## 二、Cycle32 — 后台封禁/解封接口（NestJS BE）

**目标**：在 NestJS 中实现最小可用的后台封禁/解封接口，与 Python `BanService` 行为对齐：封禁时更新 User.status 并删除会话，解封时仅更新状态。

**实现要点（dev/backend-node）**：

1. 在 `AdminService` 中补充：
   - `banUser(guid: string): Promise<void>`：
     - 查找用户，不存在则静默返回；
     - 将 `status` 设为 0（BANNED），保存；
     - 调用 `SessionStore.delete(guid)` 删除会话，实现“封禁 = 立即失效”。
   - `unbanUser(guid: string): Promise<void>`：
     - 查找用户，不存在则静默返回；
     - 将 `status` 设为 1（ACTIVE），保存。
2. 在 `AdminController` 中补充：
   - `POST /admin/users/:guid/ban` → 调用 `banUser`，返回 `{ success: true }`；
   - `POST /admin/users/:guid/unban` → 调用 `unbanUser`，返回 `{ success: true }`。

**DoD**：

- 行为与 Python `BanService` 语义保持一致（静默处理不存在的用户，封禁时删除会话）；
- 后续可由前端页面通过按钮触发封禁/解封操作。

---

## 三、Cycle33 — AdminService/AdminController Jest UT（QA）

**目标**：为 AdminService 与 AdminController 编写 Jest 单元测试，验证后台用户查询与封禁/解封行为与 PoC 保持一致，并确保控制器的路由参数解析正确。

**实现要点**：

1. `admin.service.spec.ts`：
   - 使用内存版 `InMemoryUserRepo` 与 `FakeSessionStore`，直接 `new AdminService(...)`；
   - 覆盖：
     - `listUsers()` 返回预置用户集合，并能按 status 过滤；
     - `banUser` 会将用户状态置为 BANNED，调用 `session.delete`；
     - `unbanUser` 恢复为 ACTIVE。
2. `admin.controller.spec.ts`：
   - 使用 `@nestjs/testing` 构建 `TestingModule`，注入 mock `AdminService`；
   - 覆盖：
     - `GET /admin/users` 对 `status` 查询参数的解析与返回结构；
     - `POST /admin/users/:guid/ban` / `unban` 对 `AdminService` 调用参数的正确性；
     - `GET /admin/activity` 能调用 `listActivity` 并返回 `{ activities }` 包装结果。

**DoD**：

- `npm test` 全部通过，Admin 相关 UT 覆盖主要分支；
- 覆盖率报告中 Admin 相关文件的语句/函数覆盖率达到预期（>80%）。

---

## 四、Cycle34 — React 后台用户列表接入真实 API（FE）

**目标**：将 `UserListPage` 与 NestJS Admin 接口打通，实现状态筛选 + 封禁/解封操作的最小可用前端交互。

**实现要点（dev/frontend-react）**：

1. 更新 `UserListPage.tsx`：
   - 接收后端返回的 `status: 'ACTIVE'|'BANNED'|'DELETED'` 与 `account_source` 字段；
   - 在表格中为每行用户增加“封禁/解封”按钮：
     - 当 status=ACTIVE → 显示“封禁”，调用 `POST /api/admin/users/:guid/ban`；
     - 当 status=BANNED → 显示“解封”，调用 `POST /api/admin/users/:guid/unban`；
   - 操作成功后刷新列表（重新请求 `/admin/users`）。
2. 处理错误：暂以 `console.error` + 简单 alert 为主，不强制实现完整错误码映射。

**DoD**：

- 在本地运行 NestJS + React 时，后台用户列表页面能完成：加载列表、按状态筛选、封禁/解封并看到状态变化；
- `npm run build` 通过。

---

## 五、Cycle35 — 后台活跃明细接口 PoC + 前端接入（BE/FE）

**目标**：为 `UserActivityPage` 提供最小可用的 `/api/admin/activity` 接口 PoC，使前端能成功展示来自后端的活跃记录列表（即便初期为内存数据或空结果），与 Python LoginLog 行为保持基本一致。

**实现要点**：

1. 在 `AdminService` 中增加 `listActivity()` 方法：
   - 当前迭代可返回空数组或简单内存列表；
   - 为未来接入真实 LoginLog 表/服务预留接口。
2. 在 `AdminController` 中新增：
   - `GET /admin/activity`：调用 `AdminService.listActivity()`，返回 `{ activities }`；
3. 确认 `UserActivityPage`：
   - 继续调用 `/admin/activity` 并展示 `activities` 数组；
   - 至少能正确渲染后端返回的字段（guid/phone/login_at/logout_at/channel/ip）。

**DoD**：

- `GET /api/admin/activity` 存在且返回 JSON 对象 `{ activities: [...] }`；
- React `UserActivityPage` 能在构建后正常加载并展示返回结果；
- 不强制在本迭代内实现完整 LoginLog 落库逻辑（由后续迭代负责）。

---

## 六、迭代 7 验收条件

1. 后端（NestJS）：
   - `/api/admin/users` 与 `/api/admin/users/:guid/(ban|unban)`、`/api/admin/activity` 均可被调用并返回预期结构；
   - `npm test -- --coverage` 通过，Admin 相关文件的覆盖率达到预期；
2. 前端（React）：
   - `UserListPage` 与 `UserActivityPage` 成功接入后端 API，`npm run build` 通过；
3. Python PoC：
   - 现有 UT（含 UserQueryService 与 LoginLogService）保持全部通过，继续作为行为基线。

满足以上条件后，可在后续迭代中继续补齐：真实 LoginLog 落库 / 权限控制 / 监控与日志平台接入等工作。
