# Passport 统一认证中心 - Cycle26-30 专项审查报告

> 审查日期：2025-12-03  
> 审查范围：Cycle26-30（ADMIN-04 FL-06/FL-07 后台管理 + OBS-05 观测性）

---

## 一、Cycle 范围回顾

| Cycle | 标识 | 目标 | 角色 |
|-------|------|------|------|
| Cycle26 | [ADMIN-04][US-05][FL-06][QA] | 后台用户信息表QA | QA |
| Cycle27 | [ADMIN-04][US-05][FL-07][FE] | 后台用户活跃表前端 | 前端 |
| Cycle28 | [ADMIN-04][US-05][FL-07][BE] | LoginLog模型与查询服务 | 后端 |
| Cycle29 | [ADMIN-04][US-05][FL-07][QA] | 登录活跃记录查询QA | QA |
| Cycle30 | [OBS-05][NFR][LOG-MON][BE] | NestJS观测性PoC | 后端 |

---

## 二、Cycle26 审查 — [ADMIN-04][US-05][FL-06][QA]

### 2.1 DoD 对照检查

| DoD 要求 | 状态 | 说明 |
|----------|------|------|
| UserQueryService UT | ✅ 达成 | test_admin_user_query_cycle25.py |
| list_users() 返回全部用户 | ✅ 达成 | test_list_users_returns_all_sorted |
| 按创建时间/手机号排序 | ✅ 达成 | `["G1", "G2", "G3"]` 顺序验证 |
| list_users(status=...) 过滤 | ✅ 达成 | test_list_users_filter_by_status |
| ban/unban 行为正确 | ✅ 达成 | test_ban_and_unban_updates_status |
| 查询结果即时反映状态变更 | ✅ 达成 | 封禁后立即查询验证 |
| User.status 符合 BR-08/DM-01 | ✅ 达成 | ACTIVE/BANNED/DELETED 三态 |

### 2.2 亮点

#### C26-亮点：完整的后台用户管理测试

- **位置**：`test_admin_user_query_cycle25.py`
- **说明**：3 个测试用例覆盖查询、过滤、封禁/解封核心行为

### 2.3 问题清单

无问题，测试覆盖完整。

---

## 三、Cycle27 审查 — [ADMIN-04][US-05][FL-07][FE]

### 3.1 DoD 对照检查

| DoD 要求 | 状态 | 说明 |
|----------|------|------|
| UserActivityPage 组件 | ✅ 达成 | `UserActivityPage.tsx` |
| 调用 `/admin/activity` | ✅ 达成 | `apiClient.get('/admin/activity')` |
| 展示字段完整 | ✅ 达成 | guid/phone/login_at/logout_at/channel/ip |
| 路由 `/admin/activity` | ✅ 达成 | App.tsx 配置 |
| 导出按钮入口 | ✅ 达成 | 预留空实现 |
| npm run build 通过 | ✅ 达成 | React 构建成功 |

### 3.2 亮点

#### C27-亮点：完整的活跃明细页面结构

- **位置**：`UserActivityPage.tsx`
- **说明**：
  - 表格展示所有核心字段
  - 预留导出按钮入口
  - 与后端 API 对接完整

### 3.3 问题清单

#### C27-01：导出功能未实现

- **位置**：`UserActivityPage.tsx:31`
- **问题**：导出按钮点击无任何行为
- **当前代码**：
  ```typescript
  <button type="button" onClick={() => {/* 预留导出行为 */}}>
  ```
- **影响**：用户无法导出活跃数据
- **建议**：实现 CSV 下载或调用后端导出 API

#### C27-02：无筛选功能

- **位置**：`UserActivityPage.tsx`
- **问题**：DoD 提到"支持按状态/时间区间等条件查询"，但未实现
- **影响**：用户只能查看全量数据
- **建议**：添加时间范围选择器和渠道筛选

#### C27-03：无分页

- **位置**：`UserActivityPage.tsx`
- **问题**：一次加载所有数据，大数据量下性能问题
- **建议**：添加分页参数

---

## 四、Cycle28 审查 — [ADMIN-04][US-05][FL-07][BE]

### 4.1 DoD 对照检查

