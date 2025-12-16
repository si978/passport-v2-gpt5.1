# Passport 统一认证中心 - Cycle1-5 专项审查报告

> 审查日期：2025-12-03  
> 审查范围：Cycle1-5（AUTH-01 模块 FL-01/FL-02）

---

## 一、Cycle 范围回顾

| Cycle | 标识 | 目标 | 角色 |
|-------|------|------|------|
| Cycle1 | [AUTH-01][US-01][FL-01][FE] | 登录页前端 | 前端 |
| Cycle2 | [AUTH-01][US-01][FL-01][BE] | 登录后端接口 | 后端 |
| Cycle3 | [AUTH-01][US-01][FL-01][QA] | 登录E2E测试 | QA |
| Cycle4 | [AUTH-01][US-01][FL-02][FE] | 刷新状态管理 | 前端 |
| Cycle5 | [AUTH-01][US-01][FL-02][SH] | 壳层刷新调度 | 壳层 |

---

## 二、Cycle1 审查 — [AUTH-01][US-01][FL-01][FE]

### 2.1 DoD 对照检查

| DoD 要求 | 状态 | 说明 |
|----------|------|------|
| 登录页面骨架（手机号/验证码/协议/按钮） | ✅ 达成 | `LoginPage.tsx` 包含所有元素 |
| 手机号格式校验（BR-09 正则） | ✅ 达成 | `isValidPhone` 使用 `^1[3-9][0-9]{9}$` |
| 验证码长度校验 | ✅ 达成 | 校验 6 位数字 |
| 调用 API-01 send-code | ✅ 达成 | `sendCode(phone)` |
| 调用 API-02 login-by-phone | ✅ 达成 | `loginByPhone(phone, code, appId)` |
| 60秒倒计时 | ✅ 达成 | `setCooldown(60)` + `setInterval` |
| 错误码处理 ERR_CODE_TOO_FREQUENT | ✅ 达成 | 显示"验证码发送过于频繁" |
| 错误码处理 ERR_CODE_INVALID/EXPIRED | ⚠️ 部分 | 仅显示 error_code 原文，无友好提示 |
| 错误码处理 ERR_USER_BANNED | ⚠️ 部分 | 仅显示 error_code 原文 |
| 前端状态管理（全局 AuthState） | ❌ 未达成 | 使用 localStorage，无全局状态管理 |
| 登录成功跳转主页 | ✅ 达成 | `window.location.href = '/'` |
| 前端单元测试 | ❌ 未达成 | 无任何 `.test.tsx` 文件 |

### 2.2 问题清单

#### C1-01：错误码缺少友好提示文案

- **位置**：`LoginPage.tsx:60`
- **问题**：登录失败时直接显示 `error_code`（如 `ERR_USER_BANNED`），用户体验差
- **DoD 要求**：根据错误码展示对应文案
- **建议**：添加错误码到中文映射
  ```typescript
  const ERROR_MESSAGES: Record<string, string> = {
    ERR_CODE_INVALID: '验证码错误，请重新输入',
    ERR_CODE_EXPIRED: '验证码已过期，请重新获取',
    ERR_USER_BANNED: '账号已被封禁，请联系客服',
  };
  ```

#### C1-02：未使用全局状态管理

- **位置**：`LoginPage.tsx:56-58`
- **问题**：直接使用 `localStorage` 存储 Token，未定义全局 `AuthState`
- **DoD 要求**：定义全局 AuthState（如 `{guid, accessToken, refreshToken, userStatus, appId}`）
- **影响**：
  - 其他组件无法响应式获取登录状态
  - Token 更新时无法自动触发 UI 更新
- **建议**：使用 React Context 或 Zustand 管理全局认证状态

#### C1-03：缺少前端单元测试（TDD）

- **位置**：`frontend-react/src/`
- **问题**：无任何测试文件
- **DoD 要求**：为关键逻辑编写前端单测（手机号校验、倒计时行为、错误码处理）
- **建议**：使用 Vitest + React Testing Library 添加测试

#### C1-04：ERR_PHONE_INVALID 未处理

- **位置**：`LoginPage.tsx:36-40`
- **问题**：发送验证码失败时，仅处理 `ERR_CODE_TOO_FREQUENT`，未处理 `ERR_PHONE_INVALID`
- **DoD 要求**：错误码 `ERR_PHONE_INVALID` 显示对应文案
- **建议**：
  ```typescript
  if (code === 'ERR_PHONE_INVALID') {
    setMessage('手机号格式不正确');
  }
  ```

---

## 三、Cycle2 审查 — [AUTH-01][US-01][FL-01][BE]

### 3.1 DoD 对照检查

