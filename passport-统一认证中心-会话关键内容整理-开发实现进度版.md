# Passport 统一认证中心 - 会话关键内容整理（开发实现进度版 v1.0）

> 目的：在 PRD / Q-xx / C-xx、多视图审查与开发阶段入口/测试TDD版等整理文档基础上，本文件聚焦**“代码实现与工程状态”**视角，总结：
> - 当前代码仓库中各技术栈（Python PoC / NestJS / React）的实现边界与作用；
> - 已完成的迭代（Cycle1～60）在代码层面的落点与测试覆盖情况；
> - 新加入工程同学从“文档 → 代码 → 测试”的推荐切入路径。
>
> 说明：本文件**不修改任何需求**，所有需求与约束仍以 `passport-统一认证中心-PRD-草稿.md`（v1.1）为唯一权威需求文档（SSoT）。本文件只对“会话 + 代码实现进度”的关键信息做导航与摘要。

---

## 0. 适用范围与与现有整理文档的关系

### 0.1 适用 PRD 与决策范围

- **PRD 版本**：`Passport 统一认证中心 - PRD（V1 多视图对齐版）`（v1.1，文件：`passport-统一认证中心-PRD-草稿.md`）。
- **产品 / 业务层决策**：Q-01 ～ Q-19（`passport-统一认证中心-PRD-审查与决策汇总-已决策.md`）。
- **工程 / 架构层决策**：C-01 ～ C-07（`passport-统一认证中心-多视图冲突与决策清单-已决策.md`）。

### 0.2 与其它“会话关键内容整理”文档的分工

| 文件名 | 阶段 / 视角 | 角色定位 | 建议用途 |
| ------ | ----------- | -------- | -------- |
| `passport-统一认证中心-会话关键内容整理.md` | 多视图审查收敛后 | **多视图已决策版**：详细梳理 Q-xx / C-xx 与 6 个工程视图关系 | 想系统理解“当时如何从多视图收敛到一个 PRD”时阅读 |
| `passport-统一认证中心-会话关键内容整理-历史v1.md` | PRD v1.0，仅 Q-xx | 仅产品层历史快照 | 历史追溯，不再用于开发决策 |
| `passport-统一认证中心-会话关键内容整理-开发入口.md` | 刚进入开发阶段 | **开发入口版**：告诉你“应该先看哪些需求文档 / 视图 / 决策” | 第一次接手项目时的入口导航 |
| `passport-统一认证中心-会话关键内容整理-开发与测试TDD版.md` | Dev Plan / 测试 / UT 设计成型后 | **开发 & 测试 & TDD 版**：从 Dev Plan / 测试用例 / 单测设计角度总结会话结论 | 正在做任务拆分 / 写测试时阅读 |
| `passport-统一认证中心-会话关键内容整理-开发实现进度版.md` | 迭代 1～12（Cycle1～60）完成后 | **本文件：实现与工程状态版**：从代码与测试实现角度总结会话关键结论 | 需要快速了解“现在代码做到哪一步 / 去哪看代码 / 如何跑测试”时阅读 |

> 简单记忆：
> - 想知道“需求从哪来 → PRD 怎么长成现在这样”：看 **多视图已决策版**；
> - 想开始“从 0 写代码 / 写测试”：看 **开发入口版 + 开发与测试TDD版**；
> - 想知道“现在代码/测试已经做到什么程度、入口在哪”：看 **本开发实现进度版**。

---

## 1. 代码仓库结构与各技术栈职责总览

> 下面仅列出与 Passport 统一认证中心直接相关、且在会话中已有明确定位的代码目录。

### 1.1 顶层目录（根目录）

- `passport-统一认证中心-PRD-*.md`：PRD 主文档 + 审查 / 决策相关文档（Q/C）。
- `passport-统一认证中心-技术方案与架构设计.md`：整体技术方案与架构分层设计。
- `passport-统一认证中心-数据模型与数据库设计.md`：数据模型与 DB Schema 设计。
- `passport-统一认证中心-性能与监控设计方案.md`：性能目标、监控指标与接入方案。
- `passport-统一认证中心-日志与审计设计.md`：日志与审计（Audit）相关设计。
- `passport-统一认证中心-开发进度总结.md`：按迭代聚合的开发进度总结（更偏“时间线视角”）。

