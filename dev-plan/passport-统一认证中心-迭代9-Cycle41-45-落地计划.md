# Passport 统一认证中心 - 迭代 9 落地计划（Cycle41–45）

> 目标：在验证码发送与后台管理链路已经打通（Cycle21–35）的基础上，为 **验证码发送频率限制（BR-09 补完）与前端错误提示体验** 提供最小可用实现与测试，避免用户频繁点击“获取验证码”导致滥发或体验不佳。

本迭代聚焦 AUTH-01 / FL-06（发送验证码流程），主要改动集中在 NestJS 后端与 React 登录页，不改动 Python PoC 的核心行为，仅保持语义对齐。

---

## 一、Scope 与 Cycle 映射

- **Cycle41** = [AUTH-01][US-01][FL-06][BE] — NestJS VerificationCodeService 增加频率限制与 `ERR_CODE_TOO_FREQUENT`；
- **Cycle42** = [AUTH-01][US-01][FL-06][QA] — 补充 Jest UT 覆盖频率限制分支；
- **Cycle43** = [AUTH-01][US-01][FL-06][BE] — AuthExceptionFilter 支持新错误码并映射到 HTTP 429；
- **Cycle44** = [AUTH-01][US-01][FL-06][FE] — React 登录页对 `ERR_CODE_TOO_FREQUENT` 提示进行友好展示；
- **Cycle45** = [AUTH-01][US-01][FL-06][QA] — 回归验证：`npm test` + `npm run build` + Python UT，确保无回归。

---

## 二、Cycle41 — VerificationCodeService 频率限制（NestJS BE）

**目标**：在 NestJS 的 `VerificationCodeService.sendCode` 中加入最小频率限制：同一手机号在短时间内重复请求发送验证码时返回 `ERR_CODE_TOO_FREQUENT`，防止短时间内滥发。

**实现要点**：

- 修改 `src/auth/auth-error.ts`：
  - 新增错误码常量 `ERR_CODE_TOO_FREQUENT`，与 PRD BR-09 语义保持一致；
- 修改 `src/auth/verification-code.service.ts`：
  - 增加 `lastSentAt: Map<string, Date>` 内存结构；
  - 在 `sendCode(phone)` 中：
    - 若该 `phone` 上次发送时间距今小于 60 秒，则抛出 `AuthException(AuthErrorCode.ERR_CODE_TOO_FREQUENT, ...)`；
    - 否则更新 lastSentAt 后继续生成与保存验证码。

**DoD**：

- `/api/passport/send-code` 在同一手机号 60 秒内重复调用时返回带 `error_code=ERR_CODE_TOO_FREQUENT` 的错误响应；
- 不影响原有合法手机号/非法手机号逻辑及现有 UT。

---

## 三、Cycle42 — 频率限制 Jest 单元测试（NestJS QA）

**目标**：为新的频率限制逻辑补充 Jest UT，确保行为稳定可回归。

**实现要点**：

- 扩展 `src/auth/verification-code.service.spec.ts`：
  - 新增测试用例：
    - 调用 `sendCode(phone)` 一次成功；
    - 立即第二次调用同一手机号 `sendCode(phone)`，断言抛出 `AuthException` 且 `code=ERR_CODE_TOO_FREQUENT`。

**DoD**：

- 频率限制分支被 UT 覆盖；
- 执行 `npm test` 时所有测试通过。

---

## 四、Cycle43 — AuthExceptionFilter 映射 ERR_CODE_TOO_FREQUENT（NestJS BE）

**目标**：让全局异常过滤器正确处理 `ERR_CODE_TOO_FREQUENT` 错误码，并返回合适的 HTTP 状态码（429 Too Many Requests），便于前端识别节流错误。

**实现要点**：

- 修改 `src/auth/auth-exception.filter.ts`：
  - 在错误码 → HTTP 状态映射逻辑中加入 `ERR_CODE_TOO_FREQUENT` 分支，映射为 `429`；
- 可选：在 `auth-exception.filter.spec.ts` 中新增一条断言，验证 `ERR_CODE_TOO_FREQUENT` 时 `statusCode=429`。

**DoD**：

- 收到 `ERR_CODE_TOO_FREQUENT` 异常时，HTTP 响应状态为 429，body 中的 `error_code` 保持不变；
- 现有错误码行为不被破坏（401/403/400 等）。

---

## 五、Cycle44 — React 登录页错误提示优化（FE）

**目标**：在 React 登录页中对 `ERR_CODE_TOO_FREQUENT` 提供明确的错误提示，避免用户不明所以地重复点击“获取验证码”按钮。

**实现要点（dev/frontend-react）**：

- 修改 `src/features/auth/LoginPage.tsx` 中发送验证码的错误处理逻辑：
  - 捕获 Axios 错误时，判断 `error.response?.data?.error_code === 'ERR_CODE_TOO_FREQUENT'`；
  - 显示如“验证码发送过于频繁，请稍后再试”的提示（alert 或页面内错误提示区域）；
  - 其它错误保持现有行为不变。

**DoD**：

- 在本地后端返回 `ERR_CODE_TOO_FREQUENT` 时，用户能看到明确的频率限制提示；
- `npm run build` 通过。

---

## 六、Cycle45 — 回归验证与质量确认（全栈 QA）

**目标**：在完成上述改动后进行一次集中回归验证，确保后端 UT、Python PoC、前端构建均处于绿色状态，没有引入新的回归。

**执行项**：

- 运行 Python PoC UT：`python -m unittest discover -s dev/tests -p "test_*.py"`；
- 运行 NestJS UT（含覆盖率）：`cd dev/backend-node && npm test -- --coverage`；
- 构建 React 前端：`cd dev/frontend-react && npm run build`。

**DoD**：

- 三类验证全部通过，无新增错误；
- 覆盖率保持或略有提升，特别是在 VerificationCodeService 与 AuthExceptionFilter 上。
