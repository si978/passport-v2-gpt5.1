# Passport 统一认证中心 - Cycle11-15 专项审查报告

> 审查日期：2025-12-03  
> 审查范围：Cycle11-15（SSO-02 模块 FL-04）

---

## 一、Cycle 范围回顾

| Cycle | 标识 | 目标 | 角色 |
|-------|------|------|------|
| Cycle11 | [SSO-02][US-02][FL-04][FE] | SSO前端自动登录 | 前端 |
| Cycle12 | [SSO-02][US-02][FL-04][SH] | 壳层启动LocalSession检查 | 壳层 |
| Cycle13 | [SSO-02][US-02][FL-04][NM] | 原生模块LocalSession读写 | 原生 |
| Cycle14 | [SSO-02][US-02][FL-04][BE] | 后端SSO刷新支持 | 后端 |
| Cycle15 | [SSO-02][US-02][FL-04][QA] | SSO与网吧串号防护测试 | QA |

---

## 二、Cycle13 审查 — [SSO-02][US-02][FL-04][NM]（优先实现）

### 2.1 DoD 对照检查

| DoD 要求 | 状态 | 说明 |
|----------|------|------|
| LocalSessionCrypto.encrypt() | ✅ 达成 | 支持 DPAPI + base64 fallback |
| LocalSessionCrypto.decrypt() | ✅ 达成 | 解密失败抛出 ValueError |
| 密文不包含明文手机号 | ✅ 达成 | 测试验证 `assertNotIn(b"phone", cipher)` |
| LocalSessionValidator.validate() | ✅ 达成 | 返回 VALID/CORRUPTED/EXPIRED_LOCAL |
| 检查必填字段 | ✅ 达成 | guid/phone/created_at/expires_at |
| expires_at >= created_at 检查 | ✅ 达成 | 否则返回 CORRUPTED |
| 2小时阈值检查（C-03） | ✅ 达成 | 超过2h返回 EXPIRED_LOCAL |
| UT-SSO-LSC-ENC-01 加解密往返 | ✅ 达成 | test_encrypt_decrypt_roundtrip |
| UT-SSO-LSC-DEC-02 非法密文 | ✅ 达成 | test_decrypt_invalid_cipher_raises |
| UT-SSO-LSV-VAL-01/02/03 校验 | ✅ 达成 | 3个校验测试通过 |
| write/read/delete_session_file | ✅ 达成 | 文件操作实现 |

### 2.2 亮点

#### C13-亮点：已实现真实 DPAPI 支持

- **位置**：`local_session.py:27-99`
- **说明**：实现了完整的 Windows DPAPI 调用（CryptProtectData/CryptUnprotectData）
- **优点**：
  - Windows 平台使用真实 DPAPI 加密
  - 非 Windows 或 DPAPI 失败时自动 fallback 到 base64
  - 符合 PRD BR-06 安全要求
- **之前审查标记为高风险，现已解决**

### 2.3 问题清单

#### C13-01：DPAPI 失败降级无日志

- **位置**：`local_session.py:57, 85`
- **问题**：DPAPI 调用失败时静默降级为 base64，无任何日志或告警
- **风险**：可能在 Windows 上意外使用不安全的 base64 编码
- **建议**：添加警告日志
  ```python
  import logging
  logger = logging.getLogger(__name__)
  
  if not res:
      logger.warning("DPAPI CryptProtectData failed, falling back to base64")
      return base64.b64encode(raw)
  ```

#### C13-02：缺少 refresh_token 字段校验

- **位置**：`local_session.py:117`
- **问题**：`REQUIRED_FIELDS` 仅包含 `guid/phone/created_at/expires_at`
- **PRD 依据**：BR-06/DM-03 定义 LocalSession 需包含 `refresh_token`
- **当前实现**：
  ```python
  REQUIRED_FIELDS = {"guid", "phone", "created_at", "expires_at"}
  ```
- **建议**：添加 `refresh_token` 到必填字段
  ```python
  REQUIRED_FIELDS = {"guid", "phone", "created_at", "expires_at", "refresh_token"}
  ```

---

## 三、Cycle12 审查 — [SSO-02][US-02][FL-04][SH]

### 3.1 DoD 对照检查

| DoD 要求 | 状态 | 说明 |
|----------|------|------|
| SsoStartupHandler 实现 | ✅ 达成 | 依赖注入设计 |
| 调用 read_session_file() | ✅ 达成 | 通过回调函数 |
| VALID → broadcast "sso_available" | ✅ 达成 | 测试覆盖 |
| CORRUPTED → 删除文件 + "none" | ✅ 达成 | 测试覆盖 |
| EXPIRED_LOCAL → 删除文件 + "none" | ✅ 达成 | 测试覆盖 |
| FileNotFoundError → "none" | ✅ 达成 | 测试覆盖 |
| UT-SSO-SH-START-01/02/03/04 | ✅ 达成 | 4个测试通过 |
| 接口可被实际壳层对接 | ⚠️ 部分 | Python 实现，未与真实壳层集成 |

### 3.2 问题清单

#### C12-01：未传递 LocalSession 数据给前端

