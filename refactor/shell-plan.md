## 壳层开发元计划（契约对齐版）

目标：在无现有壳层代码的情况下，从零规划可落地的壳层实现，确保与 PRD/契约一致，便于逐步开发与测试。

### 1. 范围与目标
- 平台：Windows 壳层（Electron/CEF/WebView2 均可，语言可选 TS/Node 或 Python + IPC）。
- 功能主线：
  1) 启动读取本地会话文件（DPAPI 加密 JSON），校验并广播 SSO 状态；
  2) 刷新调度（3h + 抖动，失败重试 2 次，失败则回登录）；
  3) 退出/封禁处理：全局退出，清理本地文件/内存，会话广播；
  4) 错误码处理与前端一致；
  5) 本地文件 2 小时阈值清理，损坏/缺失时回登录；
  6) IPC 与前端事件对齐（sessionStatus 等）。

### 2. 契约基线
- 错误码：`refactor/contracts/errors-and-flows.md`、Nest `AuthErrorCode`；壳层错误处理复用 `error_handling.py`。
- DTO：`LoginResponse` / `RefreshTokenResponse` 字段与 `refactor/contracts/dto-types.md` 一致。
- 本地文件：`C:\ProgramData\Passport\session.dat`，字段/校验按 PRD BR-06 与 2 小时阈值。

### 3. 组件拆分
1) HTTP 客户端层：统一附带 `app_id`，处理错误码 -> 调用壳层错误处理。
2) SessionFileManager：读/写/删 `session.dat`，DPAPI 加解密占位可先用明文 + 权限控制；校验必填字段与时间；提供 ERR_SESSION_CORRUPTED/NOT_FOUND。
3) StartupHandler：读取文件 -> 校验 -> 广播 `sso_available`/`none`，超阈值/损坏删除文件。
4) RefreshScheduler：调度刷新（现有 `refresh_scheduler.py` 可复用）；失败重试 2 次，超限触发 logout。
5) AuthController（壳层侧封装）：login/refresh/logout API 调用封装；错误码 -> `error_handling`；成功时更新文件/内存并重启调度。
6) LogoutHandler：调用后端 logout，删除文件/内存，广播 `none`；封禁/错误码时可直接调用。
7) IPC/事件总线：暴露 `sessionStatus` 广播（none/active/sso_available/banned/rate_limited/app_mismatch）；接收前端指令（login/logout/refresh 请求触发器）。

### 4. 开发分阶段
- Phase 1（最小可用）
  - 实现 SessionFileManager（可先明文，留 DPAPI 钩子）；StartupHandler；LogoutHandler；RefreshScheduler；HTTP 简单封装；错误处理接线。
  - 手工/脚本驱动的集成验证（无 UI）。
- Phase 2（IPC + 前端联调）
  - 加入 IPC/事件总线；对接前端 sessionStatus；前端调用壳层 API 完成登录/刷新/退出链路。
  - 完善 DPAPI、文件权限、日志。
- Phase 3（稳健性与监控）
  - 边界测试：文件损坏/缺失、刷新失败、封禁、频控、内部错误。
  - 增加 metrics/日志钩子（可选）。

### 5. 测试计划
- 单测：
  - error_handling（已建）
  - SessionFileManager：校验、2h 阈值、损坏/缺失返回；
  - RefreshScheduler：调度/重试/停机逻辑；
  - StartupHandler：文件状态 -> 广播；
  - AuthController 封装：错误码路由、会话持久化。
- 集成/回归：
  - 参考 `refactor/cross-regression-plan.md` 场景，模拟后端响应（可用 stub server 或 mock）。

### 6. 参考与现有资产
- 错误处理：`dev/shell/error_handling.py` + `logout_handler.py` + `sso_startup.py` + `refresh_scheduler.py`。
- 前端错误处理对齐：`dev/frontend-react/src/api/client.ts`，可作为行为参考。
- 回归草单：`refactor/cross-regression-plan.md`。

### 7. 下一步行动（可执行）
1) 实现 SessionFileManager（含校验/2h 阈值，DPAPI 钩子预留）。
2) 实现 HTTP 封装 + AuthController（login/refresh/logout）复用 error_handling。
3) 将 StartupHandler/LogoutHandler/RefreshScheduler 与上两点接线，形成可调用 API（无 IPC 也可先用函数调用）。
4) 补单测：文件管理、刷新、启动、Auth 封装。
5) 依据回归草单做 stub 集成测试；完成后再接 IPC/前端联调。
