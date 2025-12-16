# Passport 统一认证中心 - Cycle16-20 专项审查未解决问题清单（v1.0）

> 依据文档：`code-review/cycle16-20-review.md`
> 说明：本清单仅列出 **截至本次修复仍未在代码中完全落地** 的问题；已在本轮实现的修复（如 C16-01/C17-02/C18-01/C19-01 等）不再重复。

---

## 1. Cycle16（前端退出交互）剩余问题

### C16-02：Python 前端骨架缺失

- **位置**：`dev/frontend/`（Python 前端 PoC 区域）
- **当前情况**：
  - React 前端 `dev/frontend-react` 已通过 `LogoutButton` 组件在 Home 与后台页面提供统一的退出入口，并调用 `/api/passport/logout` 清理后端会话与本地状态；
  - DoD 中提到的 `dev/frontend/logout/logout.js` 等 Python 前端骨架并不存在，本轮未新建该子工程，以避免重复建设前端栈。
- **后续目标**：
  - 若后续仍需要 Python 版前端 PoC，可在 `dev/frontend/` 下按 DoD 结构补齐最小可用的 logout 脚本，与现有后端 API 对接；
  - 或在文档层明确统一使用 React 前端作为唯一实现，关闭 Python 前端骨架需求。

### C20-01：前端退出行为的自动化测试

- **位置**：`dev/frontend-react/`
- **当前情况**：
  - 虽已实现 `LogoutButton` 并接入页面，但尚未为该组件和退出流程编写前端单元测试或 E2E 测试；
  - 无法自动验证在正常/异常（后端 5xx 等）情况下，本地状态清理与路由跳转行为是否始终符合预期。
- **后续目标**：
  - 引入 Vitest + jsdom/Testing Library，对 `LogoutButton` 进行单测，覆盖：
    - 成功退出：调用 `/passport/logout`，清理 localStorage 并跳转 `/login`；
    - 接口异常：仍然进行本地清理与跳转（try/finally 行为）；
  - 结合浏览器级 E2E（Playwright/Cypress）从 UI 层验证退出入口的可见性与行为。

---

## 2. Cycle17（壳层退出处理）剩余问题

### C17-01：与真实壳层工程的集成

- **位置**：`dev/shell/logout_handler.py` 以及目标壳层（Electron/C++/C# 等）工程。
- **当前情况**：
  - Python 版 `LogoutHandler` 已具备完整的退出决策逻辑（含 try/finally、本地清理与广播）并新增 API 失败时的 warning 日志；
  - 但实际桌面壳层尚未实现对应的集成代码（如与真实 HTTP 客户端和 IPC 机制的绑定）。
- **后续目标**：
  - 在目标壳层栈中实现等价逻辑：封装调用后端 `/passport/logout` 的 API、调用原生 LocalSession 删除接口、通过 IPC 将 `logged_out`/`banned` 状态通知前端；
  - 为真实壳层集成逻辑编写集成或端到端测试，验证在 API 失败、网络中断等异常情况下仍能保证本地清理和状态广播。

### C20-02：壳层-后端联调与完整退出链路测试

- **位置**：项目全局（壳层 + 后端 + 前端）。
- **当前情况**：
  - 目前仅有 Python 层面的 `LogoutHandler` UT 和后端退出/封禁的单元测试；
  - 缺少跨壳层-后端-前端的联调或 E2E 测试，无法自动验证“点击前端退出 → 壳层调用后端 → 会话删除 → 前端状态清理”的完整链路。
- **后续目标**：
  - 在 QA/E2E 测试中引入壳层模拟或实际客户端，编写覆盖退出/封禁场景的联调脚本；
  - 将这些测试纳入 CI，确保未来改动不会破坏退出链路。

---

## 3. Cycle18（原生模块会话删除）剩余问题

> 说明：C18-01 已通过在 `write_session_file` 中增加文件写入异常日志并重新抛出完成，本轮无额外未达成项。

---

## 4. Cycle19（后端会话销毁与封禁联动）剩余问题

### C19-02：NestJS BanService 与 Python 结构的一致性

- **位置**：`dev/backend-node/src/auth/`
- **当前情况**：
  - Python 栈中存在独立的 `BanService`，而 NestJS 通过 `AdminService.banUser/unbanUser` 直接完成用户状态更新与会话删除（`SessionStore.delete`），功能上已对齐 BR-07/BR-08；
  - 但从结构上仍与 Python 的“专门 BanService”存在差异，可能在后续演进（如多种封禁策略、审计扩展）时导致两栈职责分布不完全一致。
- **后续目标**：
  - 评估是否在 NestJS 中提取独立的 `BanService`，由 `AdminService` 调用，以与 Python 栈结构保持一致；
  - 或在设计文档中明确“AdminService 即 BanService 职责融合”的决策，并在后续演进中保持两栈行为一致。

---

> 说明：C19-01（按 GUID 退出）已通过在 `TokenService` 中新增 `logoutByGuid` 方法以及 `AdminController.POST /admin/users/:guid/logout` 管理端接口完成，QA 可据此扩展后台强制下线测试用例。
