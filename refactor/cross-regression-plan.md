## Passport 契约化跨端回归计划（草案）

目标：验证前端 / 壳层 / 后端在契约化后的核心场景行为一致，覆盖错误码与状态广播，减少串号/残留会话风险。

### 测试前准备
- 后端（Nest）启动，使用契约错误码/DTO；确保 Redis/DB 可用或使用内存替代。
- 前端 React 使用契约化客户端（api/auth.ts, client.ts 已对齐）。
- 壳层使用 `error_handling.py`，在 IPC/刷新/退出路径接线完成。
- 会话文件路径按 PRD：`C:\ProgramData\Passport\session.dat`；文件校验与 2 小时阈值逻辑可用。

### 覆盖场景
1) 登录/注册
   - 正常登录：返回 LoginResponse 契约字段；前端持久化；壳层刷新调度启动。
   - 封禁用户：返回 ERR_USER_BANNED → 前端清理会话并提示；壳层广播 banned。
   - 注销用户：同手机号生成新 GUID（C-01），前端/壳层会话更新。

2) 刷新
   - 正常刷新：Access 更新，Refresh 不变；多 app SSO 新增 app session。
   - Refresh 过期：ERR_REFRESH_EXPIRED → 前端/壳层清理并回登录。
   - Refresh 不匹配：ERR_REFRESH_MISMATCH → 同上。
   - 会话不存在：ERR_SESSION_NOT_FOUND → 同上。

3) Access 校验
   - Access 过期/invalid：ERR_ACCESS_EXPIRED/ERR_ACCESS_INVALID → 触发刷新或最终登出。
   - app_id 不匹配：ERR_APP_ID_MISMATCH → 前端提示/壳层广播 app_mismatch，不清理会话。

4) 本地文件与启动
   - 正常文件：启动广播 sso_available。
   - 文件损坏：ERR_SESSION_CORRUPTED → 删除文件，广播 none。
   - 2 小时阈值：超时文件强制删除，广播 none。
   - 文件缺失：ERR_SESSION_NOT_FOUND → 广播 none。

5) 频控与内部错误
   - ERR_CODE_TOO_FREQUENT：前端提示“稍后再试”；壳层广播 rate_limited（若接入）。
   - ERR_INTERNAL：前端/壳层提示稍后重试，不清理会话。

6) 退出/封禁
   - 主动退出：全局退出，Redis 会话删除，本地文件清理，前端/壳层回登录。
   - 封禁后刷新/校验：收到 ERR_USER_BANNED，前端/壳层清理并广播 banned。

### 验证要点
- 错误码来源字段兼容 `code`/`error_code`，前端/壳层均能正确处理。
- 广播事件名与前端订阅一致（如 sessionStatus）。
- 会话文件删除/清理后，不再能自动登录；刷新调度停止。
- 多 app SSO：刷新在新 app 下创建独立 Access，但共用 Refresh。

### 产出
- 回归执行记录（通过/失败 & 截图/日志）。
- 若有偏差，回填 PRD/契约/实现/测试用例，保持单一事实源一致。