### 1.2 `dev/` 目录（实际代码）

- `dev/backend-node/`：NestJS 后端实现 **（生产级后端主栈）**。
  - `src/auth/`：认证域主实现（用户 / Token / 验证码 / 会话 / SSO / 后台 / 指标 / 审计）。
  - `src/app.module.ts`：应用模块装配（TypeORM + AuthModule）。
  - `src/main.ts`：Nest 应用入口（HTTP 服务器启动、全局前缀等）。
- `dev/frontend-react/`：React 18 + TypeScript + Vite 前端 **（生产级前端主栈）**。
  - 登录页 / 后台用户列表 / 活跃表页面等骨架与 API 对接。
- `dev/tests/`：Python PoC 版领域模型与服务 + 对应单元测试 **（逻辑 PoC / 规格参考实现）**。
  - 通过 `python -m unittest discover -s dev/tests -p "test_*.py"` 运行。

### 1.3 三个技术栈的定位

- **Python PoC（`dev/tests` 下的实现）**：
  - 作用：提供领域模型 / 服务的“概念验证 + 规格参考实现”，帮助在不受框架约束的情况下验证业务规则正确性；
  - 覆盖：登录 / 注册、Token 刷新与验证、本地会话、后台查询、封禁/解封、登录日志等；
  - 当前状态：约 37 条 UT 全部通过，用作逻辑验证与回归参考。

- **NestJS 后端（`dev/backend-node`）**：
  - 作用：面向生产环境的后端服务实现，包含 API、数据访问、会话管理、监控与审计等；
  - 核心模块：`AuthModule` + `AuthController` / `AdminController` / `AuthService` / `TokenService` / `VerificationCodeService` / `SessionStore` / `MetricsService` / `AuditLogService` 等；
  - 当前状态：Jest UT 覆盖率约 **86.77% 语句 / 64.7% 分支 / 95.65% 函数 / 87.77% 行**（其中 `src/auth` 目录 ~90%+ 语句覆盖）。

- **React 前端（`dev/frontend-react`）**：
  - 作用：提供登录 / 验证码交互、SSO 引导、后台管理界面（用户列表 / 活跃明细等）的前端实现；
  - 当前状态：`npm run build` 构建通过，可作为集成联调与 UI 演示基础。

---

## 2. 迭代与实现进度按阶段整理（Cycle1～60）

> 下表从“代码完成度”视角，将会话中的迭代（Cycle）按阶段分类，仅列关键结论；更细的时间线可参考《passport-统一认证中心-开发进度总结.md》与 Dev Plan。

### 2.1 迭代 1～4：Python PoC 核心认证逻辑（Cycle1～20）

- 覆盖内容：
  - 登录 / 注册主流程：手机号 + 验证码登录、新用户创建、封禁 / 注销用户处理（对应 BR-02 / Q-11 / C-01）。
  - Token 刷新与验证：Access/Refresh 生命周期、app_id 校验、错误码（ERR_REFRESH_EXPIRED / ERR_ACCESS_EXPIRED 等）。
  - SSO 本地会话：2 小时创建时间阈值、2 天生命周期、Temp+ProgramData 组合策略（BR-03/06、Q-03/05/07/08/12、C-03）。
  - 退出与封禁联动：退出=全局退出、封禁立即失效、LoginLog 与 Session 删除（BR-07/08、C-02）。
- Python UT：约 30+ 条，全部通过，为后续 NestJS / React 实现提供“业务真值表”。

### 2.2 迭代 5～7：生产栈骨架与后台 PoC（Cycle21～35）

- NestJS：
  - 初版 `AuthModule` / `AuthService` / `TokenService` / `VerificationCodeService` / `SessionStore` / `GuidGenerator` 等落地；
  - 完成验证码发送与校验、Token 刷新与验证、基础登录 / 退出链路。
- React：
  - 登录页 / 后台用户列表页骨架，与后端 API 建立最小可用对接。
- Python：
  - 补齐后台用户查询 / 封禁 / 解封逻辑的 PoC 实现与 UT。

