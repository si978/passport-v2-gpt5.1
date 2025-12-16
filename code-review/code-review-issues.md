# Passport 统一认证中心 - 代码审查问题清单

> 审查日期：2025-12-03  
> 审查范围：dev/ 目录下的 Python PoC、NestJS 后端、React 前端代码  
> 基线文档：PRD v1.1（SSoT）、Dev Plan v1.1（Cycle1-60）

---

## 一、测试执行结果

| 测试类型 | 结果 | 覆盖率 |
|----------|------|--------|
| Python 单元测试 | ✅ 37条通过 | - |
| NestJS Jest 测试 | ✅ 47条通过 | 86.75% |
| React Build | ✅ 构建成功 | - |

---

## 二、安全类问题（SEC）

### SEC-01：验证码未接入真实短信网关

- **位置**：`dev/backend-node/src/auth/verification-code.service.ts:42`
- **问题描述**：`sendCode` 方法仅将验证码存储在内存 Map 中，未调用任何短信网关 API
- **PRD 依据**：BR-09 要求验证码发送至用户手机；2.3 依赖短信通道
- **风险等级**：🔴 高
- **影响**：无法在真实环境中完成登录/注册流程
- **建议**：接入阿里云/腾讯云等短信服务，并实现：
  - 真实发送验证码
  - 发送失败的重试与告警
  - 短信通道可用性监控

```typescript
// 当前实现（占位）
async sendCode(phone: string): Promise<void> {
  // ...
  const code = this.generateCode();
  this.saveCode(phone, code, 5 * 60);
  // TODO: 集成实际短信网关
}
```

---

### SEC-02：~~LocalSession 使用 base64 而非 DPAPI 加密~~ ✅ 已解决

- **位置**：`dev/native/local_session.py:27-99`
- **状态**：✅ **已实现真实 DPAPI 支持**
- **实现说明**：
  - Windows 平台使用 `CryptProtectData` / `CryptUnprotectData` API
  - 非 Windows 或 DPAPI 失败时自动 fallback 到 base64
- **残留问题**：DPAPI 失败时静默降级，建议添加警告日志

---

### SEC-03：缺少请求频率限制（Rate Limiting）

- **位置**：`dev/backend-node/src/auth/auth.controller.ts` 全局
- **问题描述**：登录、验证码发送等敏感接口未配置全局或 IP 级别的频率限制
- **PRD 依据**：BR-09 要求验证码频率控制；API-01/02 需做限流控制
- **风险等级**：🟡 中
- **影响**：可能遭受暴力破解或验证码轰炸攻击
- **建议**：
  - 使用 `@nestjs/throttler` 或 Redis 实现滑动窗口限流
  - 对同一 IP/手机号设置每分钟、每日上限
  - 达到阈值时返回 `ERR_CODE_TOO_FREQUENT` 或 HTTP 429

---

### SEC-04：验证码发送频率仅检查 60 秒间隔

- **位置**：`dev/backend-node/src/auth/verification-code.service.ts:33-37`
- **问题描述**：仅限制同一手机号 60 秒内不能重复发送，未限制每日上限
- **PRD 依据**：BR-09 应定义每日发送上限（N 次）
- **风险等级**：🟡 中
- **影响**：恶意用户可通过等待 60 秒绕过限制，消耗短信资源
- **建议**：增加每手机号每日 10 次上限，超限返回特定错误码

---

### SEC-05：Refresh Token 明文存储在 localStorage

- **位置**：`dev/frontend-react/src/features/auth/LoginPage.tsx:56-58`
- **问题描述**：登录成功后将 `refresh_token` 存入 `localStorage`，可被 XSS 攻击窃取
- **PRD 依据**：G-03 Token 安全可控
- **风险等级**：🟡 中
- **影响**：若存在 XSS 漏洞，攻击者可获取长期有效的 Refresh Token
- **建议**：
  - 考虑使用 HttpOnly Cookie 存储 Refresh Token
  - 或确保应用有严格的 CSP 策略防止 XSS

---

## 三、PRD 一致性问题（PRD）

### PRD-01：ERR_SESSION_NOT_FOUND 前端未处理

- **位置**：`dev/frontend-react/src/api/client.ts`
- **问题描述**：后端已实现 `ERR_SESSION_NOT_FOUND`，但前端拦截器未处理
- **PRD 依据**：ERR 13.2 明确该错误码用于"Redis 中不存在 session:{guid}"
- **风险等级**：🟡 中
- **影响**：会话不存在时前端可能无法正确处理，不会自动跳转登录页
- **建议**：在前端拦截器中添加处理：
  ```typescript
  if (code === 'ERR_SESSION_NOT_FOUND') {
    // 与 ERR_ACCESS_INVALID 相同处理
  }
  ```

---

### PRD-02：HTTP 状态码映射未完全对齐 PRD

- **位置**：`dev/backend-node/src/auth/auth-exception.filter.ts`
- **问题描述**：需确认所有错误码对应的 HTTP 状态码与 PRD 13 章一致
- **PRD 依据**：
  - `ERR_USER_BANNED` → HTTP 403
  - `ERR_REFRESH_EXPIRED/MISMATCH` → HTTP 401
  - `ERR_APP_ID_MISMATCH` → HTTP 403