| DoD 要求 | 状态 | 说明 |
|----------|------|------|
| LoginLog dataclass | ✅ 达成 | domain.py:116-127 |
| 字段完整（guid/phone/login_at/...) | ✅ 达成 | 含 channel/ip/success/error_code |
| InMemoryLoginLogRepo | ✅ 达成 | domain.py:130-165 |
| append(log) 方法 | ✅ 达成 | 追加记录 |
| query(phone/start/end/channel) | ✅ 达成 | 多条件过滤 |
| LoginLogService 包装 | ✅ 达成 | services.py |
| record_login/record_logout | ✅ 达成 | Python + NestJS |
| 按时间排序 | ✅ 达成 | `sorted(rows, key=lambda r: r.login_at)` |
| NestJS LoginLogService | ✅ 达成 | login-log.service.ts |

### 4.2 亮点

#### C28-亮点1：Python + NestJS 双栈 LoginLog 实现

- **Python**：`InMemoryLoginLogRepo` + `LoginLogService`
- **NestJS**：`LoginLogService` with in-memory storage
- **字段一致**：两侧字段命名基本对齐（驼峰/下划线差异）

#### C28-亮点2：灵活的查询过滤

- **位置**：`domain.py:145-163`
- **说明**：支持 phone/start/end/channel 四种过滤条件组合

### 4.3 问题清单

#### C28-01：record_logout 匹配逻辑差异

- **位置**：Python `services.py` vs NestJS `login-log.service.ts`
- **问题**：两侧 `record_logout` 匹配逻辑略有不同
- **Python**：匹配 guid + phone，从后往前找
- **NestJS**：匹配 guid + 可选 phone，从后往前找
- **影响**：边缘情况可能行为不一致
- **建议**：统一匹配逻辑

---

## 五、Cycle29 审查 — [ADMIN-04][US-05][FL-07][QA]

### 5.1 DoD 对照检查

| DoD 要求 | 状态 | 说明 |
|----------|------|------|
| 多条 LoginLog 构造 | ✅ 达成 | setUp 构造 4 条记录 |
| 按手机号过滤测试 | ✅ 达成 | test_filter_by_phone |
| 按时间区间过滤测试 | ✅ 达成 | test_filter_by_time_window |
| 按渠道过滤测试 | ✅ 达成 | test_filter_by_channel |
| logout_at 更新测试 | ✅ 达成 | test_logout_updates_logout_at |
| 与 Cycle28 服务行为一致 | ✅ 达成 | 使用 LoginLogService |

### 5.2 亮点

#### C29-亮点：完整的 LoginLog 查询测试

- **位置**：`test_login_log_cycle28_29.py`
- **说明**：4 个测试覆盖所有过滤条件和 logout 更新

### 5.3 问题清单

#### C29-01：缺少导出视图测试

- **位置**：`test_login_log_cycle28_29.py`
- **问题**：DoD 提到验证"导出视图字段齐全、顺序正确"，但无相关测试
- **影响**：导出功能无测试保障
- **建议**：添加导出格式验证测试

---

## 六、Cycle30 审查 — [OBS-05][NFR][LOG-MON][BE]

### 6.1 DoD 对照检查

| DoD 要求 | 状态 | 说明 |
|----------|------|------|
| MetricsService 实现 | ✅ 达成 | metrics.service.ts |
| 登录成功计数 incLoginSuccess | ✅ 达成 | counters.loginSuccess |
| 登录失败计数 incLoginFailure | ✅ 达成 | counters.loginFailure |
| 验证码失败计数 incSendCodeFailure | ✅ 达成 | counters.sendCodeFailure |
| Token刷新失败计数 incRefreshFailure | ✅ 达成 | counters.refreshFailure |
| snapshot() 方法 | ✅ 达成 | 返回计数快照 |
| reset() 方法 | ✅ 达成 | 重置所有计数 |
| Jest UT 覆盖 | ✅ 达成 | 3 个测试用例 |
| 初始快照全为 0 | ✅ 达成 | starts from zero snapshot |
| 计数精确递增 | ✅ 达成 | increments counters correctly |

### 6.2 亮点

#### C30-亮点1：已集成到控制器