- **位置**：`sso_startup.py:35-43`
- **问题**：`broadcast_status` 仅传递状态字符串，未传递 `guid`/`refresh_token`
- **DoD 原文**：前端需要 `guid` 与 `refresh_token` 来调用刷新接口
- **当前实现**：
  ```python
  if status == ValidationStatus.VALID:
      self._broadcast("sso_available")  # 仅传递状态
  ```
- **建议**：扩展 broadcast 签名传递 LocalSession 数据
  ```python
  self._broadcast("sso_available", struct)  # 传递完整 LocalSession
  ```

#### C12-02：缺少解密异常处理

- **位置**：`sso_startup.py:28-32`
- **问题**：`read_session_file` 可能抛出 `ValueError`（解密失败），未捕获
- **当前实现**：仅捕获 `FileNotFoundError`
- **建议**：
  ```python
  try:
      struct = self._read()
  except FileNotFoundError:
      self._broadcast("none")
      return
  except ValueError:  # 解密失败
      self._delete()
      self._broadcast("none")
      return
  ```

#### C12-03：未与真实壳层集成

- **位置**：`dev/shell/`
- **问题**：Python 实现仅为 PoC，未与 Electron/C++/C# 壳层集成
- **影响**：SSO 功能无法在真实客户端运行
- **建议**：按目标平台实现真实壳层逻辑

---

## 四、Cycle11 审查 — [SSO-02][US-02][FL-04][FE]

### 4.1 DoD 对照检查

| DoD 要求 | 状态 | 说明 |
|----------|------|------|
| handleSessionStatus 函数 | ✅ 达成 | `ssoStartup.ts` |
| sso_available → 获取 Token | ⚠️ 部分 | 从 localStorage 获取，非从壳层 |
| sso_available → 调用刷新接口 | ✅ 达成 | `refreshWithSso()` |
| 刷新成功 → 更新 AuthState | ⚠️ 部分 | 仅更新 localStorage |
| 刷新成功 → 跳转主页 | ✅ 达成 | `window.location.href = '/'` |
| 刷新失败 → 回到登录页 | ✅ 达成 | catch 块跳转 |
| none → 保持登录页 | ✅ 达成 | 直接 return |
| 与通用请求封装集成 | ✅ 达成 | 使用 `apiClient` |
| 前端单元测试 | ❌ 未达成 | 无测试 |

### 4.2 问题清单

#### C11-01：SSO 数据来源不正确

- **位置**：`ssoStartup.ts:9-11`
- **问题**：从 `localStorage` 获取 `guid`/`refresh_token`，而非从壳层 IPC 获取
- **DoD 原文**：从 LocalStorage 或 LocalSession 中获取（假设壳层已同步写入）
- **当前实现**：
  ```typescript
  const guid = window.localStorage.getItem('guid');
  const refreshToken = window.localStorage.getItem('refresh_token');
  ```
- **问题分析**：
  - 首次启动时 localStorage 可能为空（其他客户端登录的）
  - 应由壳层通过 IPC 传递 LocalSession 数据
- **建议**：修改函数签名接收壳层数据
  ```typescript
  export async function handleSessionStatus(
    status: 'sso_available' | 'none',
    sessionData?: { guid: string; refresh_token: string }
  )
  ```

#### C11-02：app_id 硬编码

- **位置**：`ssoStartup.ts:3`
- **问题**：`SSO_APP_ID` 硬编码为 `'youlishe'`
- **影响**：其他客户端无法复用此代码
- **建议**：通过配置或参数传入

#### C11-03：刷新失败无错误提示

- **位置**：`ssoStartup.ts:18-20`
- **问题**：刷新失败直接跳转登录页，无任何用户提示
- **DoD 原文**：失败时"回到登录页，提示需重新登录"
- **当前实现**：
  ```typescript
  } catch {
    window.location.href = '/login';
  }
  ```
- **建议**：添加错误提示或在登录页显示消息

#### C11-04：缺少前端单元测试

- **位置**：`frontend-react/src/features/sso/`
- **问题**：无任何测试文件
- **DoD 原文**：行为与测试用例文档一致
- **建议**：使用 Vitest 测试 `handleSessionStatus` 各分支

---

## 五、Cycle14 审查 — [SSO-02][US-02][FL-04][BE]

### 5.1 DoD 对照检查

| DoD 要求 | 状态 | 说明 |
|----------|------|------|
| apps[app_id] 存在 → 更新 Access Token | ✅ 达成 | token.service.ts:44-48 |
| apps[app_id] 不存在 → 创建新 AppSession | ✅ 达成 | token.service.ts:49-54 |
| 不再将缺失视为 ERR_APP_ID_MISMATCH | ✅ 达成 | 逻辑正确 |
| 原有错误分支不受影响 | ✅ 达成 | 过期/不匹配正常工作 |
| SSO 多应用场景 UT | ✅ 达成 | test_cross_app_creates_new_app_session_for_sso |

### 5.2 亮点

#### C14-亮点：多 app 子会话设计完善

- **位置**：`token.service.ts:44-57`
- **说明**：正确实现了 SSO 场景下为新 app 创建独立 Access Token
- **优点**：
  - 共享 Refresh Token
  - 各 app 独立 Access Token
  - 符合 PRD DM-02 设计