- **风险等级**：🟢 低
- **建议**：审查 `AuthExceptionFilter` 确保映射正确

---

### PRD-03：Token 验证接口路径与 PRD 不一致

- **位置**：`dev/backend-node/src/auth/auth.controller.ts`
- **问题描述**：实现了 `POST /passport/verify-token`，但 PRD 9.1.1 建议 `/api/passport/verify-token`
- **PRD 依据**：API-04 Path 建议 `/api/passport/verify-token`
- **风险等级**：🟢 低
- **影响**：与 API 文档约定不一致，前端调用可能需要调整
- **建议**：确认最终 API 前缀约定，保持一致

---

### PRD-04：登录响应缺少 expires_in 字段

- **位置**：`dev/backend-node/src/auth/dto/login-response.dto.ts`
- **问题描述**：PRD API-02 响应示例未明确要求，但常见做法是返回 `expires_in` 秒数
- **PRD 依据**：API-03 响应中包含 `expires_in: 14400`
- **风险等级**：🟢 低
- **建议**：统一在登录和刷新响应中返回 `expires_in` 字段

---

## 四、性能问题（PERF）

### PERF-01：~~SessionStore.findByAccessToken 使用 SCAN 遍历全部 key~~ ✅ 已解决

- **位置**：`dev/backend-node/src/auth/session-store.ts:30-43`
- **状态**：✅ **已优化为 O(1)**
- **解决方案**：
  - Token 格式为 `A.{guid}.{random}`，直接从 Token 解析 GUID
  - 复杂度：O(1)
- **解决时间**：Cycle36
- ~~原建议~~：
  - ~~方案A：在 Redis 中维护反向索引 `passport:token:{accessToken} -> guid`~~
  - 方案B：使用 JWT 自包含 Token，验证时解析 payload 获取 guid
  - 方案C：在 Access Token 中编码 guid（如 `A.{guid}.{random}`）

```typescript
// 当前实现（性能问题）
async findByAccessToken(accessToken: string): Promise<Session | null> {
  const stream = this.redis.scanStream({ match: pattern });
  for await (const keys of stream as any) {
    for (const key of keys) {
      // 遍历每个 session 检查 accessToken
    }
  }
}
```

---

### PERF-02：未配置数据库索引

- **位置**：`dev/backend-node/src/auth/user.entity.ts`
- **问题描述**：User 实体未定义 `phone` 字段索引
- **风险等级**：🟡 中
- **影响**：按手机号查询用户时可能全表扫描
- **建议**：
  ```typescript
  @Index()
  @Column({ unique: true })
  phone: string;
  ```

---

## 五、功能完整性问题（FUNC）

### FUNC-01：壳层/原生模块未真实集成

- **位置**：`dev/native/`、`dev/shell/`
- **问题描述**：壳层和原生模块仅为 Python PoC 实现，未与实际客户端（Electron/C++/C#）集成
- **PRD 依据**：2.4 客户端分层说明要求壳层负责 IPC、Token 刷新调度
- **风险等级**：🔴 高
- **影响**：SSO 功能无法在真实客户端中运行
- **建议**：按目标平台（如 Electron）实现：
  - 真实的 LocalSession 文件读写（使用 DPAPI）
  - IPC 通信机制
  - 刷新调度器的实际定时器

---

### FUNC-02：退出登录未清理本地 session.dat

- **位置**：`dev/backend-node/src/auth/token.service.ts:66-72`
- **问题描述**：`logoutByAccessToken` 仅删除 Redis 会话，未触发客户端清理本地文件
- **PRD 依据**：FL-05 要求退出登录时删除本地 `session.dat` 文件
- **风险等级**：🟡 中
- **影响**：退出后本地会话文件可能残留，下次启动可能误判为 SSO 可用
- **建议**：在真实客户端实现中，退出成功后由壳层调用 `delete_session_file()`

---

### FUNC-03：封禁后未主动踢出已登录用户

- **位置**：`dev/backend-node/src/auth/admin.service.ts`
- **问题描述**：封禁操作更新 `User.status` 并删除 Redis 会话，但未主动通知已连接的客户端
- **PRD 依据**：BR-08 要求封禁立即全局失效，客户端需清理本地会话并退回登录页
- **风险等级**：🟡 中
- **影响**：被封禁用户可能在 Access Token 过期前继续使用服务
- **建议**：
  - 实现 WebSocket/长连接通知机制
  - 或在每次 API 请求时校验 `User.status`

---

### FUNC-04：后台管理模块未完整实现

- **位置**：`dev/backend-node/src/auth/admin.controller.ts`
- **问题描述**：仅实现了封禁/解封，缺少用户列表查询、活跃记录导出功能
- **PRD 依据**：US-05、UI 7.2 要求后台提供用户信息表、活跃表查询与导出
- **风险等级**：🟡 中
- **建议**：按 Cycle24-29 继续实现：
  - 用户列表分页查询
  - 活跃记录查询与导出 API

