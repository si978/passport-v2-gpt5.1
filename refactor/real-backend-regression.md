## 真实后端回归执行指南（契约对齐版）

目标：在接入真实后端环境时，快速按契约场景完成回归验证。

### 准备
- 设置环境变量（示例）：
  - `PASSPORT_BASE_URL=https://passport.example.com`（或实际地址）
  - `PASSPORT_APP_ID=jiuweihu`（或实际接入 appId）
- 前端/壳层均使用契约化客户端（已对齐）。
- 若用 Python 壳层：ShellApp base_url/app_id 读取上述配置；IPC sender 已绑定。
- 真实短信网关验收（后端已启动前提）：`npm run smoke:sms`（脚本：`dev/backend-node/scripts/sms_login_smoke.js`）。

### 推荐回归步骤（对应 cross-regression-plan.md）
1) 登录/注册
   - 正常登录：应返回契约字段；sessionStatus=active。
   - 封禁用户：ERR_USER_BANNED → sessionStatus=banned，前端回登录。
   - 注销用户：同手机号生成新 GUID（需检查 DB/日志）。

2) 刷新
   - 正常刷新：Access 更新，Refresh 不变，多 app SSO 生效。
   - ERR_REFRESH_EXPIRED / ERR_REFRESH_MISMATCH / ERR_SESSION_NOT_FOUND → sessionStatus=none，需重新登录。

3) Access 校验
   - ERR_ACCESS_EXPIRED/INVALID：触发刷新或最终登出。
   - ERR_APP_ID_MISMATCH：提示/状态 app_mismatch，不清理会话。

4) 本地文件与启动
   - 正常文件：启动广播 sso_available。
   - 文件损坏/缺失/2h 阈值：删除并广播 none。

5) 频控与内部错误
   - ERR_CODE_TOO_FREQUENT：前端提示/壳层广播 rate_limited。
   - ERR_INTERNAL：提示稍后再试，不清理会话。

6) 退出/封禁
   - 主动退出：全局清理，会话失效。
   - 封禁后调用刷新/校验：ERR_USER_BANNED → 清理并广播 banned。

### 记录与回填
- 执行结果（通过/失败、日志/截图）记录到 tracker；若发现偏差，更新 PRD/契约/实现/测试用例。
- 如有错误码字段差异（code/error_code），调整前端/壳层兼容逻辑。

### 快速执行建议
- 可复用 `dev/shell/e2e_regression_stub.py` 流程，改 base_url 后手动驱动核心场景。
- IPC 联调快速跑（默认带 stub 后端）：`npm run demo:shell`（脚本：`dev/shell/ipc_stdio_demo.js`）。
- 若后端有鉴权/环境隔离，请确保 appId 与调用源受信。 
