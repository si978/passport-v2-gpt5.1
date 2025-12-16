# Passport 统一认证中心 - Cycle6-10 专项审查报告

> 审查日期：2025-12-03  
> 审查范围：Cycle6-10（AUTH-01 模块 FL-02/FL-03）

---

## 一、Cycle 范围回顾

| Cycle | 标识 | 目标 | 角色 |
|-------|------|------|------|
| Cycle6 | [AUTH-01][US-01][FL-02][BE] | Token 刷新接口 API-03 | 后端 |
| Cycle7 | [AUTH-01][US-01][FL-02][QA] | 刷新流程E2E测试 | QA |
| Cycle8 | [AUTH-01][US-01][FL-03][FE] | Token错误处理前端 | 前端 |
| Cycle9 | [AUTH-01][US-01][FL-03][BE] | Token验证接口 API-04 | 后端 |
| Cycle10 | [AUTH-01][US-01][FL-03][QA] | Token验证E2E测试 | QA |

---

## 二、Cycle6 审查 — [AUTH-01][US-01][FL-02][BE]

### 2.1 DoD 对照检查

| DoD 要求 | 状态 | 说明 |
|----------|------|------|
| 请求体 { refresh_token, app_id } | ✅ 达成 | `RefreshTokenDto` |
| 响应体 { access_token, expires_in } | ✅ 达成 | 返回 `expires_in: 14400` |
| Refresh Token 过期 → ERR_REFRESH_EXPIRED | ✅ 达成 | `isRefreshValid()` 检查 |
| Refresh Token 不匹配 → ERR_REFRESH_MISMATCH | ✅ 达成 | 比对 session.refreshToken |
| app_id 不匹配 → ERR_APP_ID_MISMATCH | ⚠️ 变更 | 改为支持 SSO 创建新 app session |
| Session 不存在 → ERR_SESSION_NOT_FOUND | ✅ 达成 | 新增错误码处理 |
| 保留 Refresh Token 不延长生命周期 | ✅ 达成 | 仅更新 Access Token |
| 更新 apps.{app_id}.access_token | ✅ 达成 | 正确更新 |
| Redis 异常统一失败（C-02） | ❌ 未达成 | 无 Redis 异常捕获 |
| 日志记录刷新成功/失败 | ❌ 未达成 | 无日志记录 |
| 单元测试 100% 通过 | ✅ 达成 | 7 tests passed |

### 2.2 问题清单

#### C6-01：未实现 Redis 异常处理（C-02 决策）

- **位置**：`token.service.ts:31-43`
- **问题**：DoD 要求"对 Redis 访问异常返回统一内部错误，由 C-02 策略驱动"
- **当前实现**：Redis 异常会直接抛出，未捕获转换为统一错误码
- **PRD 依据**：C-02 决策要求 Redis 不可用时"统一失败 + 稍后重试提示"
- **建议**：
  ```typescript
  try {
    const session = await this.sessions.get(guid);
  } catch (e) {
    throw new AuthException(AuthErrorCode.ERR_INTERNAL, 'service temporarily unavailable');
  }
  ```

#### C6-02：缺少刷新成功/失败日志

- **位置**：`token.service.ts`
- **问题**：DoD 要求"按《日志与审计设计》记录刷新成功/失败日志"
- **当前实现**：无任何日志记录
- **建议**：在刷新成功/失败时调用 `LoginLogService` 或专用日志服务

#### C6-03：Access Token 生成包含 GUID（潜在安全优化）

- **位置**：`token.service.ts:23-25`
- **问题**：Access Token 格式为 `A.{guid}.{random}`，GUID 明文暴露
- **当前代码**：
  ```typescript
  private generateAccessToken(guid: string): string {
    return `A.${guid}.${randomBytes(16).toString('hex')}`;
  }
  ```
- **优点**：可直接从 Token 解析 GUID，避免 SCAN 全表
- **风险**：GUID 可被客户端或中间人获取
- **建议**：评估是否需要加密或使用 JWT

---

## 三、Cycle7 审查 — [AUTH-01][US-01][FL-02][QA]

### 3.1 DoD 对照检查

| DoD 要求 | 状态 | 说明 |
|----------|------|------|
| TC-AUTH-FL02-001：正常定时刷新 | ⚠️ 部分 | 有单元测试，无 E2E |
| TC-AUTH-FL02-002：Refresh Token 过期 | ⚠️ 部分 | Python/Node UT 覆盖 |
| TC-AUTH-FL02-003：Refresh Token 不匹配/伪造 | ⚠️ 部分 | Python/Node UT 覆盖 |
| TC-AUTH-FL02-004：Redis 故障时刷新行为 | ❌ 未达成 | 无 Redis 故障测试 |
| 所有 TC 在测试环境通过 | ⚠️ 部分 | 仅单元测试通过 |
| C-02 决策场景行为说明 | ❌ 未达成 | 无测试覆盖 |

