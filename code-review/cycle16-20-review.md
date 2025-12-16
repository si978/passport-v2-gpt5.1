# Passport 统一认证中心 - Cycle16-20 专项审查报告

> 审查日期：2025-12-03  
> 审查范围：Cycle16-20（SESS-03 模块 FL-05 退出/封禁）

---

## 一、Cycle 范围回顾

| Cycle | 标识 | 目标 | 角色 |
|-------|------|------|------|
| Cycle16 | [SESS-03][US-04][FL-05][FE] | 前端退出交互与状态清理 | 前端 |
| Cycle17 | [SESS-03][US-04][FL-05][SH] | 壳层退出广播与本地会话清理 | 壳层 |
| Cycle18 | [SESS-03][US-04][FL-05][NM] | 原生模块会话删除接口 | 原生 |
| Cycle19 | [SESS-03][US-04][FL-05][BE] | 后端会话销毁与封禁联动 | 后端 |
| Cycle20 | [SESS-03][US-04][FL-05][QA] | 退出/封禁全局效果测试 | QA |

---

## 二、Cycle19 审查 — [SESS-03][US-04][FL-05][BE]（优先实现）

### 2.1 DoD 对照检查

| DoD 要求 | 状态 | 说明 |
|----------|------|------|
| LogoutService.logout(guid) | ✅ 达成 | Python + NestJS 均已实现 |
| logout 幂等行为 | ✅ 达成 | 会话不存在时不抛异常 |
| BanService.ban_by_phone(phone) | ✅ 达成 | Python 实现 |
| 封禁更新 UserStatus.BANNED | ✅ 达成 | 状态正确更新 |
| 封禁删除会话 | ✅ 达成 | 调用 session_store.delete |
| 退出后刷新返回 ERR_REFRESH_EXPIRED | ✅ 达成 | 测试验证 |
| 封禁后登录返回 ERR_USER_BANNED | ✅ 达成 | 测试验证 |
| 行为与 BR-07/BR-08 一致 | ✅ 达成 | 退出=全局退出，封禁=立即失效 |

### 2.2 亮点

#### C19-亮点1：Python + NestJS 双栈实现

- **位置**：`backend/services.py` + `backend-node/src/auth/token.service.ts`
- **说明**：退出登录逻辑在两个后端栈都已实现
- **Python**：`LogoutService.logout(guid)` + `BanService.ban_by_phone(phone)`
- **NestJS**：`TokenService.logoutByAccessToken(accessToken)` + 审计日志

#### C19-亮点2：NestJS 退出支持多种 Token 传递方式

- **位置**：`auth.controller.ts:92-101`
- **说明**：支持 Body (`access_token`) 和 Authorization Header 两种方式
- **代码**：
  ```typescript
  const accessToken = dto.access_token ?? this.extractFromAuthHeader(authHeader);
  ```

### 2.3 问题清单

#### C19-01：NestJS 缺少按 GUID 退出的方法

- **位置**：`token.service.ts`
- **问题**：仅有 `logoutByAccessToken`，无 `logoutByGuid`
- **Python 有**：`LogoutService.logout(guid)`
- **影响**：后台管理无法按 GUID 强制下线用户
- **建议**：添加 `logoutByGuid(guid: string)` 方法

#### C19-02：NestJS 缺少 BanService

- **位置**：`backend-node/src/auth/`
- **问题**：Python 有 `BanService`，NestJS 仅在 AdminService 中处理封禁
- **建议**：保持一致，或在 AdminService 中添加会话删除逻辑

---

## 三、Cycle18 审查 — [SESS-03][US-04][FL-05][NM]

### 3.1 DoD 对照检查

| DoD 要求 | 状态 | 说明 |
|----------|------|------|
| write_session_file(path, payload) | ✅ 达成 | local_session.py:137-139 |
| read_session_file(path) | ✅ 达成 | local_session.py:142-144 |
| delete_session_file(path) | ✅ 达成 | local_session.py:147-152 |
| 删除幂等（文件不存在不抛异常） | ✅ 达成 | 捕获 FileNotFoundError |
| UT 验证写入-读取往返 | ✅ 达成 | test_write_read_delete_session_file |
| UT 验证删除幂等 | ✅ 达成 | 调用两次 delete 不抛异常 |

### 3.2 问题清单

#### C18-01：无文件写入错误处理

