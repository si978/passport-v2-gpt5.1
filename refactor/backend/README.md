## Passport 后端重构结构（Python 参考实现）

> 目标：在不破坏现有单测（`dev/tests`）前提下，逐步将 `dev/backend` 中的领域与服务逻辑梳理为更清晰的分层结构，为未来的 Nest 服务或其他实现提供业务真相源（SoT）。

### 1. 目标分层（规划）

- `domain/`：
  - 领域实体与值对象：如 `User`, `Session`, `AppSession`, `LoginLog`；
  - 领域规则：Token 生命周期计算、错误码常量、GUID 生成策略等；
  - 领域服务（如需要）：纯业务规则，不依赖具体存储或框架。
- `application/`：
  - 用例服务：登录、刷新、退出登录、封禁/解封、用户查询、登录日志查询；
  - 面向上层（API/壳层）的统一接口与 DTO，屏蔽内部细节。
- `infra/`：
  - 当前为内存版本：`InMemoryUserRepo`, `InMemorySessionStore`, `InMemoryLoginLogRepo`；
  - 为将来接入 Redis/DB/外部服务预留接口层（如 `UserRepo`, `SessionStore` 协议）。

> 说明：初期重构会以 `dev/backend/domain.py` 和 `dev/backend/services.py` 为蓝本，将其逻辑拆分迁移到上述结构中，并保持测试仍然可运行。

### 2. 旧实现 ↔ 新分层 对照表

- 登录/注册流程：
  - 旧：`dev/backend/services.py::AuthService`
  - 新：`refactor/backend/application/auth.py::AuthUseCase`
- Token 刷新：
  - 旧：`dev/backend/services.py::TokenService`
  - 新：`refactor/backend/application/auth.py::TokenRefreshUseCase`
- 退出登录：
  - 旧：`dev/backend/services.py::LogoutService`
  - 新：`refactor/backend/application/auth.py::LogoutUseCase`
- 封禁/解封：
  - 旧：`dev/backend/services.py::BanService`
  - 新：`refactor/backend/application/admin.py::BanUseCase`
- 后台用户查询：
  - 旧：`dev/backend/services.py::UserQueryService`
  - 新：`refactor/backend/application/admin.py::UserQueryUseCase`
- 登录日志记录/查询：
  - 旧：`dev/backend/services.py::LoginLogService`
  - 新：`refactor/backend/application/admin.py::LoginLogUseCase`

> 说明：以上所有新用例均已通过 `refactor/backend/tests` 目录下的镜像测试，与旧实现的关键行为（错误码、会话结构与排序规则等）保持一致。

### 3. 渐进式迁移策略

1. 第一阶段：抽取领域模型
   - 从现有 `dev/backend/domain.py` 中抽取实体、错误码与时间计算逻辑到 `refactor/backend/domain/`；
   - 保持接口与语义与现有实现一致，避免影响单测；
   - 引入必要的抽象接口（例如 `UserRepo`, `SessionStore` 协议类型），但仍以内存实现为主。

2. 第二阶段：重组应用服务
   - 参考 `dev/backend/services.py`，将登录/刷新/登出/封禁/查询等流程移动至 `application/` 层；
   - 将输入/输出结构（类似 `LoginResult`）稳定下来，并加注释与 PRD 条款映射；
   - 在不立刻改动原 `dev/backend/services.py` 对外接口的前提下，引入一层“代理/门面”，让旧代码调用新结构。

3. 第三阶段：对外契约与文档
   - 在本目录下补充接口说明（参数、返回值、错误码）；
   - 为 Nest/其他语言实现编写“对照表”：领域模型与用例在本 Python 参考实现中的定义与行为；
   - 为前端/壳层整理一份「错误码与场景」速查表，方便接口消费者正确处理结果。

### 4. 与现有目录的关系

- 现有目录：
  - `dev/backend/*.py`：当前正在被单测使用的实现，不会一次性删除或替换；
  - `dev/tests/*.py`：重构过程中的可靠保障，优先保持其用例通过。
- 重构目录：
  - `refactor/backend/domain/`：新整理的领域模型与规则；
  - `refactor/backend/application/`：重构后的用例服务；
  - `refactor/backend/infra/`：内存实现以及未来的持久化实现。

### 5. 更新约定

- 每当完成以下动作之一，应更新本 README 或上层 `refactor-plan.md`：
  - 新增或重构领域实体/服务，使其与 PRD/技术方案有明确对应关系；
  - 完成一组用例服务迁移，并确保相关单测通过；
  - 引入新的基础设施实现（例如 Redis 会话存储），或者修改对外接口契约。
