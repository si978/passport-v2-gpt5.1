# Passport 统一认证中心 - Cycle21-25 专项审查报告

> 审查日期：2025-12-03  
> 审查范围：Cycle21-25（AUTH-01 FL-06 验证码 + ADMIN-04 FL-06 后台管理）

---

## 一、Cycle 范围回顾

| Cycle | 标识 | 目标 | 角色 |
|-------|------|------|------|
| Cycle21 | [AUTH-01][US-01][FL-06][FE] | 验证码前端交互优化 | 前端 |
| Cycle22 | [AUTH-01][US-01][FL-06][BE] | 验证码发送API与错误码 | 后端 |
| Cycle23 | [AUTH-01][US-01][FL-06][QA] | 验证码逻辑测试 | QA |
| Cycle24 | [ADMIN-04][US-05][FL-06][FE] | 后台用户列表前端 | 前端 |
| Cycle25 | [ADMIN-04][US-05][FL-06][BE] | 后台用户查询与封禁接口 | 后端 |

---

## 二、Cycle21 审查 — [AUTH-01][US-01][FL-06][FE]

### 2.1 DoD 对照检查

| DoD 要求 | 状态 | 说明 |
|----------|------|------|
| 调用 `/api/passport/send-code` | ✅ 达成 | `sendCode(phone)` in auth.ts |
| PRD 正则校验手机号 `^1[3-9][0-9]{9}$` | ✅ 达成 | `isValidPhone()` 函数 |
| 成功后 60 秒倒计时 | ✅ 达成 | `setCooldown(60)` + setInterval |
| 倒计时期间禁用按钮 | ✅ 达成 | `disabled={cooldown > 0}` |
| 捕获 ERR_PHONE_INVALID | ✅ 达成 | 显示"手机号格式不正确" |
| 捕获 ERR_CODE_TOO_FREQUENT | ✅ 达成 | 显示"发送过于频繁" |
| 页面展示友好提示 | ✅ 达成 | `setMessage()` 更新 UI |

### 2.2 亮点

#### C21-亮点：完整的前端验证码交互

- **位置**：`LoginPage.tsx:22-48`
- **说明**：
  - 前端校验 + 后端校验双保险
  - 错误码友好映射
  - 60 秒倒计时 UX 完善

### 2.3 问题清单

#### C21-01：未保存 refresh_token 到 localStorage

- **位置**：`LoginPage.tsx:68`
- **问题**：登录成功后仅保存 `guid` 和 `access_token`，未保存 `refresh_token`
- **当前代码**：
  ```typescript
  window.localStorage.setItem('guid', data.guid);
  window.localStorage.setItem('access_token', data.access_token);
  // 缺少: localStorage.setItem('refresh_token', data.refresh_token);
  ```
- **影响**：Token 刷新和 SSO 功能无法正常工作
- **建议**：添加 `refresh_token` 保存

---

## 三、Cycle22 审查 — [AUTH-01][US-01][FL-06][BE]

### 3.1 DoD 对照检查

| DoD 要求 | 状态 | 说明 |
|----------|------|------|
| 校验手机号格式 | ✅ 达成 | PHONE_REGEX 正则 |
| 非法手机号 → ERR_PHONE_INVALID | ✅ 达成 | 测试验证 |
| 生成 6 位数字验证码 | ✅ 达成 | `generateCode()` |
| 5 分钟有效期存储 | ✅ 达成 | `saveCode(phone, code, 5 * 60)` |
| 频率限制（60秒内） | ✅ 达成 | `lastSentAt` 检查 |
| 每日上限（10次） | ✅ 达成 | `dailyCount` 检查 |
| ERR_CODE_TOO_FREQUENT 错误码 | ✅ 达成 | 频率/每日限制时抛出 |
| TODO 接入短信网关 | ✅ 达成 | 注释标记 |

### 3.2 亮点

#### C22-亮点1：完整的频率控制实现

- **位置**：`verification-code.service.ts:34-48`
- **说明**：
  - 60 秒内重复发送限制
  - 每日 10 次上限
  - 两种场景都返回统一错误码

#### C22-亮点2：安全的验证码生成

- **位置**：`verification-code.service.ts:17-19`
- **说明**：使用 `Math.random()` 生成 6 位数字
- **改进建议**：生产环境可考虑使用 `crypto.randomInt` 增强随机性

