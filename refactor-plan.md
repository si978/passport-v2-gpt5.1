## Passport 统一认证中心重构总览

> 本文档由 AI 助手维护，用于在整个重构周期内持续记录：当前在做什么、已经做了什么、接下来要做什么。

### 1. 重构目标（高层）

- 提升代码与 PRD / DevPlan 的一致性，避免“实现跑偏需求”。
- 梳理并稳定认证/会话/SSO 的领域模型和服务边界。
- 为后续迭代（Hardening、性能与监控、安全强化）提供清晰的工程结构。

### 2. 当前代码与文档资产（初始扫描）

- 文档：
  - 根目录与 `dev-plan/` 下存在完整的 PRD、设计、周期性迭代计划；
  - 已确认《技术方案与架构设计》明确了「客户端壳层 + 原生模块 + Passport 服务」的整体拆分。
- 后端 Python：
  - `dev/backend/domain.py` 提供 User/Session/LoginLog 等领域模型与内存仓储、Token TTL 计算等；
  - `dev/backend/services.py` 实现手机号登录、Token 刷新、登出、封禁、用户查询、登录日志记录等核心服务；
  - `dev/tests/test_auth_cycle1_2.py` 等 UT 验证 BR-01/02/03/08/09 等业务规则，与 PRD/DevPlan 强耦合。
- 后端 Node（Nest）：`dev/backend-node`，包含完整 Nest 工程结构，但暂未细读业务实现与测试覆盖。
- 前端：
  - 老版前端：`dev/frontend`（login/logout/SSO + 简单 request 封装），偏 PoC；
  - React 前端：`dev/frontend-react`（Vite+React+Vitest+Playwright），更接近正式实现形态。
- 客户端壳层与原生模块：`dev/native`, `dev/shell` 已有实现，并通过 `dev/tests/test_sso_startup_cycle12_15.py` 等进行集成级验证（如本地会话文件校验、SSO 启动、登出广播等）。

### 3. 当前重构阶段与切入点（已决策：后端 Python 领域与会话主线优先）

> 状态：第一阶段聚焦「后端 Python 领域模型与认证服务」，作为统一认证中心的业务真相源（SoT）。

- 决策理由：
  - 现有 Python 后端与 UT（`dev/tests`）对 PRD 中的业务规则（BR-01/02/03/04/07/08/09 等）已有较完整映射，便于从「需求→实现」做一一对齐与重构；
  - 客户端壳层与原生模块在测试中依赖 Python 侧的 Session/Token 行为（例如多 app SSO 刷新逻辑），因此先稳定领域模型与会话契约，再驱动前端/壳层调整更稳妥；
  - Nest 后端目前更像未来可能的正式服务形态，但在没有完整对比前，不贸然切主栈，先把 Python 版打磨成“业务规范参考实现”。
- 第一阶段目标：
  - 梳理并重构 `dev/backend` 中的核心领域模型与服务边界，使其与 PRD/架构设计文档一一对应；
  - 通过补充/整理测试（`dev/tests`）确保关键登录/刷新/登出/封禁/SSO 场景在代码层有稳定验证；
  - 在 `refactor/backend/` 中搭建对外更清晰的服务接口（为后续 Nest 或其他技术栈迁移提供蓝本）。

### 4. 任务看板（高层条目）

以下任务会与工具中的 TODO 同步，作为人工可读版本：

1. 文档梳理
   - [ ] 快速通读核心 PRD 与架构/数据模型文档。
   - [ ] 阅读 `dev-plan/` 中关于重构与 Hardening 的规划，抓出对后端/前端影响最大的条目。

2. 现有实现盘点
   - [x] 梳理 `dev/backend` 的领域模型、服务接口、异常/日志策略。
   - [x] 梳理 `dev/tests` 中的关键用例（按 cycle 分组）。
   - [ ] 梳理 `dev/backend-node` 的模块划分、REST 接口、对外契约。
   - [ ] 梳理 `dev/frontend` 与 `dev/frontend-react` 的登录/登出/SSO 流程与 API 依赖。

3. 切入点决策
   - [x] 明确：重构第一阶段主战场（Python 后端认证服务）。
   - [x] 用 2~3 段话写出选择理由与预期收益。

4. 工程结构重构
   - [x] 在当前仓库下创建 `refactor/` 目录，用于承载新结构与迁移代码。
   - [x] 设计并落地新的目录/模块划分方案（后端优先，前端/测试待后续补充）。