---

## 六、测试覆盖问题（TEST）

### TEST-01：React 前端缺少单元测试

- **位置**：`dev/frontend-react/`
- **问题描述**：前端项目无任何测试文件（无 `*.test.tsx` 或 `*.spec.ts`）
- **PRD 依据**：Dev Plan Cycle1/8/11 要求前端 TDD
- **风险等级**：🟡 中
- **影响**：前端逻辑变更后无法自动验证正确性
- **建议**：使用 Vitest + React Testing Library 添加：
  - LoginPage 组件测试
  - API 错误处理测试
  - SSO 启动逻辑测试

---

### TEST-02：缺少端到端（E2E）测试

- **位置**：项目全局
- **问题描述**：无 Playwright/Cypress 等 E2E 测试覆盖完整用户流程
- **PRD 依据**：Dev Plan Cycle3/10/15 要求 QA 编写 E2E 测试
- **风险等级**：🟡 中
- **建议**：编写 E2E 测试覆盖：
  - 登录/注册完整流程
  - Token 刷新与过期处理
  - SSO 自动登录场景

---

### TEST-03：Python 与 Node 测试未联动验证

- **位置**：`dev/tests/` 与 `dev/backend-node/src/auth/*.spec.ts`
- **问题描述**：Python 和 Node 各自独立测试，未验证两者行为一致性
- **风险等级**：🟢 低
- **建议**：建立"契约测试"或"行为对比测试"，确保两套实现返回相同结果

---

## 七、架构/工程问题（ARCH）

### ARCH-01：Python 与 Node 存在重复实现

- **位置**：`dev/backend/` 与 `dev/backend-node/`
- **问题描述**：AuthService、TokenService 等核心逻辑在两个技术栈中重复实现
- **风险等级**：🟢 低
- **影响**：维护成本增加，可能出现行为不一致
- **建议**：
  - 明确 Python 仅作为 PoC/规格验证
  - 以 NestJS 为生产实现，Python 逐步退役
  - 或提取为语言无关的规格文档

---

### ARCH-02：缺少 API 契约文档（OpenAPI/Swagger）

- **位置**：`dev/backend-node/`
- **问题描述**：未生成或维护 OpenAPI 规范文档
- **风险等级**：🟢 低
- **影响**：前后端协作依赖口头约定，易出现接口不一致
- **建议**：使用 `@nestjs/swagger` 自动生成 OpenAPI 文档

---

### ARCH-03：监控指标仅内存存储

- **位置**：`dev/backend-node/src/auth/metrics.service.ts`
- **问题描述**：`MetricsService` 仅在内存中累加计数器，未接入 Prometheus 等监控系统
- **PRD 依据**：NFR 12.2 要求接入统一监控与告警体系
- **风险等级**：🟡 中
- **影响**：无法在监控平台查看登录成功率、错误率等关键指标
- **建议**：使用 `prom-client` 接入 Prometheus，暴露 `/metrics` 端点

---

### ARCH-04：Redis 连接未配置高可用

- **位置**：`dev/backend-node/src/auth/auth.module.ts`
- **问题描述**：Redis 连接配置为单实例，未考虑主从/哨兵/集群模式
- **PRD 依据**：16.2 RISK-02 提到 Redis 单点故障风险
- **风险等级**：🟡 中
- **建议**：生产环境配置 Redis Sentinel 或 Cluster 模式

---

## 八、日志与审计问题（LOG）

### LOG-01：审计日志仅内存存储

- **位置**：`dev/backend-node/src/auth/audit-log.service.ts`
- **问题描述**：`AuditLogService` 将审计记录存储在内存数组中，服务重启后丢失
- **PRD 依据**：NFR 12.1 要求登录日志持久化，用于统计与审计
- **风险等级**：🟡 中
- **建议**：将审计日志写入数据库或专用日志系统（如 ELK）

---

### LOG-02：敏感信息可能泄露到日志

- **位置**：全局
- **问题描述**：未见日志脱敏配置，验证码、Token 等敏感信息可能被记录
- **PRD 依据**：12.1 要求日志不含敏感明文
- **风险等级**：🟡 中
- **建议**：在日志输出时对手机号、Token 进行脱敏处理

---

## 九、问题统计

| 严重程度 | 数量 |
|----------|------|
| 🔴 高 | 4 |
| 🟡 中 | 14 |
| 🟢 低 | 5 |
| **总计** | **23** |

---

## 十、优先处理建议

1. **立即处理（阻塞上线）**：
   - SEC-01：接入真实短信网关
   - SEC-02：实现 DPAPI 加密
   - PERF-01：优化 Token 查询性能
   - FUNC-01：完成壳层真实集成

2. **短期处理（1-2 周）**：
   - SEC-03/04：完善频率限制
   - PRD-01：补齐错误码
   - TEST-01：添加前端测试
   - ARCH-03：接入 Prometheus 监控

3. **中期处理（迭代规划）**：
   - FUNC-03/04：封禁通知、后台管理完善
   - TEST-02：E2E 测试
   - LOG-01/02：审计日志持久化与脱敏