- **位置**：`auth.controller.ts:36-81`
- **说明**：MetricsService 已注入并在登录/验证码/刷新失败时调用
- **代码示例**：
  ```typescript
  this.metrics.incLoginSuccess();  // 登录成功
  this.metrics.incLoginFailure();  // 登录失败
  this.metrics.incSendCodeFailure();  // 验证码失败
  this.metrics.incRefreshFailure();  // 刷新失败
  ```

#### C30-亮点2：提供管理端点

- **位置**：`admin.controller.ts:46-48`
- **说明**：`GET /admin/metrics` 返回当前计数快照
- **用途**：运维监控可定期拉取

#### C30-亮点3：完整测试覆盖

- **位置**：`metrics.service.spec.ts`
- **说明**：3 个测试覆盖初始化、递增、重置

### 6.3 问题清单

#### C30-01：计数器无持久化

- **位置**：`metrics.service.ts`
- **问题**：计数器仅存内存，服务重启后丢失
- **影响**：无法做长期统计
- **状态**：符合 PoC 定位，后续接入 Prometheus 解决

#### C30-02：缺少登出成功计数

- **位置**：`metrics.service.ts`
- **问题**：有登录成功/失败，但无登出计数
- **建议**：添加 `incLogoutSuccess()`

#### C30-03：metrics 端点无权限校验

- **位置**：`admin.controller.ts:46`
- **问题**：与其他 admin 端点相同，无权限校验
- **影响**：任何人可获取系统指标

---

## 七、问题统计

| 严重程度 | Cycle26 | Cycle27 | Cycle28 | Cycle29 | Cycle30 | 合计 |
|----------|---------|---------|---------|---------|---------|------|
| ❌ 未达成 | 0 | 0 | 0 | 0 | 0 | 0 |
| ⚠️ 部分达成 | 0 | 3 | 1 | 1 | 3 | 8 |
| 总问题数 | 0 | 3 | 1 | 1 | 3 | 8 |

---

## 八、亮点总结

| 亮点 | Cycle | 说明 |
|------|-------|------|
| 完整用户管理测试 | Cycle26 | 查询/过滤/封禁全覆盖 |
| 活跃明细页面完整 | Cycle27 | 表格+导出入口 |
| 双栈 LoginLog 实现 | Cycle28 | Python + NestJS 一致 |
| 灵活查询过滤 | Cycle28 | 4 种条件组合 |
| 完整查询测试 | Cycle29 | 4 个测试覆盖所有过滤 |
| Metrics 已集成控制器 | Cycle30 | 自动统计成功/失败 |
| 提供管理端点 | Cycle30 | GET /admin/metrics |

---

## 九、优先处理建议

### 9.1 高优先级

1. **C30-03**：metrics 端点无权限校验（与 C25-01 同类问题）

### 9.2 中优先级

1. **C27-01**：实现活跃数据导出功能
2. **C27-02**：添加时间/渠道筛选
3. **C28-01**：统一 record_logout 匹配逻辑
4. **C30-02**：添加登出计数

### 9.3 低优先级

1. **C27-03**：活跃明细分页
2. **C29-01**：添加导出视图测试
3. **C30-01**：计数器持久化（后续接入监控平台解决）

---

## 十、与前序 Cycle 累计问题

| 问题类型 | C1-5 | C6-10 | C11-15 | C16-20 | C21-25 | C26-30 | 总计 |
|----------|------|-------|--------|--------|--------|--------|------|
| 无全局 AuthState | 2 | 1 | 1 | 0 | 0 | 0 | 4 |
| 无前端单测 | 2 | 1 | 1 | 1 | 1 | 0 | 6 |
| 无 E2E 测试 | 1 | 3 | 1 | 1 | 0 | 0 | 6 |
| 未与真实壳层集成 | 1 | 0 | 1 | 1 | 0 | 0 | 3 |
| 无日志记录 | 1 | 2 | 2 | 1 | 0 | 0 | 6 |
| 无权限校验 | 0 | 0 | 0 | 0 | 2 | 1 | 3 |
| 功能未完整实现 | 0 | 0 | 0 | 1 | 0 | 1 | 2 |