| DoD 要求 | 状态 | 说明 |
|----------|------|------|
| API 请求体 { phone, code, app_id } | ✅ 达成 | `LoginByPhoneDto` |
| 响应体包含 guid/access_token/refresh_token/user_status/account_source | ✅ 达成 | `LoginResponseDto` |
| 已有用户登录（status=1） | ✅ 达成 | 直接签发 Token |
| 新用户注册（手机号不存在） | ✅ 达成 | 创建用户 + GUID |
| 封禁用户（status=0）→ ERR_USER_BANNED | ✅ 达成 | 抛出 AuthException |
| 注销用户（status=-1）→ 新建用户新 GUID | ✅ 达成 | 符合 C-01 决策 |
| GUID 生成规则（BR-01：20位） | ✅ 达成 | 日期8位+类型2位+随机10位 |
| 验证码校验（BR-09） | ✅ 达成 | VerificationCodeService |
| Session 写入 Redis | ✅ 达成 | SessionStore.put() |
| 错误码使用 PRD 13.1/13.2 定义值 | ✅ 达成 | AuthErrorCode 枚举 |
| 单元测试全部通过 | ✅ 达成 | auth.service.spec.ts 通过 |
| 登录日志记录 | ✅ 达成 | LoginLogService.recordLogin() |

### 3.2 问题清单

#### C2-01：响应缺少 expires_in 字段

- **位置**：`auth.service.ts` 返回值
- **问题**：DoD 要求响应包含 `expires_in`，但实际返回 `access_token_expires_at` / `refresh_token_expires_at`
- **DoD 原文**：`{ guid, access_token, refresh_token, user_status, account_source, expires_in }`
- **建议**：添加 `expires_in: 14400`（秒数）或确认 DoD 与实现对齐

#### C2-02：注销用户登录未保留历史记录

- **位置**：`auth.service.ts:53-57`
- **问题**：C-01 决策要求"旧记录保留用于审计与统计"，但当前实现直接修改原用户记录
- **PRD 依据**：C-01 方案 A - 旧记录保留为审计/统计
- **当前实现**：
  ```typescript
  user.guid = guid;  // 直接覆盖原 GUID
  user.status = 1;
  await this.users.save(user);  // 覆盖原记录
  ```
- **建议**：创建新用户记录，保留原 `status=-1` 记录不变

#### C2-03：缺少 LoginLog 字段完整性

- **位置**：`login-log.service.ts`
- **问题**：PRD DM-04 要求 LoginLog 包含 ip/mac/tencent_id/netbar_name 等字段
- **当前实现**：仅记录 guid/phone/channel/success/errorCode
- **建议**：补充 IP 地址等字段，由 Controller 层传入

---

## 四、Cycle3 审查 — [AUTH-01][US-01][FL-01][QA]

### 4.1 DoD 对照检查

| DoD 要求 | 状态 | 说明 |
|----------|------|------|
| TC-AUTH-FL01-001：已有用户正常登录 | ⚠️ 部分 | Python UT 有，无 E2E |
| TC-AUTH-FL01-002：新用户注册+登录 | ⚠️ 部分 | Python UT 有，无 E2E |
| TC-AUTH-FL01-003：封禁用户尝试登录 | ⚠️ 部分 | Python UT 有，无 E2E |
| TC-AUTH-FL01-004：注销用户生成新 GUID | ⚠️ 部分 | Python UT 有，无 E2E |
| TC-AUTH-FL01-005：验证码错误/过期/频率 | ⚠️ 部分 | Python UT 有，无 E2E |
| TC-AUTH-FL01-006：登录写入 LoginLog | ⚠️ 部分 | Python UT 有，无 E2E |
| 在 LoginLog 中可见正确的登录记录 | ✅ 达成 | test_login_log_cycle28_29.py |

### 4.2 问题清单

#### C3-01：缺少端到端（E2E）测试

- **位置**：项目全局
- **问题**：DoD 要求"端到端自动化测试"，但仅有单元测试，无 Playwright/Cypress E2E
- **DoD 原文**：将测试用例转化为自动化脚本或可复用测试场景
- **建议**：添加 E2E 测试覆盖前后端联调场景

#### C3-02：测试环境构造工具缺失

- **位置**：`dev/tests/`
- **问题**：DoD 要求"提供构造 User.status 不同取值的工具或脚本"
- **当前状态**：测试中手动创建用户，无独立工具
- **建议**：提供 `test_fixtures.py` 或 seed 脚本

---

## 五、Cycle4 审查 — [AUTH-01][US-01][FL-02][FE]

### 5.1 DoD 对照检查

| DoD 要求 | 状态 | 说明 |
|----------|------|------|
| AuthState 新增 sessionStatus 字段 | ❌ 未达成 | 无全局状态管理 |
| 订阅壳层 IPC 事件 | ❌ 未达成 | 无 IPC 订阅实现 |
| 刷新成功更新 access_token | ⚠️ 部分 | ssoStartup.ts 有逻辑，但不完整 |
| 刷新失败跳转登录页 | ✅ 达成 | client.ts 拦截器处理 |
| 刷新失败清理登录状态 | ✅ 达成 | 清除 localStorage |
| 前端单测验证状态变化 | ❌ 未达成 | 无测试 |

### 5.2 问题清单

#### C4-01：未实现 AuthState 状态管理