### 5.3 问题清单

#### C14-01：SSO 刷新未记录日志

- **位置**：`token.service.ts:31-60`
- **问题**：SSO 场景下创建新 app session 无日志记录
- **影响**：无法追踪 SSO 跨应用登录行为
- **建议**：添加审计日志
  ```typescript
  if (!appSession) {
    this.audit.recordSsoLogin(session.guid, dto.app_id);  // 记录 SSO 登录
  }
  ```

---

## 六、Cycle15 审查 — [SSO-02][US-02][FL-04][QA]

### 6.1 DoD 对照检查

| DoD 要求 | 状态 | 说明 |
|----------|------|------|
| TC-SSO-FL04-001 正常 SSO | ✅ 达成 | test_startup_with_valid_local_session |
| TC-SSO-FL04-002 LocalSession 缺失 | ✅ 达成 | test_startup_with_missing_file |
| TC-SSO-FL04-003 LocalSession 损坏 | ⚠️ 部分 | 通过 validator 测试间接覆盖 |
| TC-SSO-FL04-004 超过2小时阈值 | ✅ 达成 | test_startup_with_expired_local_session |
| TC-SSO-FL04-005 多应用 SSO | ✅ 达成 | test_multi_app_sso_refresh |
| 网吧串号场景测试 | ❌ 未达成 | 无串号防护测试 |
| 逻辑级集成测试 | ✅ 达成 | 串联多组件测试 |

### 6.2 问题清单

#### C15-01：缺少网吧串号防护测试

- **位置**：`test_sso_startup_cycle12_15.py`
- **问题**：DoD 要求"网吧串号相关场景得到覆盖"，但无相关测试
- **PRD 依据**：AC-02/AC-04 要求不出现"B 直接进 A 账号"
- **建议**：添加测试场景：
  ```python
  def test_netbar_scenario_no_session_leak(self):
      """模拟：A 用户登录后下机，B 用户启动客户端不应看到 A 的会话"""
      # 1. A 用户登录，创建 LocalSession
      # 2. 模拟下机（删除文件或超时）
      # 3. B 用户启动，验证收到 "none"
  ```

#### C15-02：缺少 CORRUPTED 场景直接测试

- **位置**：`test_sso_startup_cycle12_15.py`
- **问题**：无直接测试 LocalSession 损坏（如 JSON 格式错误）场景
- **当前覆盖**：仅通过 validator 单元测试间接覆盖
- **建议**：添加 SsoStartupHandler 处理损坏文件的测试

#### C15-03：缺少前后端联调测试

- **位置**：项目全局
- **问题**：DoD 要求"从逻辑层面验证 SSO 主流程"，但前端未参与测试
- **影响**：无法验证前端 `handleSessionStatus` 与壳层的协作

---

## 七、问题统计

| 严重程度 | Cycle11 | Cycle12 | Cycle13 | Cycle14 | Cycle15 | 合计 |
|----------|---------|---------|---------|---------|---------|------|
| ❌ 未达成 | 1 | 1 | 0 | 0 | 1 | 3 |
| ⚠️ 部分达成 | 3 | 1 | 0 | 0 | 1 | 5 |
| 总问题数 | 4 | 3 | 2 | 1 | 3 | 13 |

---

## 八、亮点总结

| 亮点 | Cycle | 说明 |
|------|-------|------|
| DPAPI 真实实现 | Cycle13 | Windows 平台使用真实加密，解决之前标记的安全问题 |
| 多 app 子会话 | Cycle14 | 正确实现 SSO 共享 Refresh + 独立 Access |
| 依赖注入设计 | Cycle12 | 壳层组件可测试性好 |
| 完整校验逻辑 | Cycle13 | 2小时阈值 + 字段校验符合 PRD |

---

## 九、优先处理建议

### 9.1 阻塞项（需立即修复）

1. **C11-01**：SSO 数据应从壳层 IPC 获取，而非 localStorage
2. **C12-01**：壳层应传递 LocalSession 数据给前端
3. **C15-01**：添加网吧串号防护测试

### 9.2 高优先级

1. **C12-02**：处理解密异常（ValueError）
2. **C13-02**：添加 refresh_token 到必填字段校验
3. **C11-03**：刷新失败添加用户提示
4. **C12-03**：与真实壳层集成

### 9.3 中优先级

1. **C13-01**：DPAPI 失败添加警告日志
2. **C11-02**：app_id 通过配置传入
3. **C11-04**：添加前端单元测试
4. **C14-01**：SSO 刷新添加审计日志

---

## 十、与前序 Cycle 累计问题

| 问题类型 | Cycle1-5 | Cycle6-10 | Cycle11-15 | 总计 |
|----------|----------|-----------|------------|------|
| 无全局 AuthState | 2 | 1 | 1 | 4 |
| 无前端单测 | 2 | 1 | 1 | 4 |
| 无 E2E 测试 | 1 | 3 | 1 | 5 |
| 未与真实壳层集成 | 1 | 0 | 1 | 2 |
| 无日志记录 | 1 | 2 | 2 | 5 |