### 3.2 问题清单

#### C7-01：缺少 Redis 故障场景测试（C-02）

- **位置**：`dev/tests/`
- **问题**：DoD 明确要求"通过测试环境配置模拟 Redis 不可用"
- **当前状态**：无任何 Redis 故障模拟测试
- **建议**：
  - 使用 mock 模拟 Redis 连接失败
  - 验证返回统一错误码和"稍后重试"提示

#### C7-02：缺少真正的端到端测试

- **位置**：项目全局
- **问题**：所有测试均为单元测试，无 HTTP 层 E2E 测试
- **DoD 原文**：为 Token 刷新流程编写端到端测试用例与自动化脚本
- **建议**：使用 supertest 或 Playwright 进行完整 HTTP 请求测试

---

## 四、Cycle8 审查 — [AUTH-01][US-01][FL-03][FE]

### 4.1 DoD 对照检查

| DoD 要求 | 状态 | 说明 |
|----------|------|------|
| 通用请求封装层 | ✅ 达成 | `apiClient` axios 实例 |
| ERR_ACCESS_EXPIRED 处理 | ✅ 达成 | 清理登录态+跳转登录页 |
| ERR_ACCESS_INVALID 处理 | ✅ 达成 | 清理登录态+跳转登录页 |
| ERR_APP_ID_MISMATCH 处理 | ✅ 达成 | alert 无权限提示 |
| 状态与路由映射 | ⚠️ 部分 | 无全局 AuthState 更新 |
| 前端单元测试 | ❌ 未达成 | 无测试 |
| 不出现假登录态 | ✅ 达成 | 错误时清理 localStorage |

### 4.2 问题清单

#### C8-01：ERR_REFRESH_EXPIRED/MISMATCH 未处理

- **位置**：`client.ts:14-20`
- **问题**：DoD 要求处理刷新相关错误码，但前端拦截器仅处理 Access Token 错误
- **当前实现**：仅处理 `ERR_ACCESS_EXPIRED`、`ERR_ACCESS_INVALID`、`ERR_APP_ID_MISMATCH`
- **DoD 原文**：ERR_REFRESH_EXPIRED / ERR_REFRESH_MISMATCH 应清理登录态并跳转登录页
- **建议**：
  ```typescript
  if (
    code === 'ERR_ACCESS_EXPIRED' ||
    code === 'ERR_ACCESS_INVALID' ||
    code === 'ERR_REFRESH_EXPIRED' ||
    code === 'ERR_REFRESH_MISMATCH'
  ) {
    // 清理并跳转
  }
  ```

#### C8-02：未触发壳层刷新流程

- **位置**：`client.ts`
- **问题**：DoD 提到"ERR_ACCESS_EXPIRED 触发刷新流程（若壳层可主动刷新）"
- **当前实现**：直接跳转登录页，未尝试刷新
- **建议**：在跳转前尝试通过 IPC 请求壳层刷新 Token

#### C8-03：缺少前端单元测试

- **位置**：`frontend-react/src/api/`
- **问题**：DoD 要求"使用前端单元测试验证不同 HTTP 状态 + error_code 的输入下行为"
- **当前状态**：无测试文件
- **建议**：使用 Vitest + MSW mock API 响应进行测试

#### C8-04：ERR_SESSION_NOT_FOUND 未处理

- **位置**：`client.ts`
- **问题**：后端新增了 `ERR_SESSION_NOT_FOUND` 错误码，但前端未处理
- **建议**：将其视为会话失效，与 `ERR_ACCESS_INVALID` 相同处理

---

## 五、Cycle9 审查 — [AUTH-01][US-01][FL-03][BE]

### 5.1 DoD 对照检查

| DoD 要求 | 状态 | 说明 |
|----------|------|------|
| TokenValidator 实现 | ✅ 达成 | `verifyAccessToken()` |
| 解析 Access Token | ✅ 达成 | 通过 `findByAccessToken` 查找 |
| 过期检查 → ERR_ACCESS_EXPIRED | ✅ 达成 | 比对 `accessTokenExpiresAt` |
| 伪造/无效 → ERR_ACCESS_INVALID | ✅ 达成 | 未找到返回该错误 |
| app_id 不匹配 → ERR_APP_ID_MISMATCH | ✅ 达成 | 比对请求的 app_id |
| API-04 接口实现 | ✅ 达成 | `POST /passport/verify-token` |
| 通用鉴权中间件 | ❌ 未达成 | 无 Guard/Middleware |
| 日志记录关键错误 | ❌ 未达成 | 无日志 |
| 单元测试通过 | ✅ 达成 | 7 tests passed |

### 5.2 问题清单

#### C9-01：缺少通用鉴权中间件/Guard

