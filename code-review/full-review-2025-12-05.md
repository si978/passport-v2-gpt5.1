# Passport 统一认证中心 - 全量代码审查（2025-12-05）

## 范围
- dev/backend (Python PoC)、dev/shell、dev/native
- dev/backend-node (NestJS)
- dev/frontend 与 dev/frontend-react（含 Vitest/Playwright 测试）

## 发现的问题
1. **[High] React 登录未持久化 Refresh Token**（`frontend-react/src/features/auth/LoginPage.tsx`）  
   仅保存 `guid` 与 `access_token`，未保存 `refresh_token`。结果：Access Token 过期后无法调用 `/passport/{guid}/refresh-token` 或 SSO 场景，后台管理页也缺少刷新凭证。应在登录成功时写入 `refresh_token`（与旧版 `frontend/login.js`、后端响应一致），并在退出时清理。

2. **[Medium] 前端未处理被封禁错误码**（`frontend-react/src/api/client.ts` 拦截器）  
   后端封禁用户返回 `ERR_USER_BANNED`（HTTP 403），拦截器不会清理本地 Token 或跳转登录，用户停留在受限页面且持有失效 Token。建议对 `ERR_USER_BANNED` 做与 `ERR_ACCESS_INVALID` 相同的清理与跳转处理，并提示封禁原因。

3. **[Low] 登录页验证码倒计时缺少卸载清理**（`frontend-react/src/features/auth/LoginPage.tsx`）  
   `setInterval` 定时器未在组件卸载时清除，重复进入页面会产生悬空定时器并触发对已卸载组件的 `setState` 警告。应使用 `useEffect` 搭配 `clearInterval` 或改用 `setTimeout` 驱动倒计时。

4. **[Medium] 刷新 Token 接口缺少 DTO 校验与文档字段**（`backend-node/src/auth/auth.controller.ts`）  
   `POST /passport/refresh-token` 使用 `RefreshTokenDto & { guid: string }`，但 DTO 未声明 `guid` 且 Swagger 仍引用 `RefreshTokenDto`，导致缺少必填字段校验与 API 文档遗漏 guid。请求未携带 guid 时直接传 `undefined` 进入服务层。应新增 `RefreshTokenWithGuidDto`（含 `@IsString guid`）并用于参数与文档。

5. **[Medium] 频率限制与验证码存储仅在单机内存**（`backend-node/src/auth/rate-limit.service.ts`, `verification-code.service.ts`）  
   计数 Map/验证码 Map 没有过期清理，IP/手机号维度高时会持续增长；多实例部署下各节点独立计数，限流与验证码校验都会失效。应改用 Redis（带 TTL）实现滑动窗口计数与验证码存储，并为 Map 增加按时间的逐出策略作为退路。

6. **[Low] Session Redis TTL 与 refresh 过期时间不一致**（`backend-node/src/auth/session-store.ts`, `auth.service.ts`）  
   每次刷新会调用 `put` 重置 Redis TTL 为 2 天，但 `refreshTokenExpiresAt` 在逻辑层保持首次登录时间的 +2 天，导致 refresh 实际到期后会话仍驻留 Redis（无功能风险但占用内存），且 TTL 与声明的过期时间不一致。应在刷新时同步延长 `refreshTokenExpiresAt` 或保持 Redis TTL 与该字段对齐，不要在刷新时无条件重置 TTL。

7. **[Low] Python Token 校验为全表线性扫描**（`backend/token_validator.py`)  
   `validate_access_token` 逐个 Session 与 app 遍历查找 Token，复杂度 O(N)。在并发或大规模会话下不可接受。可按 Token 前缀拆出 GUID（与 Node 版同样格式）或维护 Token→Session 的索引以实现 O(1) 查询。

---
以上问题按严重度排序，建议优先修复 1-5 项以恢复刷新链路与安全防护能力。
