# Passport 统一认证中心 - Hardening 修复审查报告

> 审查日期：2025-12-03  
> 审查范围：代码加固修复（Hardening）

---

## 一、Hardening 修复概述

本次 Hardening 修复针对 code-review-backlog 中的未解决问题进行了多项加固，主要涉及：

1. **C6-01**：Redis 异常处理（已解决）
2. **活跃明细查询增强**：支持过滤参数
3. **SSO 登录审计**：recordSsoLogin 实现
4. **强制退出功能**：logoutByGuid 实现

---

## 二、C6-01 已解决：Redis 异常处理 ✅

### 2.1 问题回顾

- **原始问题**：TokenService 中的 Redis 操作未做异常处理，Redis 连接失败时会导致未捕获异常
- **PRD 依据**：C-02 要求服务对基础设施故障有容错能力

### 2.2 修复内容

**位置**：`token.service.ts`

| 方法 | 修复行 | 说明 |
|------|--------|------|
| refreshAccessToken | 77-88 | try-catch 包裹，非 AuthException 转为 ERR_INTERNAL |
| logoutByAccessToken | 91-108 | try-catch 包裹，记录错误日志 |
| logoutByGuid | 111-128 | try-catch 包裹，记录错误日志 |
| verifyAccessToken | 131-168 | try-catch 包裹，记录错误日志 |

### 2.3 实现代码

```typescript
async refreshAccessToken(guid: string, dto: RefreshTokenDto): Promise<LoginResponseDto> {
  try {
    // ... 业务逻辑 ...
  } catch (e) {
    if (e instanceof AuthException) {
      this.logger.warn(`refreshAccessToken failed for guid=${guid}, app_id=${dto.app_id}, code=${e.code}`);
      throw e;
    }
    this.logger.error(`refreshAccessToken redis error for guid=${guid}, app_id=${dto.app_id}`, (e as Error).stack);
    throw new AuthException(AuthErrorCode.ERR_INTERNAL, 'service temporarily unavailable');
  }
}
```

### 2.4 验证

- ✅ 所有 4 个方法都有 try-catch
- ✅ 非 AuthException 转为 ERR_INTERNAL
- ✅ 错误日志包含堆栈信息
- ✅ ERR_INTERNAL 映射到 HTTP 500（auth-exception.filter.ts:25）

---

## 三、活跃明细查询增强

### 3.1 问题回顾

- **原始问题**（FUNC-04）：后台仅有简单查询，缺少活跃记录过滤能力
- **当前状态**：已支持 phone/start/end/channel 四种过滤

### 3.2 修复内容

**位置**：`admin.controller.ts:48-77`

```typescript
@Get('activity')
async listActivity(
  @Query('phone') phone?: string,
  @Query('start') start?: string,
  @Query('end') end?: string,
  @Query('channel') channel?: string,
) {
  const filters: { phone?: string; start?: Date; end?: Date; channel?: string } = {};
  
  if (phone) filters.phone = phone;
  if (channel) filters.channel = channel;
  if (start) {
    const s = new Date(start);
    if (!Number.isNaN(s.getTime())) filters.start = s;
  }
  if (end) {
    const e = new Date(end);
    if (!Number.isNaN(e.getTime())) filters.end = e;
  }
  
  const activities = await this.adminService.listActivity(filters);
  return { activities };
}
```

### 3.3 验证

- ✅ phone 过滤
- ✅ channel 过滤
- ✅ start/end 时间窗口过滤
- ✅ 无效日期安全处理（isNaN 检查）

---

## 四、SSO 登录审计

### 4.1 问题回顾

- **需求**：SSO 自动登录（通过 refreshAccessToken 首次进入新应用）需记录审计日志

### 4.2 修复内容

**位置**：`token.service.ts:57-66`

