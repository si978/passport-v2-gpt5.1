# Passport 统一认证中心 - 迭代 8 落地计划（Cycle36–40）

> 目标：在认证与后台管理主链路已打通（Cycle1–35）的基础上，通过补充 **NestJS 后端的单元测试与基础设施级验证**，进一步提升 SessionStore、GUID 生成、验证码、Token 验证与控制器层的可靠性与覆盖率，为后续性能与观测性优化打下坚实基础。

本迭代聚焦 **后端质量与覆盖率**，不引入新的业务功能，避免对现有行为产生破坏性影响。

---

## 一、Scope 与 Cycle 映射

- **Cycle36** = [SESS-03][US-04][INF][BE-QA] — SessionStore 单元测试（Redis 封装 PoC 验证）；
- **Cycle37** = [AUTH-01][US-01][INF][BE-QA] — GuidGenerator 单元测试（GUID 格式与语义）；
- **Cycle38** = [AUTH-01][US-01][FL-06][QA] — VerificationCodeService 过期分支补充 UT；
- **Cycle39** = [AUTH-01][US-01][FL-03][QA] — TokenService.verifyAccessToken 成功/失败分支 UT；
- **Cycle40** = [AUTH-01][US-01][FL-02/03][QA] — AuthController 刷新/验证端点 UT 补齐。

> 说明：本迭代所有工作均限定在 `dev/backend-node` 目录下的 Jest UT 与少量测试辅助类型，不修改生产行为，仅提升测试覆盖率与回归防护能力。

---

## 二、Cycle36 — SessionStore 单元测试（SESS-03 INF BE-QA）

**目标**：为 `SessionStore` 提供单元测试，验证 Redis 封装的 key 生成、put/get/delete 与 `findByAccessToken` 行为，确保会话存取逻辑可靠。

**实现要点**：

- 新增 `src/auth/session-store.spec.ts`：
  - 使用内存实现的 `FakeRedis`（包含 `set/get/del/scanStream` 方法），不依赖真实 Redis 实例；
  - UT1：
    - 调用 `put` 写入 Session → 通过 `get` 取出并深度比较；
    - 调用 `delete` 后 `get` 返回 `null`；
    - 断言 `set` 调用使用了 `EX` 选项且 TTL = 2 天（与常量一致）。
  - UT2：
    - 在 `FakeRedis` 中预置一条包含指定 `accessToken` 的 Session JSON；
    - 调用 `findByAccessToken` 返回对应 Session；
    - 调用不存在的 Token 时返回 `null`。

**DoD**：

- `SessionStore` 所有方法在 UT 中有覆盖，且不依赖外部 Redis；
- 相关测试纳入 `npm test -- --coverage` 并通过。

---

## 三、Cycle37 — GuidGenerator 单元测试（AUTH-01 INF BE-QA）

**目标**：验证 `GuidGenerator.generate` 的 GUID 格式与语义：
- 前 8 位为日期 `YYYYMMDD`；
- 接着 2 位为 userType（左侧补 0）；
- 之后 10 位为纯数字随机串；
- 总长度为 20。

**实现要点**：

- 新增 `src/auth/guid-generator.spec.ts`：
  - 使用固定时间 `new Date('2025-01-02T03:04:05Z')` 作为 now；
  - 临时 stub `Math.random` 为固定值（例如 `0.1`），生成可预测随机部分（全为某一数字）；
  - 断言：
    - 结果长度为 20；
    - 前 8 位等于 `20250102`；
    - 第 9–10 位等于 `userType` 的 2 位左补零形式；
    - 后 10 位均为数字且与预期随机串一致。

**DoD**：

- GuidGenerator 的 UT 覆盖上述语义，避免未来重构时破坏 BR-01 GUID 规则。

---

## 四、Cycle38 — VerificationCodeService 过期分支 UT（AUTH-01 FL-06 QA）

**目标**：为 `VerificationCodeService.validateCode` 补齐“验证码过期（ERR_CODE_EXPIRED）”分支 UT，使 Node 侧行为与 Python PoC 完全对齐。

**实现要点**：

- 扩展 `src/auth/verification-code.service.spec.ts`：
  - 新增测试：
    - 调用 `saveCode(phone, code, ttlSeconds=0)` 生成立即过期的记录；
    - 使用未来时间 `now = new Date(Date.now() + 1000)` 调用 `validateCode(phone, code, now)`；
    - 断言抛出 `AuthException` 且 `code = ERR_CODE_EXPIRED`。

**DoD**：

- 三种核心验证码错误分支（无记录/过期/值不匹配）在 UT 中均被覆盖。

---

## 五、Cycle39 — TokenService.verifyAccessToken UT（AUTH-01 FL-03 QA）

**目标**：为 `TokenService.verifyAccessToken` 补齐成功/失败分支 UT：
- 成功返回 guid/app_id/expires_at；
- Access Token 不存在 → `ERR_ACCESS_INVALID`；
- Access 过期 → `ERR_ACCESS_EXPIRED`；
- app_id 不匹配 → `ERR_APP_ID_MISMATCH`。

**实现要点**：

- 扩展 `src/auth/token.service.spec.ts`：
  - 使用现有的 `InMemorySessionStore` 辅助类，构造不同 Session：
    - 正常 Session：含一个 app 子会话，未过期；
    - 不存在 Token：store 中无匹配；
    - 过期 Token：`accessTokenExpiresAt` 早于现在；
    - app_id 不匹配：Token 属于某 appId，但请求 DTO 中传入不同 app_id。
  - 对每个场景调用 `verifyAccessToken(dto)` 并断言返回值或 `AuthException.code`。

**DoD**：

- `verifyAccessToken` 的主要分支均被 UT 覆盖，与 Python TokenValidator 行为保持一致。

---

## 六、Cycle40 — AuthController 刷新/验证端点 UT（AUTH-01 FL-02/03 QA）

**目标**：在 `AuthController` 现有单测基础上，补齐刷新与验证端点的 UT，确保路由参数与 DTO 绑定以及对 TokenService 的委托行为可靠。

**实现要点**：

- 扩展 `src/auth/auth.controller.spec.ts`：
  - 新增：
    - 对 `refreshTokenForGuid(guid, dto)` 的测试：
      - 断言 `TokenService.refreshAccessToken` 被正确调用（guid 与 dto 参数）；
    - 对 `refreshTokenCurrent(dto)` 的测试：
      - 传入带有 `guid` 的 DTO，断言 `refreshAccessToken` 被调用一次且参数为 `(dto.guid, dto)`；
    - 对 `verifyToken(dto)` 的测试：
      - mock 返回值，并断言 controller 直接透传返回值且调用参数正确。

**DoD**：

- AuthController 所有公开端点在 UT 中至少有一条 happy path 覆盖；
- 与 TokenService 的参数约定在 UT 中受约束，降低未来重构时出错风险。

---

## 七、迭代 8 验收条件

1. NestJS：
   - `npm test -- --coverage` 通过，SessionStore / GuidGenerator / VerificationCodeService / TokenService / AuthController 新增 UT 全部通过；
   - 覆盖率相较迭代 7 有明显提升，尤其是 `session-store.ts` 与 `guid-generator.ts`。
2. Python / React：
   - `python -m unittest discover -s dev/tests -p "test_*.py"` 仍全部通过；
   - `cd dev/frontend-react && npm run build` 成功，前端不受影响。

满足以上条件，即可认为迭代 8（Cycle36–40）在“不改变业务行为”的前提下显著提升了 NestJS 后端的测试覆盖率与质量保障能力。
