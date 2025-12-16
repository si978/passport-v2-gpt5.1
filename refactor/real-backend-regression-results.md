## 真实后端回归执行记录（模板）

> 用途：执行 `refactor/real-backend-regression.md` 后，把结果记录在这里，便于回溯与追责。

### 环境信息
- 日期：
- 后端地址（PASSPORT_BASE_URL）：
- app_id（PASSPORT_APP_ID）：
- 前端版本/构建信息：
- 壳层版本/构建信息：
- Windows 版本/用户类型：
- Redis/DB 状态：

### 执行工具
- 驱动脚本：`dev/shell/real_backend_regress.py`
- 回归草单：`refactor/cross-regression-plan.md`

### 结果总览
- 通过：
- 失败：
- 阻塞：
- 结论：

---

## 场景记录

### 1) 登录/注册
- 登录成功：
  - 预期：sessionStatus=active；返回契约字段齐全
  - 实际：
  - 结论：PASS/FAIL
  - 证据：日志/截图/trace_id

- 封禁用户（ERR_USER_BANNED）：
  - 预期：sessionStatus=banned；前端回登录；本地会话清理
  - 实际：
  - 结论：PASS/FAIL

- 注销用户重新登录生成新 GUID（C-01）：
  - 预期：同手机号新 GUID；旧记录保留
  - 实际：
  - 结论：PASS/FAIL

### 2) 刷新
- 正常刷新：
  - 预期：access 更新，refresh 不变，多 app SSO 生效
  - 实际：
  - 结论：PASS/FAIL

- ERR_REFRESH_EXPIRED / ERR_REFRESH_MISMATCH / ERR_SESSION_NOT_FOUND：
  - 预期：sessionStatus=none；强制回登录
  - 实际：
  - 结论：PASS/FAIL

### 3) Access 校验
- ERR_ACCESS_EXPIRED/INVALID：
  - 预期：先刷新，失败则回登录
  - 实际：
  - 结论：PASS/FAIL

- ERR_APP_ID_MISMATCH：
  - 预期：提示 app_mismatch；不清理会话
  - 实际：
  - 结论：PASS/FAIL

### 4) 本地文件与启动
- 正常文件：
  - 预期：启动广播 sso_available
  - 实际：
  - 结论：PASS/FAIL

- 文件损坏/缺失/2h 阈值：
  - 预期：删除并广播 none
  - 实际：
  - 结论：PASS/FAIL

### 5) 频控与内部错误
- ERR_CODE_TOO_FREQUENT：
  - 预期：前端提示；壳层广播 rate_limited
  - 实际：
  - 结论：PASS/FAIL

- ERR_INTERNAL：
  - 预期：提示稍后再试；不清理会话
  - 实际：
  - 结论：PASS/FAIL

### 6) 退出/封禁
- 主动退出：
  - 预期：全局退出；本地清理；其它客户端需重新登录
  - 实际：
  - 结论：PASS/FAIL

- 封禁后刷新/校验：
  - 预期：ERR_USER_BANNED；清理并广播 banned
  - 实际：
  - 结论：PASS/FAIL

---

## 问题清单与修复建议
- 问题 1：
  - 影响：
  - 复现步骤：
  - 预期/实际：
  - 建议修复：

## 回填动作
- 是否需要更新契约文档（errors-and-flows/dto-types）：
- 是否需要更新实现（前端/壳层/后端）：
- 是否需要补测试（单测/集成/e2e）：