- **位置**：`frontend-react/src/`
- **问题**：DoD 要求"在 AuthState 中新增 sessionStatus 字段"，但无全局状态
- **当前实现**：仅使用 localStorage 存储 Token
- **建议**：使用 React Context 或 Zustand 实现：
  ```typescript
  interface AuthState {
    guid: string | null;
    accessToken: string | null;
    refreshToken: string | null;
    sessionStatus: 'active' | 'expiring' | 'expired';
  }
  ```

#### C4-02：未实现 IPC 事件订阅

- **位置**：`frontend-react/src/`
- **问题**：DoD 要求"订阅壳层 IPC 事件（如 session.refresh.success / session.refresh.failed）"
- **当前实现**：前端无 IPC 监听逻辑
- **建议**：根据壳层技术栈（Electron/WebView2）添加 IPC 监听

#### C4-03：缺少手动刷新 Token 入口

- **位置**：`frontend-react/src/`
- **问题**：DoD 提到"在调试环境下提供手动刷新 Token 按钮"
- **当前状态**：无此功能
- **建议**：添加调试入口用于联调测试

---

## 六、Cycle5 审查 — [AUTH-01][US-01][FL-02][SH]

### 6.1 DoD 对照检查

| DoD 要求 | 状态 | 说明 |
|----------|------|------|
| 记录登录成功时间/上次刷新成功时间 | ✅ 达成 | `RefreshState.last_success_at` |
| 每 3 小时 + 随机抖动触发刷新 | ✅ 达成 | `REFRESH_INTERVAL + JITTER_MAX` |
| 失败后 5 分钟内最多重试 2 次 | ✅ 达成 | `RETRY_INTERVAL=5min, MAX_RETRY=2` |
| ERR_REFRESH_EXPIRED/MISMATCH 处理 | ⚠️ 部分 | 逻辑框架在，未集成真实 IPC |
| Redis 故障处理（C-02） | ❌ 未达成 | 未实现 |
| 壳层日志记录 | ❌ 未达成 | 无日志逻辑 |
| 监控钩子预留 | ❌ 未达成 | 无 MetricsClient 调用 |
| 单元测试通过 | ✅ 达成 | test_refresh_scheduler_cycle5.py |

### 6.2 问题清单

#### C5-01：未与真实壳层/IPC 集成

- **位置**：`dev/shell/refresh_scheduler.py`
- **问题**：RefreshScheduler 仅为 Python 骨架，未与 Electron/C++ 壳层集成
- **当前状态**：`on_refresh` 回调仅返回 bool，无真实 HTTP 调用
- **建议**：在目标壳层项目中：
  1. 集成真实 HTTP 调用 API-03
  2. 实现真实定时器（非 tick 模拟）
  3. 通过 IPC 通知前端

#### C5-02：未实现 Redis 故障处理（C-02）

- **位置**：`refresh_scheduler.py`
- **问题**：C-02 决策要求 Redis 不可用时"统一失败 + 稍后重试提示"
- **当前实现**：仅区分成功/失败，未区分"可恢复错误"与"需重新登录"
- **建议**：扩展 `on_refresh` 返回值或回调签名，区分错误类型

#### C5-03：缺少壳层日志记录

- **位置**：`refresh_scheduler.py`
- **问题**：DoD 要求"在壳层记录刷新成功/失败日志"
- **当前实现**：无日志输出
- **建议**：添加 logging 调用或日志回调

#### C5-04：jitter 固定为 JITTER_MAX

- **位置**：`refresh_scheduler.py:61`
- **问题**：DoD 要求"0～10 分钟随机抖动"，但实现固定使用 10 分钟
- **当前代码**：
  ```python
  jitter = timedelta(seconds=int(JITTER_MAX.total_seconds()))  # 固定 10 分钟
  ```
- **建议**：使用随机值
  ```python
  import random
  jitter = timedelta(seconds=random.randint(0, int(JITTER_MAX.total_seconds())))
  ```

---

## 七、问题统计

| 严重程度 | Cycle1 | Cycle2 | Cycle3 | Cycle4 | Cycle5 | 合计 |
|----------|--------|--------|--------|--------|--------|------|
| ❌ 未达成 | 2 | 0 | 0 | 3 | 3 | 8 |
| ⚠️ 部分达成 | 2 | 2 | 6 | 1 | 1 | 12 |
| 总问题数 | 4 | 2 | 2 | 4 | 4 | 16 |

---

## 八、优先处理建议

### 8.1 阻塞项（需立即修复）

1. **C2-02**：注销用户登录应保留历史记录（违反 C-01 决策）
2. **C1-02 + C4-01**：实现全局 AuthState 状态管理
3. **C5-01**：壳层需与真实客户端集成

### 8.2 高优先级

1. **C1-03 + C4-03**：添加前端单元测试（TDD 要求）
2. **C3-01**：添加 E2E 测试
3. **C1-01**：错误码友好提示文案
4. **C5-04**：修复 jitter 随机逻辑

### 8.3 中优先级

1. **C2-03**：LoginLog 字段完整性
2. **C4-02**：IPC 事件订阅
3. **C5-02/03**：Redis 故障处理 + 日志
