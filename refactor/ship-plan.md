## 从当前状态到真实联调/上线的开发计划

### 当前基线
- 后端：Nest 契约化测试通过；Python 错误码 PoC 完成。
- 前端：错误码/DTO 契约化，测试通过。
- 壳层（无 IPC）：核心能力 + stub 集成回归 24/24 通过（封禁、刷新异常、会话缺失、频控、app mismatch、文件阈值等）。
- 文档：`refactor-tracker.md`、`shell-plan.md`、`ipc_design.md`、`ipc_electron_example.md`、`cross-regression-plan.md` 已就绪。

### 待办与顺序（可执行路线）
1) IPC 实装与前端联调
   - 按目标平台（默认 Electron；如改 WebView2 需调整）替换 `ipc_adapter` sender：sessionStatus 广播，指令 login/refresh/logout。
   - 在主进程注册指令，渲染侧监听 `sessionStatus`（参考 `ipc_electron_example.md`）。
   - 接入后跑端到端闭环（前端 → 壳层 → 后端 → 壳层 → 前端）。
   - 参考代码：
     - 主进程：`dev/shell/ipc_electron_binding.ts`
     - 渲染进程：`dev/shell/ipc_electron_renderer_example.ts`
   - 闭环接线清单：`dev/shell/ipc_electron_e2e_checklist.md`

2) 真实后端回归
   - 在真实环境按 `cross-regression-plan.md` 跑：登录/封禁/注销新 GUID；刷新过期/不匹配/会话缺失；Access 校验过期/invalid/app mismatch；文件损坏/2h 阈值；频控；内部错误；退出/封禁；多 app SSO。
   - 校验错误码字段兼容 `code`/`error_code`，网络/超时行为符合预期。

3) 安全与稳健性
   - DPAPI 加解密 session.dat，文件权限加固。
   - 日志/监控钩子：登录/刷新/退出/封禁/文件损坏/频控/内部错误。
   - 配置审查：路径、超时、重试、app_id 校验。

4) 部署与运行时
   - 确认壳层与前端打包/更新方式；健康检查（可复用 /health 思路）。

### 近期可直接执行的任务
- 实现 Electron IPC 适配：替换 `ipc_adapter.bind_sender`，主进程注册指令，sessionStatus 广播到前端；验证闭环。（示例：`dev/shell/ipc_electron_binding.ts`，支持 env 覆盖 baseUrl/appId）。
- 跑 stub → 真实后端回归脚本（保留 stub 以快速回归）。
- 引入 DPAPI 钩子到 SessionFileManager（已预留，当前非 Win/无 pywin32 自动回退明文）。

> 备注：保持 `refactor-tracker.md` 与 TODO 同步，确保每一阶段完成后更新记录。
