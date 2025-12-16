Passport 契约（Nest 侧引用）

- `contracts.ts` 提供跨实现一致的 DTO 与错误码定义。
- 与 `refactor/contracts` 文档一致，用作 Nest 层的单一来源。

使用约定：
- DTO 类 `implements` 对应类型，保留 swagger 装饰器。
- 错误码统一引用 `ContractAuthErrorCode`，避免字符串分叉。
- 控制器/过滤器返回 `ErrorResponse { code, message }` 结构。