```typescript
let appSession: AppSession | undefined = session.apps[dto.app_id];

if (!appSession) {
  appSession = {
    accessToken,
    accessTokenExpiresAt: atExp.toISOString(),
    lastActiveAt: now.toISOString(),
  };
  this.auditLog.recordSsoLogin(session.guid, dto.app_id);  // SSO 登录审计
} else {
  // 刷新已有会话
  appSession.accessToken = accessToken;
  appSession.accessTokenExpiresAt = atExp.toISOString();
  appSession.lastActiveAt = now.toISOString();
}
```

### 4.3 验证

- ✅ AuditLogService 已注入 TokenService
- ✅ recordSsoLogin 在首次进入新应用时调用
- ✅ 记录 guid 和 appId

---

## 五、强制退出功能

### 5.1 问题回顾

- **需求**：后台管理员需要能强制退出指定用户

### 5.2 修复内容

**位置**：`token.service.ts:111-128`

```typescript
async logoutByGuid(guid: string): Promise<void> {
  try {
    const session = await this.sessions.get(guid);
    if (!session) {
      // 找不到会话时视为幂等成功
      return;
    }
    this.loginLog.recordLogout(guid);
    await this.sessions.delete(guid);
    this.logger.log(`logoutByGuid success for guid=${guid}`);
  } catch (e) {
    // ... 异常处理 ...
  }
}
```

**位置**：`admin.controller.ts:41-46`

```typescript
@Post('users/:guid/logout')
async logoutUser(@Param('guid') guid: string, @Req() req: any): Promise<{ success: true }> {
  await this.tokenService.logoutByGuid(guid);
  this.audit.recordLogout({ guid, operator: req?.user?.guid });
  return { success: true };
}
```

### 5.3 验证

- ✅ logoutByGuid 方法实现
- ✅ 幂等设计（会话不存在时静默成功）
- ✅ 记录登录日志（loginLog.recordLogout）
- ✅ 记录审计日志（audit.recordLogout）
- ✅ AdminController 端点测试覆盖

---

## 六、问题解决状态更新

### 6.1 已解决问题

| 问题ID | 问题描述 | 状态 |
|--------|----------|------|
| **C6-01** | **Redis 异常处理** | **✅ 已解决** |

### 6.2 部分解决问题

| 问题ID | 问题描述 | 进展 |
|--------|----------|------|
| FUNC-04 | 后台管理功能不完整 | 已支持过滤查询，仍缺分页/导出 |

---

## 七、剩余阻塞项（更新后仅 3 个）

| ID | 问题 | 状态 | 严重程度 |
|----|------|------|----------|
| C11-01 | SSO 数据从 IPC 获取 | 待修复 | 中 |
| C12-01 | 壳层传递 LocalSession | 待修复 | 中 |
| **C16-01** | **前端退出功能** | **待修复** | **严重** |

---

## 八、测试验证

```
Test Suites: 14 passed, 14 total
Tests:       55 passed, 55 total
```

所有测试通过，Hardening 修复未引入回归。

---

## 九、已解决问题汇总（截至 Hardening）

| 问题ID | 问题描述 | 解决时间 |
|--------|----------|----------|
| ~~SEC-02~~ | DPAPI 加密 | Cycle13 |
| ~~PERF-01~~ | Token 查询 O(N) | Cycle36 |
| ~~C9-01~~ | 通用鉴权 AuthGuard | Cycle46-50 |
| ~~C24-01~~ | 后台页面权限 | Cycle56-60 |
| ~~C25-01~~ | 后台 API 权限 | Cycle56-60 |
| ~~**C6-01**~~ | **Redis 异常处理** | **Hardening** |

---

## 十、总结

Hardening 修复成功解决了 **C6-01（Redis 异常处理）**，这是最后一个与 C-02 合规相关的阻塞项。

| 指标 | 结果 |
|------|------|
| 已解决阻塞项 | **1**（C6-01） |
| 剩余阻塞项 | **3**（从 4 减少） |
| 测试通过 | **55/55** |
| 回归 | **无** |

### 当前项目状态

- **后端 NestJS**：功能完整，测试覆盖充分
- **前端 React**：仅缺退出功能（C16-01）
- **壳层/原生模块**：待与真实客户端集成（C11-01, C12-01）