5. 渐进式迁移与实现
   - [x] 针对选定切入点，编写/重构核心模块（含单元测试）。
   - [x] 为新增/修改行为补齐测试，保证关键路径可验证。

### 6. 当前阶段小结（自动更新）

- 2025-12-10：
  - 已完成：
    - 初步梳理 `dev/backend` 领域模型与服务；
    - 阅读关键单测（登录/验证码/封禁 + SSO 启动/多 app 刷新）；
    - 决策第一阶段聚焦 Python 后端；
    - 创建 `refactor/backend/` 并落地初版分层规划；
    - 抽取 `dev/backend/domain.py` 到 `refactor/backend/domain/__init__.py`，保持行为一致，用于后续作为领域真相源；
    - 在 `refactor/backend/application/auth.py` 中实现登录/刷新/登出用例服务，并构建镜像测试（已全部通过）：
      - `refactor/backend/tests/test_auth_usecases_mirror.py`；
      - `refactor/backend/tests/test_token_refresh_mirror.py`；
    - 在 `refactor/backend/application/admin.py` 中实现封禁/解封、用户查询、登录日志用例，并为其构建镜像测试：
       - `refactor/backend/tests/test_admin_usecases_mirror.py`；
    - 统一修正镜像测试中的异常类型对比逻辑：区分旧/新 `AuthError` 类型，仅对比错误码一致性；
    - 修正管理类镜像测试中预置会话的方式，改用 Session/AppSession 结构以与领域模型保持一致；
    - 运行并通过关键基线测试：
      - `python -m pytest dev/tests/test_auth_cycle1_2.py -q`；
      - `python -m pytest dev/tests/test_sso_startup_cycle12_15.py -q`。
  - 正在进行：
    - 规划第二阶段：如何让其他实现（Nest 后端 / 前端 / 壳层）以 `refactor/backend` 作为业务契约参考。

- 2025-12-15：
  - 已完成：
    - Nest 契约落地：`dev/backend-node/src/contracts/contracts.ts` + README；DTO/错误返回结构对齐契约；Jest 覆盖通过。
    - 前端契约化错误处理：Access 过期自动刷新+重放、封禁在登录页可展示友好提示；Vitest/Playwright 通过。
    - Python 参考实现：补齐关键错误码常量与 PoC 测试；全量 `npm test`（check:all）通过。

### 7. 第二阶段规划草案（待细化）

- 目标：
  - 让 Nest 后端、前端与壳层在错误码与 DTO 上完全对齐 `refactor/contracts`；
  - 保证未来任何一侧的改动都从契约文档出发，避免语义分叉。

- 关键工作包：
  1. 契约落地：
     - [x] 错误码与流程契约文档：`refactor/contracts/errors-and-flows.md`；
     - [x] Nest 对齐分析：`refactor/contracts/nest-alignment.md`；
     - [x] 核心 DTO 类型定义：`refactor/contracts/dto-types.md`。
  2. Nest 后端收敛：
     - [x] 在 `dev/backend-node` 内新建或引用一个与 `refactor/contracts/dto-types.md` 对应的 TS 类型定义文件；
     - [x] 调整 `LoginResponseDto` / `RefreshTokenDto` / `VerifyTokenDto` 等，使其与契约完全一致；
     - [x] 确保所有控制器在错误返回时统一使用 `ErrorResponse` 结构与契约中的错误码。
  3. 前端/壳层收敛：
     - [x] 为前端与壳层定义一个统一的错误码处理模块，直接依赖 `errors-and-flows.md` 中的策略；
     - [x] 梳理现有前端/壳层中对错误码的散落处理逻辑，并逐步迁移到统一处理模块上。
  4. Python 参考实现扩展：
     - [x] 在不影响当前单测的前提下，引入错误码契约 PoC 测试桩，覆盖新增错误码；
     - [ ] 如有必要，为 Access Token 校验用例添加实现，使其行为与 Nest 对齐。

### 5. 更新约定

- 每当重构阶段发生明显切换（例如：从“分析”进入“实现”，或从“后端”切到“前端”），需要更新本文件：
  - 在「当前重构阶段与切入点」中注明阶段与范围。
  - 在「任务看板」中勾选已完成项，并补充必要的新条目。
- 本文件只记录「为什么」「做了什么」「接下来做什么」，具体技术细节以代码与更细粒度的设计文档为准。