### 3.3 问题清单

#### C22-01：验证码未发送给用户

- **位置**：`verification-code.service.ts:51-52`
- **问题**：验证码仅存储在内存中，未通过任何渠道发送给用户
- **当前实现**：
  ```typescript
  // TODO: 集成实际短信网关，将验证码发送给用户
  ```
- **影响**：用户无法获取验证码进行登录（除非查看后端日志）
- **状态**：符合迭代规划，标记为后续迭代

#### C22-02：dailyCount 无自动清理

- **位置**：`verification-code.service.ts:14`
- **问题**：`dailyCount` Map 会无限增长，无清理机制
- **影响**：长期运行可能导致内存泄漏
- **建议**：添加定时清理或使用 Redis 带 TTL 存储

---

## 四、Cycle23 审查 — [AUTH-01][US-01][FL-06][QA]

### 4.1 DoD 对照检查

| DoD 要求 | 状态 | 说明 |
|----------|------|------|
| saveCode + validateCode 测试 | ✅ 达成 | 正确/错误验证码分支 |
| sendCode 非法手机号测试 | ✅ 达成 | ERR_PHONE_INVALID |
| 验证码过期测试 | ✅ 达成 | ERR_CODE_EXPIRED |
| 频率限制测试（60秒） | ✅ 达成 | ERR_CODE_TOO_FREQUENT |
| 每日上限测试（10次） | ✅ 达成 | 循环调用 10 次后拒绝 |
| Python UT 行为一致 | ✅ 达成 | test_auth_cycle1_2.py |

### 4.2 亮点

#### C23-亮点：完整的验证码测试覆盖

- **位置**：`verification-code.service.spec.ts`
- **说明**：5 个测试用例覆盖所有核心分支
  - 正确/错误验证码
  - 过期验证码
  - 60 秒频率限制
  - 每日 10 次上限

### 4.3 问题清单

无问题，测试覆盖完整。

---

## 五、Cycle24 审查 — [ADMIN-04][US-05][FL-06][FE]

### 5.1 DoD 对照检查

| DoD 要求 | 状态 | 说明 |
|----------|------|------|
| UserListPage 组件 | ✅ 达成 | `UserListPage.tsx` |
| 调用 `/api/admin/users` | ✅ 达成 | `loadUsers()` 函数 |
| 显示基本字段 | ✅ 达成 | guid/phone/status/account_source |
| 状态筛选下拉框 | ✅ 达成 | ALL/ACTIVE/BANNED/DELETED |
| 路由到 `/admin/users` | ✅ 达成 | App.tsx 路由配置 |
| 封禁/解封操作按钮 | ✅ 达成 | 条件渲染按钮 |

### 5.2 亮点

#### C24-亮点：完整的后台用户管理前端

- **位置**：`UserListPage.tsx`
- **说明**：
  - 状态筛选联动
  - 封禁/解封操作完整
  - 操作后自动刷新列表

### 5.3 问题清单

#### C24-01：无权限校验

- **位置**：`UserListPage.tsx`
- **问题**：后台页面无任何权限校验，任何人可访问
- **影响**：安全风险，普通用户可访问后台
- **建议**：添加路由守卫或在 API 层校验管理员权限

#### C24-02：无分页功能

- **位置**：`UserListPage.tsx`
- **问题**：用户量大时一次加载所有用户，性能问题
- **影响**：大数据量下页面卡顿
- **建议**：添加分页参数 `page`/`pageSize`

#### C24-03：无前端单元测试

- **位置**：`frontend-react/src/features/admin/`
- **问题**：无测试文件
- **建议**：添加组件测试

---

## 六、Cycle25 审查 — [ADMIN-04][US-05][FL-06][BE]

### 6.1 DoD 对照检查

| DoD 要求 | 状态 | 说明 |
|----------|------|------|
| UserQueryService.list_users() | ✅ 达成 | Python 实现 |
| 按 status 过滤 | ✅ 达成 | Python + NestJS |
| 按创建时间/手机号排序 | ✅ 达成 | `order: { createdAt, phone }` |
| BanService.unban_by_phone() | ✅ 达成 | Python 实现 |
| NestJS AdminService | ✅ 达成 | 完整实现 |
| NestJS AdminController | ✅ 达成 | RESTful API |
| Python UT 验证查询排序 | ✅ 达成 | test_list_users_returns_all_sorted |
| Python UT 验证状态过滤 | ✅ 达成 | test_list_users_filter_by_status |
| Python UT 验证封禁/解封 | ✅ 达成 | test_ban_and_unban_updates_status |
| NestJS UT 覆盖 | ✅ 达成 | admin.service.spec.ts |