### 2.3 迭代 8～10：NestJS 单元测试与观测性（Metrics）（Cycle36～50）

- NestJS UT 增强：
  - 为 `AuthService` / `TokenService` / `VerificationCodeService` / `SessionStore` / `GuidGenerator` / `AuthExceptionFilter` / `AdminService` / `AuthController` / `AdminController` 等编写系统性 UT；
  - 覆盖登录/注册/刷新/验证/退出/封禁/解封主要分支与错误码映射。
- Metrics 接入：
  - `MetricsService`：记录登录成功/失败、验证码发送失败、刷新失败等计数；
  - `AuthController`：在登录 / 发码 / 刷新接口中按 `AuthException` 分支打点；
  - `AdminController`：新增 `GET /api/admin/metrics` 接口返回当前指标快照；
  - 相应 Jest UT 验证 Metrics 调用行为。
- 覆盖率：
  - `src/auth` 目录语句覆盖约 90%+，函数覆盖约 96%+，在迭代 8～10 末期达到较高稳定水平。

### 2.4 迭代 11：健康检查（Health Check）（Cycle51～55）

- 新增 `HealthController`：
  - 路径：`GET /api/health`（在 `main.ts` 中存在全局前缀 `api` 时为 `/api/health`）；
  - 返回内容：`{ status: 'ok', timestamp: ISOString, uptime: number }`，适合作为 liveness 探针。
- Jest UT：
  - `health.controller.spec.ts` 验证 `status` 值、`timestamp` 可被 `Date.parse`、`uptime` 为非负数。

### 2.5 迭代 12：审计日志（Audit Log）（Cycle56～60）

- 内存版审计日志服务：
  - 文件：`src/auth/audit-log.service.ts`；
  - 接口：`recordLogin` / `recordLogout` / `recordBan` / `recordUnban` / `getEntries` / `clear`；
  - 记录字段：`type`（login/logout/ban/unban）、`guid`、`phone`、`at`（ISO 时间）、`meta`。
- 控制器接入：
  - `AuthController.loginByPhone` 成功时记录 login（含 guid 与 phone）；
  - `AuthController.logout` 在实际调用 `logoutByAccessToken` 后记录 logout（含 accessToken）；
  - `AdminController.banUser/unbanUser` 在调用 `AdminService` 成功后分别记录 ban/unban。
- Jest UT：
  - `audit-log.service.spec.ts`：验证记录顺序与内容、`clear` 行为；
  - `auth.controller.spec.ts`：验证登录/退出时正确调用审计方法，且不影响原有业务 / Metrics 行为；
  - `admin.controller.spec.ts`：验证封禁/解封时调用 `recordBan/recordUnban`。

---

## 3. 当前测试与验证体系概况

### 3.1 Python PoC 测试

- 运行命令：

```bash
python -m unittest discover -s dev/tests -p "test_*.py"
```

- 覆盖范围：
  - 认证领域核心逻辑（登录/刷新/验证/退出/封禁/解封）；
  - SSO 本地会话策略与边界条件；
  - 后台查询 / 活跃记录 / 登录日志等；
  - 目前约 37 条 UT 全部通过，用作业务逻辑“参照实现”。

### 3.2 NestJS Jest UT 与覆盖率

- 运行命令：

```bash
cd dev/backend-node
npm test -- --coverage
```

- 最新覆盖率（迭代 12 完成后）：
  - 全仓：Statements **86.77%** / Branches **64.70%** / Functions **95.65%** / Lines **87.77%**；
  - `src/auth` 目录：Statements **90.32%** / Branches **75.34%** / Functions **97.01%** / Lines **91.46%**；
  - `metrics.service.ts`、`audit-log.service.ts`、`auth.service.ts`、`guid-generator.ts`、`session-store.ts`、`auth-exception.filter.ts` 等核心文件均达 96～100% 覆盖。