- **位置**：`local_session.py:137-139`
- **问题**：写入文件时未处理磁盘空间不足、权限等异常
- **当前实现**：
  ```python
  def write_session_file(path: PathLike, payload: Dict[str, Any]) -> None:
      cipher = LocalSessionCrypto.encrypt(payload)
      Path(path).write_bytes(cipher)
  ```
- **建议**：添加异常捕获和日志

---

## 四、Cycle17 审查 — [SESS-03][US-04][FL-05][SH]

### 4.1 DoD 对照检查

| DoD 要求 | 状态 | 说明 |
|----------|------|------|
| LogoutHandler 实现 | ✅ 达成 | logout_handler.py |
| 依赖注入设计 | ✅ 达成 | api_logout, delete_session_file, broadcast_status |
| logout() 调用后端退出 | ✅ 达成 | try-finally 保证执行 |
| logout() 删除本地会话 | ✅ 达成 | finally 块中执行 |
| logout() 广播 "logged_out" | ✅ 达成 | 测试验证 |
| on_banned() 方法 | ✅ 达成 | 删除文件 + 广播 "banned" |
| api_logout 异常时仍删除文件和广播 | ✅ 达成 | try-finally 结构 |
| UT 覆盖核心分支 | ✅ 达成 | test_logout_handler_calls_api_delete_and_broadcast |

### 4.2 问题清单

#### C17-01：未与真实壳层集成

- **位置**：`dev/shell/logout_handler.py`
- **问题**：Python 实现仅为 PoC，未与 Electron/C++/C# 壳层集成
- **影响**：退出功能无法在真实客户端运行
- **状态**：与 Cycle12 相同问题，符合迭代规划

#### C17-02：无日志记录

- **位置**：`logout_handler.py`
- **问题**：api_logout 失败时静默处理，无日志
- **建议**：添加异常日志
  ```python
  try:
      self._api_logout()
  except Exception as e:
      logger.warning(f"API logout failed: {e}")
  finally:
      self._delete()
      self._broadcast("logged_out")
  ```

---

## 五、Cycle16 审查 — [SESS-03][US-04][FL-05][FE]

### 5.1 DoD 对照检查

| DoD 要求 | 状态 | 说明 |
|----------|------|------|
| 退出按钮/入口 | ❌ 未达成 | 前端无退出按钮 |
| logout() 函数 | ❌ 未达成 | 前端无退出脚本 |
| 调用 /api/passport/logout | ❌ 未达成 | 无调用代码 |
| 清理 localStorage | ❌ 未达成 | 仅在错误拦截器中清理 |
| 跳转登录页 | ❌ 未达成 | 无主动跳转 |
| 与 React 生产前端对齐 | ❌ 未达成 | React 中无退出组件 |

### 5.2 问题清单

#### C16-01：前端完全缺少退出功能（严重）

- **位置**：`frontend-react/src/`
- **问题**：没有退出按钮、没有退出脚本、没有调用退出 API
- **DoD 原文**：提供统一的"退出登录"入口和退出脚本
- **PRD 依据**：FL-05 用户主动退出流程
- **影响**：用户无法主动退出登录
- **建议**：在 Header 或用户菜单中添加退出按钮
  ```typescript
  // src/components/Header.tsx
  async function handleLogout() {
    try {
      await apiClient.post('/passport/logout', {
        access_token: localStorage.getItem('access_token')
      });
    } finally {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('guid');
      window.location.href = '/login';
    }
  }
  ```

#### C16-02：Python 前端骨架不存在

- **位置**：`dev/frontend/`
- **问题**：DoD 提到 `dev/frontend/logout/logout.js`，但该目录不存在
- **说明**：只有 React 前端实现

---

## 六、Cycle20 审查 — [SESS-03][US-04][FL-05][QA]

### 6.1 DoD 对照检查

| DoD 要求 | 状态 | 说明 |
|----------|------|------|
| 测试1：退出幂等性与会话删除 | ✅ 达成 | test_logout_deletes_session_and_is_idempotent |
| 测试1：退出后刷新失败 | ✅ 达成 | 验证 ERR_REFRESH_EXPIRED |
| 测试2：封禁联动 | ✅ 达成 | test_ban_user_sets_status_and_deletes_session |
| 测试2：封禁后登录失败 | ✅ 达成 | 验证 ERR_USER_BANNED |
| Python UT 全量回归 | ✅ 达成 | 37 tests passed |
| NestJS 测试覆盖 | ✅ 达成 | logoutByAccessToken 测试 |
| 行为与 BR-07/BR-08 一致 | ✅ 达成 | 退出=全局退出，封禁=立即失效 |

