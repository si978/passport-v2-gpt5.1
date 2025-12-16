## Passport 重构随身卡（本地持续更新）

> 用途：在本地快速回顾当前重构阶段、已完成事项、下一步行动和测试基线，不依赖聊天记录。

### 0. 位置与约定
- 契约源：`refactor/contracts`（错误码、DTO、流程要点）。
- 参考实现：`refactor/backend`（Python 领域/用例镜像）。
- 目标：让 Nest 后端、前端/壳层行为与契约一致，测试可回归。
- 更新规则：每完成/开始一组工作就修改本文件，保持小而快。

### 1. 当前阶段
- 聚焦：契约收敛 → Nest 契约落地与测试 → Python 补码 → 前端/壳层错误处理层。
- 角色：以 Python 参考实现为业务真相源（行为/错误码），以 `contracts` 为跨语言契约。

### 2. 已完成（近期关键）
- 契约文档：`errors-and-flows.md`, `dto-types.md`, `nest-alignment.md` 草案齐备。
- Python 参考实现：`refactor/backend` 落地领域/用例，镜像测试通过。
- 决策背景：见根目录 `refactor-plan.md`（阶段一聚焦后端 Python）。
 - Nest 契约文件已落地：`dev/backend-node/src/contracts/contracts.ts` + README。
- Nest 契约回归已通过：`npm test -- --runInBand --silent`（19/19）。
- Python 错误码契约 PoC 测试已补：`python -m pytest refactor/backend/tests/test_error_codes_poC.py -q`。
- 壳层错误码处理 PoC 测试已补：`python -m pytest dev/shell -q`（3/3）。
- 壳层 README 补充：`dev/shell/README.md` 说明集成点与待接线事项。
- 跨端回归草单：`refactor/cross-regression-plan.md`（场景/要点已列出）。
- 壳层接线占位：`dev/shell/integration_stub.py` 演示如何接入 IPC/HTTP 回调；真实实现需替换 `_logout`/`_broadcast`。
- 壳层开发元计划：`refactor/shell-plan.md`（从零搭建壳层的分阶段方案）。
- 壳层 stub 后端：`dev/shell/stub_backend.py` 可模拟错误码/成功响应（用于集成自测）。
- 壳层集成回归（stub）：`python -m pytest dev/shell -q` 包含入口/Auth/文件/错误处理/集成测试共 20/20 通过（覆盖封禁/刷新过期/会话缺失/频控/app mismatch/文件阈值等）。
- 壳层 IPC 设计占位：`dev/shell/ipc_design.md` 给出事件总线/指令/广播方案，待替换实际 IPC。
- Electron IPC 绑定示例：`dev/shell/ipc_electron_binding.ts`（主进程 handle/login/refresh/logout + sessionStatus 广播示例）。

### 3. 进行中
- 前端：错误码处理/DTO 已契约化，前端测试通过。
- 壳层：错误处理模块 + 单测已落地，待接入实际壳层 IPC/刷新/退出流程。

> 提醒（自驱动约束）：
> - 不依赖会话记忆，关键进展写入本文件。
> - 自行定计划、执行、记录、验证。
> - 前端/壳层对齐完成后，更新测试与回归计划。

### 4. 下一步（短周期可执行）
1) IPC/前端联调：基于 `shell_entry` 接入事件总线，替换 `_broadcast`/`logout` 占位，保持 sessionStatus 事件契约。
2) 安全与稳健性：DPAPI 加解密、文件权限、日志/监控（Phase 3）。
3) 若需要真实后端联调，按 `refactor/cross-regression-plan.md` 在非 stub 环境跑回归。

### 8. 当前推进状态（自动记录）
- IPC：已具备 `ipc_adapter.py` + Electron 示例（`dev/shell/ipc_electron_binding.ts`、`dev/shell/ipc_electron_bind_sender_patch.md`），待接入真实宿主工程。
- 回归：stub 集成回归全绿；真实后端回归脚本占位 `dev/shell/real_backend_regress.py` 已具备登录/刷新/退出/封禁/频控占位场景。
- 安全：SessionFileManager 已支持 encoder/decoder；DPAPI adapter 存在且在无 pywin32/非 Windows 时安全回退。
- 2025-12-15：修正契约细节偏差（GUID 仅数字、无验证码记录→`ERR_PHONE_INVALID`、`expires_in` 设为可选）；前端补齐 Access 过期自动刷新+重放，并修正封禁在登录页的提示；补齐短信/壳层验收脚本（`npm run smoke:sms`、`npm run demo:shell`）与 IPC `get_session`；`npm test`（check:all）全绿。

### 5. 跨端回归场景草单（待落地）
- 登录/注册：成功、封禁（ERR_USER_BANNED）、注销用户新 GUID。
- 刷新：正常、refresh 过期/不匹配（→ logout）、session not found（→ logout）。
- Access 校验：过期/invalid（→ refresh/再 logout）、app_id mismatch。
- 本地文件：ERR_SESSION_CORRUPTED/NOT_FOUND + 2 小时阈值清理广播。
- 频控：ERR_CODE_TOO_FREQUENT → 前端提示/壳层广播 rate_limited。
- 内部错误：ERR_INTERNAL → 不清理会话，提示稍后再试。

### 5. 前端/壳层契约化草案（执行提要）
- 错误码来源：`refactor/contracts/errors-and-flows.md` + Nest 契约枚举。
- 处理策略：
  - `ERR_REFRESH_EXPIRED` / `ERR_REFRESH_MISMATCH` / `ERR_SESSION_NOT_FOUND` → 清理本地会话+跳转登录。
  - `ERR_ACCESS_EXPIRED` → 尝试刷新，失败则按上条处理。
  - `ERR_USER_BANNED` → 清理本地会话、显示封禁文案、禁止自动重试。
  - `ERR_CODE_TOO_FREQUENT` → 按按钮倒计时/灰显，提示稍后再试。
  - `ERR_INTERNAL` → “系统繁忙，请稍后再试”，不清理会话。
- DTO 消费：沿用契约 `LoginResponse` / `RefreshTokenResponse` / `ErrorResponse`，统一字段命名。
- 壳层：保持 2 小时阈值删除 `session.dat`，文件错误码与后端错误码策略一致；广播退出/封禁状态。

### 5. 待排期 / Backlog
- Nest：引入契约文件到仓库（可能放 `src/contracts/`）。
- Python：Access Token 校验实现向 Nest 靠拢；频控实现或桩。
- 前端：把现有零散错误处理迁移到统一层；DTO/字段命名对齐。
- 壳层：广播/清理逻辑与后端错误码联动的集成用例。

### 6. 测试基线（随做随记）
- 已跑：`python -m pytest dev/tests/test_auth_cycle1_2.py -q`；`python -m pytest dev/tests/test_sso_startup_cycle12_15.py -q`。
- 待补：Nest 契约回归（登录/刷新/封禁/退出/ACCESS 校验/SESSION_NOT_FOUND/频控/内部错误）。

### 7. 快捷索引
- PRD SSoT：`passport-统一认证中心-PRD-草稿.md`
- 决策索引：Q 文档 / C 文档（根目录）。
- 开发入口：`passport-统一认证中心-会话关键内容整理-开发入口.md`
- 重构总览：`refactor-plan.md`

> 更新本文件时保持简短，优先记录“现在在做什么/下一个动作”，避免堆砌细节。