### 6.2 亮点

#### C25-亮点1：Python + NestJS 双栈完整实现

- **说明**：后台用户管理在两个后端栈都已完整实现
- **Python**：`UserQueryService` + `BanService`
- **NestJS**：`AdminService` + `AdminController`

#### C25-亮点2：审计日志集成

- **位置**：`admin.controller.ts:27-35`
- **说明**：封禁/解封操作自动记录审计日志
  ```typescript
  this.audit.recordBan(guid);
  this.audit.recordUnban(guid);
  ```

#### C25-亮点3：登录活跃明细 API

- **位置**：`admin.service.ts:73-91`
- **说明**：`GET /admin/activity` 返回登录/登出记录
- **包含字段**：guid, phone, login_at, logout_at, channel, ip

### 6.3 问题清单

#### C25-01：后台 API 无权限校验

- **位置**：`admin.controller.ts`
- **问题**：无 `@UseGuards()` 装饰器，任何人可调用
- **影响**：严重安全风险
- **建议**：添加管理员权限 Guard
  ```typescript
  @UseGuards(AdminGuard)
  @Controller('admin')
  export class AdminController { ... }
  ```

#### C25-02：封禁时未记录操作者

- **位置**：`admin.service.ts:54-59`
- **问题**：封禁/解封操作未记录是谁执行的
- **影响**：无法追溯操作责任
- **建议**：审计日志添加 `operator` 字段

---

## 七、问题统计

| 严重程度 | Cycle21 | Cycle22 | Cycle23 | Cycle24 | Cycle25 | 合计 |
|----------|---------|---------|---------|---------|---------|------|
| ❌ 未达成 | 0 | 0 | 0 | 0 | 0 | 0 |
| ⚠️ 部分达成 | 1 | 2 | 0 | 3 | 2 | 8 |
| 总问题数 | 1 | 2 | 0 | 3 | 2 | 8 |

---

## 八、亮点总结

| 亮点 | Cycle | 说明 |
|------|-------|------|
| 完整验证码前端交互 | Cycle21 | 校验+倒计时+错误处理 |
| 完整频率控制 | Cycle22 | 60秒限制+每日10次上限 |
| 完整测试覆盖 | Cycle23 | 5个测试覆盖所有分支 |
| 后台前端完整 | Cycle24 | 筛选+封禁+自动刷新 |
| 双栈实现 | Cycle25 | Python + NestJS 一致 |
| 审计日志集成 | Cycle25 | 封禁/解封自动记录 |

---

## 九、优先处理建议

### 9.1 高优先级（安全相关）

1. **C24-01 + C25-01**：后台页面/API 无权限校验 — 严重安全风险
2. **C21-01**：登录后保存 `refresh_token` — 影响 Token 刷新

### 9.2 中优先级

1. **C22-01**：集成短信网关（生产必需）
2. **C25-02**：封禁操作记录操作者
3. **C24-02**：后台用户列表分页

### 9.3 低优先级

1. **C22-02**：dailyCount 内存清理
2. **C24-03**：后台前端单元测试

---

## 十、与前序 Cycle 累计问题

| 问题类型 | Cycle1-5 | Cycle6-10 | Cycle11-15 | Cycle16-20 | Cycle21-25 | 总计 |
|----------|----------|-----------|------------|------------|------------|------|
| 无全局 AuthState | 2 | 1 | 1 | 0 | 0 | 4 |
| 无前端单测 | 2 | 1 | 1 | 1 | 1 | 6 |
| 无 E2E 测试 | 1 | 3 | 1 | 1 | 0 | 6 |
| 未与真实壳层集成 | 1 | 0 | 1 | 1 | 0 | 3 |
| 无日志记录 | 1 | 2 | 2 | 1 | 0 | 6 |
| 无权限校验 | 0 | 0 | 0 | 0 | 2 | 2 |