### 6.2 亮点

#### C20-亮点：完整的退出/封禁测试覆盖

- **位置**：`test_logout_cycle19_20.py`
- **说明**：测试覆盖了核心业务规则
  - 退出幂等性
  - 退出后刷新失败
  - 封禁状态更新
  - 封禁后登录拦截

### 6.3 问题清单

#### C20-01：缺少前端退出测试

- **位置**：项目全局
- **问题**：前端无退出功能，自然也无测试
- **影响**：无法验证前端退出行为

#### C20-02：缺少壳层-后端联调测试

- **位置**：项目全局
- **问题**：LogoutHandler 与真实 API 的联调未测试
- **影响**：无法验证完整退出链路

---

## 七、问题统计

| 严重程度 | Cycle16 | Cycle17 | Cycle18 | Cycle19 | Cycle20 | 合计 |
|----------|---------|---------|---------|---------|---------|------|
| ❌ 未达成 | 6 | 0 | 0 | 0 | 0 | 6 |
| ⚠️ 部分达成 | 0 | 2 | 1 | 2 | 2 | 7 |
| 总问题数 | 2 | 2 | 1 | 2 | 2 | 9 |

---

## 八、亮点总结

| 亮点 | Cycle | 说明 |
|------|-------|------|
| Python + NestJS 双栈实现 | Cycle19 | 退出登录后端逻辑完整 |
| 多 Token 传递方式 | Cycle19 | 支持 Body 和 Header |
| 完整封禁联动 | Cycle19 | 状态更新 + 会话删除 + 登录拦截 |
| 退出/封禁测试完善 | Cycle20 | 覆盖 BR-07/BR-08 核心规则 |
| try-finally 保证执行 | Cycle17 | API 失败也会清理本地 |

---

## 九、优先处理建议

### 9.1 阻塞项（需立即修复）

1. **C16-01**：前端完全缺少退出功能 — 用户无法主动退出

### 9.2 高优先级

1. **C19-01**：NestJS 添加 `logoutByGuid` 方法（后台管理需要）
2. **C19-02**：NestJS BanService 与 Python 对齐
3. **C17-01**：与真实壳层集成（生产环境需要）

### 9.3 中优先级

1. **C17-02**：壳层退出添加日志
2. **C18-01**：文件写入添加错误处理
3. **C20-01/02**：补充前端和联调测试

---

## 十、与前序 Cycle 累计问题

| 问题类型 | Cycle1-5 | Cycle6-10 | Cycle11-15 | Cycle16-20 | 总计 |
|----------|----------|-----------|------------|------------|------|
| 无全局 AuthState | 2 | 1 | 1 | 0 | 4 |
| 无前端单测 | 2 | 1 | 1 | 1 | 5 |
| 无 E2E 测试 | 1 | 3 | 1 | 1 | 6 |
| 未与真实壳层集成 | 1 | 0 | 1 | 1 | 3 |
| 无日志记录 | 1 | 2 | 2 | 1 | 6 |
| 前端功能缺失 | 0 | 0 | 0 | 1 | 1 |

---

## 十一、整体 Cycle1-20 总结

### 11.1 已完成能力

| 模块 | 能力 | 状态 |
|------|------|------|
| AUTH-01 | 手机号登录/注册 | ✅ 完整 |
| AUTH-01 | Token 刷新 | ✅ 完整 |
| AUTH-01 | Token 验证 | ✅ 完整 |
| SSO-02 | LocalSession 加解密 | ✅ 完整（含DPAPI） |
| SSO-02 | 壳层启动检查 | ✅ 骨架完成 |
| SSO-02 | 多 app 子会话 | ✅ 完整 |
| SESS-03 | 后端退出/封禁 | ✅ 完整 |
| SESS-03 | 壳层退出处理 | ✅ 骨架完成 |
| SESS-03 | 前端退出 | ❌ 缺失 |

### 11.2 待修复阻塞项（共6个）

1. C6-01：Redis 异常处理（C-02 决策）
2. C9-01：通用鉴权 AuthGuard
3. C11-01：SSO 数据从 IPC 获取
4. C12-01：壳层传递 LocalSession 数据
5. C15-01：网吧串号防护测试
6. **C16-01**：前端退出功能