- 覆盖点：
  - 登录 / 注册 / 封禁 / 注销业务分支，及对应错误码（ERR_USER_BANNED / ERR_USER_DELETED 等）；
  - Token 刷新 / 验证 / 退出各分支（含失效、app_id 不匹配、Refresh 不匹配等）；
  - 验证码发送 / 校验正常与异常分支（手机号非法、验证码错误/过期、频率过高）；
  - SSO/SessionStore 的 Redis 读写、过期、删除；
  - Metrics 与 Audit 行为在控制器层的调用路径；
  - 错误码到 HTTP 状态的映射（AuthExceptionFilter）。

### 3.3 React 前端构建与集成

- 运行命令：

```bash
cd dev/frontend-react
npm run build
```

- 当前状态：
  - Vite 构建通过，产出 `dist/`；
  - 登录页与后台页面已与后端 API 建立基本对接，可作为手工联调 / 回归验证入口。

---

## 4. 新加入工程同学推荐工作流

> 场景：你是新加入的 RD / QA / 架构同学，需要在当前实现的基础上继续开发 / 写测试 / 做评审。

### 4.1 文档层面

1. 先读：《passport-统一认证中心-会话关键内容整理-开发入口.md》
2. 再读：
   - 主 PRD：`passport-统一认证中心-PRD-草稿.md`；
   - Q/C 决策文档：`passport-统一认证中心-PRD-审查与决策汇总-已决策.md`、`passport-统一认证中心-多视图冲突与决策清单-已决策.md`；
3. 若要做 Dev Plan 或测试相关工作：再读
   - `passport-统一认证中心-会话关键内容整理-开发与测试TDD版.md`；
   - `passport-统一认证中心-测试用例-DevPlan对齐版.md`；
   - `passport-统一认证中心-单元测试设计-TDD版.md`。
4. 若要评估当前实现状态：结合本文件 + `passport-统一认证中心-开发进度总结.md`。

### 4.2 代码与测试层面

1. **快速验证当前工程健康状况**：

```bash
# Python 逻辑 PoC
python -m unittest discover -s dev/tests -p "test_*.py"

# NestJS 后端
cd dev/backend-node
npm test -- --coverage

# React 前端
cd dev/frontend-react
npm run build
```

2. **从需求到代码的导航示例**（以“登录 + 验证码 + SSO”为例）：
   - 需求：PRD 中 US-01 / FL-01 / FL-04 / BR-02 / BR-03 / BR-06 / ERR-13.x；
   - Dev Plan：AUTH-01 / SSO-02 模块下的相关 Task（Cycle1～5 / Cycle11～15 / Cycle21～23）；
   - 测试用例：`测试用例-DevPlan对齐版` 中的 TC-AUTH-FL01 / TC-SSO-FL04 系列；
   - Python 参考实现：`dev/tests` 下对应的服务与 UT；
   - NestJS 实现：`dev/backend-node/src/auth` 下的 `auth.service.ts` / `token.service.ts` / `verification-code.service.ts` / `session-store.ts` / `auth.controller.ts` 等；
   - React 前端：`dev/frontend-react` 中登录页面与相关 API 客户端。

3. **扩展新功能或调整需求时**：
   - 先在 PRD + Q/C 文档中达成一致并更新记录；
   - 再更新 Dev Plan + 测试用例 + 单测设计；
   - 最后在对应技术栈（Python PoC / NestJS / React）中按 TDD/ATDD 流程推进实现，并保持 UT / 构建全绿。

---

## 5. 小结

- 从会话与实现进度角度看，目前 Passport 统一认证中心在**需求 / 设计 / 实现 / 测试 / 观测性 / 审计**几个维度都已形成完整闭环：
  - 需求与多视图决策：PRD v1.1 + Q-xx + C-xx；
  - 设计与计划：架构 & 性能 & 日志审计文档 + Dev Plan；
  - 实现：Python PoC / NestJS 后端 / React 前端三栈联动；
  - 测试：Python UT + Jest UT（高覆盖）+ 前端构建 + 测试用例文档 + 单测设计；
  - 观测性与运维：MetricsService + `/api/admin/metrics` + `/api/health` + AuditLogService。
- 本《开发实现进度版》旨在作为“从会话到代码”的快速连接点，帮助后来者在有限时间内建立对当前工程状态的整体认知，并安全地在此基础上继续演进。