- **位置**：`backend-node/src/auth/`
- **问题**：DoD 要求"通用鉴权中间件，供业务服务在网关/控制器层统一调用"
- **当前状态**：仅有 `verifyAccessToken` 方法，无 NestJS Guard 封装
- **建议**：创建 `AuthGuard`：
  ```typescript
  @Injectable()
  export class AuthGuard implements CanActivate {
    constructor(private tokenService: TokenService) {}
    
    async canActivate(context: ExecutionContext): Promise<boolean> {
      const request = context.switchToHttp().getRequest();
      const token = this.extractToken(request);
      const result = await this.tokenService.verifyAccessToken({ access_token: token, app_id });
      request.user = { guid: result.guid, app_id: result.app_id };
      return true;
    }
  }
  ```

#### C9-02：Token 查找性能问题（已知问题）

- **位置**：`session-store.ts:30-42`
- **问题**：`findByAccessToken` 遍历所有 Redis key，O(N) 复杂度
- **影响**：大规模用户场景下验证接口延迟高
- **注意**：Cycle6 中 Access Token 已包含 GUID，可优化为 O(1) 查找
- **建议**：
  ```typescript
  // 从 Token 解析 GUID
  const [prefix, guid, random] = accessToken.split('.');
  const session = await this.get(guid);
  ```

#### C9-03：缺少验证相关日志

- **位置**：`token.service.ts:76-104`
- **问题**：DoD 要求"对签名错误、过期、app_id 不匹配等情况记录日志"
- **当前实现**：无日志输出
- **建议**：添加结构化日志

---

## 六、Cycle10 审查 — [AUTH-01][US-01][FL-03][QA]

### 6.1 DoD 对照检查

| DoD 要求 | 状态 | 说明 |
|----------|------|------|
| TC-AUTH-FL03-001：有效 Token 验证通过 | ⚠️ 部分 | UT 覆盖，无 E2E |
| TC-AUTH-FL03-002：Access Token 过期 | ⚠️ 部分 | UT 覆盖，无 E2E |
| TC-AUTH-FL03-003：Token 伪造 | ⚠️ 部分 | UT 覆盖，无 E2E |
| TC-AUTH-FL03-004：app_id 不匹配 | ⚠️ 部分 | UT 覆盖，无 E2E |
| 前后端联调验证 | ❌ 未达成 | 无联调测试 |
| 登录→刷新→验证端到端链路 | ❌ 未达成 | 无完整 E2E |

### 6.2 问题清单

#### C10-01：缺少完整 E2E 测试链路

- **位置**：项目全局
- **问题**：DoD 要求"登录 → 刷新 → 验证的端到端调用链在典型场景与主要异常场景下表现正确"
- **当前状态**：仅有分离的单元测试
- **建议**：创建集成测试：
  ```typescript
  it('full auth flow: login -> refresh -> verify', async () => {
    // 1. 登录获取 Token
    // 2. 使用 Refresh Token 刷新
    // 3. 使用 Access Token 验证
  });
  ```

#### C10-02：缺少前后端联调测试

- **位置**：项目全局
- **问题**：DoD 要求"验证前端通用请求封装是否对错误码进行正确分类处理"
- **当前状态**：前端错误处理未被测试验证
- **建议**：使用 Playwright 或 Cypress 测试前端对各错误码的响应

---

## 七、问题统计

| 严重程度 | Cycle6 | Cycle7 | Cycle8 | Cycle9 | Cycle10 | 合计 |
|----------|--------|--------|--------|--------|---------|------|
| ❌ 未达成 | 2 | 2 | 1 | 2 | 2 | 9 |
| ⚠️ 部分达成 | 1 | 2 | 1 | 0 | 4 | 8 |
| 总问题数 | 3 | 2 | 4 | 2 | 2 | 13 |

---

## 八、与 Cycle1-5 交叉问题

| 问题 | 来源 | 说明 |
|------|------|------|
| 无全局 AuthState | Cycle1/4/8 | 前端状态管理缺失影响多个 Cycle |
| 无前端单元测试 | Cycle1/4/8 | TDD 要求未满足 |
| 无 E2E 测试 | Cycle3/7/10 | 所有 QA Cycle 仅有 UT |
| 无日志记录 | Cycle5/6/9 | 壳层和后端均无日志 |

---

## 九、优先处理建议

### 9.1 阻塞项（需立即修复）

1. **C6-01**：实现 Redis 异常处理（C-02 决策）
2. **C9-01**：创建通用鉴权 AuthGuard
3. **C8-01**：前端处理 ERR_REFRESH_EXPIRED/MISMATCH

### 9.2 高优先级

1. **C9-02**：优化 Token 查找性能（利用已有的 GUID 解析）
2. **C7-01**：添加 Redis 故障测试
3. **C10-01**：创建完整 E2E 测试链路
4. **C6-02 + C9-03**：添加刷新/验证日志

### 9.3 中优先级

1. **C8-03**：前端 API 层单元测试
2. **C8-04**：处理 ERR_SESSION_NOT_FOUND
3. **C7-02 + C10-02**：前后端联调测试
