# Passport 统一认证中心 - 会话关键内容整理（开发 & 测试 & TDD 对齐版 v1.1）

> 目的：本文件作为**开发 & 测试阶段的工作导航**，在已经完成多视图审查与决策固化的基础上，总结：
> - 主 PRD（SSoT）在开发期如何与开发计划、测试用例、单元测试设计联动；
> - Dev Plan（Cycle1～29）、测试用例文档、TDD 适配分析与函数级 UT 设计之间的对应关系；
> - 各角色（RD / QA / 架构）在 TDD 模式下应如何使用这些文档。
>
> 说明：本文件**不新增或修改任何需求**，所有需求与约束仍以 `passport-统一认证中心-PRD-草稿.md`（v1.1）为唯一权威需求文档（SSoT），本文件仅对“开发 & 测试视角”的会话结论做导航与摘要。

---

## 0. 适用范围与版本关系

- **适用 PRD 版本**：
  - `Passport 统一认证中心 - PRD（V1 多视图对齐版）`（v1.1，文件：`passport-统一认证中心-PRD-草稿.md`）。
- **已合入的决策范围**：
  - 产品 / 业务层：Q-01 ～ Q-19（`passport-统一认证中心-PRD-审查与决策汇总-已决策.md`）。
  - 工程 / 架构层：C-01 ～ C-07（`passport-统一认证中心-多视图冲突与决策清单-已决策.md`）。
- **本文件关注的新增工程文档**：
  - 开发计划：`passport-统一认证中心-开发计划.md`；
  - 测试用例（DevPlan 对齐版）：`passport-统一认证中心-测试用例-DevPlan对齐版.md`；
  - TDD 适配分析：`passport-统一认证中心-TDD适配分析.md`；
  - 函数级单元测试设计：`passport-统一认证中心-单元测试设计-TDD版.md`。

### 0.1 与已有会话整理文档的分工关系

| 文件名 | 对应阶段 / 版本 | 角色定位 | 备注 |
| ------ | ---------------- | -------- | ---- |
| `passport-统一认证中心-会话关键内容整理-开发入口.md` | 进入开发之前 | **开发阶段入口版**：告诉你从 PRD + Q/C + 视图的角度应该先看什么、抓哪些关键点 | 推荐作为“从 0 开始理解项目”的第一站 |
| `passport-统一认证中心-会话关键内容整理.md` | 多视图审查收敛完成后 | **多视图已决策版**：详细梳理 Q-xx / C-xx 与各工程视图关系 | 偏“背景 & 过程”全量索引 |
| `passport-统一认证中心-会话关键内容整理-历史v1.md` | PRD v1.0，仅 Q 决策 | 仅产品层历史快照 | 仅供追溯 |
| `passport-统一认证中心-会话关键内容整理-开发与测试TDD版.md` | PRD v1.1，开发 & 测试阶段 | **本文件**：从 Dev Plan / 测试用例 / 单元测试 / TDD 的角度总结会话结论 | 面向正在写代码 / 写用例的 RD / QA |

---

## 1. 开发 & 测试阶段必须关注的 5 份核心文档

> 若你已经理解了 PRD + Q/C + 基本分层，现在要真正开始“写代码 / 写测试”，建议按以下顺序阅读 / 使用：

### 1.1 主 PRD（SSoT）：`passport-统一认证中心-PRD-草稿.md`

- 仍然是唯一权威需求文档：**任何需求 / 约束的变更必须先改 PRD**；
- 对开发 & 测试最相关的章节：
  - 4 章 用户故事（US-01～US-05）；
  - 5 章 业务规则（BR-01～BR-09）；
  - 6 章 流程（FL-01～FL-05）；
  - 8 章 数据模型（DM-01～DM-04）；
  - 9 章 接口（API-01～API-05）；
  - 10 / 11 / 12 / 13 章：NFR、权限、日志与监控、错误码；
  - 17 章 验收标准（AC-01～AC-04）。

### 1.2 开发计划：`passport-统一认证中心-开发计划.md`

- 结构：
  - 模块（Epic）：AUTH-01 / SSO-02 / SESS-03 / ADMIN-04；
  - 用户故事（US）：US-01～US-05；
  - 功能流程（FL）：PRD 中的 FL-01～FL-05 + 计划内的 FL-06/FL-07（验证码发送 & 后台流程）；
  - 任务（Task）：按 `[MOD][US][FL][ROLE]` 命名的 Task，映射到 Cycle1～29。
- 作用：
  - 把 PRD 中的 US / FL / BR / ERR 拆解为具体可执行任务；
  - **每个 Cycle 对应一个任务 ID**，可在 Sprint / 看板中直接使用。

### 1.3 测试用例（DevPlan 对齐版）：`passport-统一认证中心-测试用例-DevPlan对齐版.md`

- 视角：以 FL 为主线的集成 / E2E / 接口级测试用例设计；
- 覆盖范围：
  - US-01～US-05 全部用户故事；
  - FL-01～FL-05 + 规划内 FL-06（验证码发送）/ FL-07（后台查询与导出）；
  - BR-01～BR-09、ERR 13.1～13.3 全部关键分支；
  - NFR 中的性能 / 日志 / 监控（如 SSO P95、Redis 故障策略、监控指标上报）。
- 特点：
  - 每条用例均显式标注“关联 Story/FL/Cycle”；
  - 可直接作为 QA 测试设计与自动化用例实现的蓝本。

### 1.4 TDD 适配分析：`passport-统一认证中心-TDD适配分析.md`

- 目标：判断“PRD + Dev Plan + 测试用例”整体是否适合 TDD 开发模式；
- 结论要点：
  - 需求可测试性达标：US/FL/BR/ERR/NFR 都可映射为可执行断言；
  - 开发计划与测试用例之间存在一一映射：每个 Cycle 都至少被一条用例引用；
  - 粒度上非常适合 **Story/Feature 级 TDD / ATDD**；
  - 若要做到“函数级 TDD”，需要在编码阶段再引入函数级单测（见下一份文档）。

### 1.5 函数级单元测试设计（TDD 版）：`passport-统一认证中心-单元测试设计-TDD版.md`

- 内容：
  - 按模块（AUTH / SSO / SESS / ADMIN）拆分关键组件与函数（如 `AuthService.loginWithPhone`、`TokenService.refreshAccessToken`、`LocalSessionValidator.validate`、`BanService.banUser` 等）；
  - 为每个函数定义多条单元测试用例，使用 ID 格式 `UT-<MOD>-<COMP>-<FN>-<序号>`；
  - 每条 UT 都标注“关联 Cycle + US/FL/BR/ERR”；
- 作用：
  - 支持经典 TDD：先写失败单测 → 最小实现 → 重构；
  - 与上层的 FL 级 E2E 用例组合，形成“自下而上 + 自上而下”的测试金字塔。

---

## 2. 从 PRD 到 Dev Plan：需求拆解视角的关键结论

### 2.1 US / FL / BR 完整映射到模块与任务

- **用户故事 US-01～US-05** 全部映射到 4 个模块：
  - AUTH-01：手机号登录 / 注册、Token 刷新与验证（US-01）；
  - SSO-02：同机跨客户端自动登录 + 网吧下机（US-02 / US-03）；
  - SESS-03：用户主动退出登录 = 全局退出（US-04）；
  - ADMIN-04：后台查看用户信息与活跃明细（US-05）。
- **功能流程 FL**：
  - PRD 定义的 FL-01～FL-05（登录/刷新/验证/SSO/退出）全部对应到 AUTH/SSO/SESS 模块的 Task；
  - 计划内新增：
    - FL-06：验证码发送流程（AUTH-01 / US-01，补上 API-01 与 BR-09 实现）；
    - FL-07：后台活跃记录查询与导出流程（ADMIN-04 / US-05）。
- **业务规则 BR-01～BR-09**：
  - BR-01～BR-07：在 Dev Plan 中分散落到 Token/Session/User 相关 Task；
  - BR-08（封禁/解封规则）：通过 ADMIN-04 + SESS-03 的 Task 联动；
  - BR-09（手机号与验证码规则）：通过 AUTH-01 的 FL-06 任务链（Cycle21～23）落实。

### 2.2 Cycle1～29 覆盖范围速览

- Cycle1～20：
  - 覆盖 AUTH-01 / SSO-02 / SESS-03 全部核心功能（登录/刷新/验证/SSO/退出/封禁联动）；
  - 每条 FL 至少包含 FE / BE / QA 三类 Task（SSO/退出还包含 SH / NM）。
- Cycle21～23：
  - 用于补齐验证码发送流程与 BR-09 / API-01；
  - FE：验证码按钮/倒计时；BE：API-01 + 频率限制；QA：错误/过期/频率限制用例。
- Cycle24～26：
  - 后台用户信息表 + 封禁/解封（ADMIN-04 / FL-06），含权限矩阵；
- Cycle27～29：
  - 用户活跃表查询与导出 + 监控落地（ADMIN-04 / FL-07）；
  - 同时将 LoginLog（DM-04）和监控指标（12 章）工程化落地。

> 结论：从“需求 → 任务”的视角，**所有 US/FL/BR/ERR 的实现路径都可以通过 Dev Plan 中的 Task/Cycle 找到**，这为后续的测试设计与 TDD 奠定了基础。

---

## 3. 从 Dev Plan 到测试用例：测试覆盖与追踪关系

### 3.1 集成 / E2E 测试用例的覆盖面

- 按模块：
  - AUTH-01：TC-AUTH-FL01 / FL02 / FL03 系列，覆盖登录 / 刷新 / 验证；
  - SSO-02：TC-SSO-FL04 系列，覆盖本地会话读写、2 小时阈值、网吧场景、多应用 SSO、性能 P95、DPAPI/ACL 异常降级；
  - SESS-03：TC-SESS-FL05 系列，覆盖全局退出、幂等、封禁并发、LoginLog 更新；
  - ADMIN-04：TC-ADMIN-FL06 / FL07 系列，覆盖后台查询/封禁/权限控制/活跃查询与导出/监控指标上报。
- 按需求类型：
  - US / FL：所有 US-01～US-05、FL-01～FL-07 在测试文档中都有专门章节和用例；
  - BR / ERR：BR-01～BR-09、ERR 13.1～13.3 每个关键分支都有至少一条用例覆盖；
  - NFR：
    - 性能：TC-SSO-FL04-006 负责 SSO 启动 P95 检查；
    - 可用性（Redis 故障）：TC-AUTH-FL02-004 覆盖刷新场景下的 Redis 故障行为；
    - 日志与监控：TC-AUTH-FL01-006 / TC-SESS-FL05-004 验证 LoginLog 写入；TC-ADMIN-FL07-003 验证监控指标上报。

### 3.2 Cycle → TestCase 的映射

- 每条测试用例都显式标注“关联 Cycle”：
  - 例如 `TC-AUTH-FL01-001 已有用户正常登录` 关联 Cycle1/2/3；
  - `TC-AUTH-FL01-005 验证码错误/过期/频率限制` 关联 Cycle1/2/21～23；
  - `TC-ADMIN-FL06-002 运营封禁/解封用户并验证前台行为` 关联 Cycle24～26 + 19/20；
  - `TC-ADMIN-FL07-003 监控指标上报验证` 关联多条 Cycle（3/7/10/15/20/28/29）。
- 这意味着：
  - **可以以 Cycle 为单位驱动测试开发**：进入某个 Cycle 的开发时，先实现/更新其关联用例；
  - Sprint 回顾或验收时，可以按“用例状态 → Cycle 状态 → Story/Epic 状态”进行反向追踪。

---

## 4. 函数级单元测试设计：支持经典 TDD 的关键组件

> 在集成/E2E 用例之上，`passport-统一认证中心-单元测试设计-TDD版.md` 提供了函数级别的 UT 设计，便于在核心逻辑上实践经典 TDD。

### 4.1 AUTH 模块示例

- **VerificationCodeService**（BR-09 / API-01）：
  - `UT-AUTH-VC-SEND-01/02/03`：覆盖合法发送、手机号非法、频率超限（ERR_CODE_TOO_FREQUENT / ERR_PHONE_INVALID）；
  - `UT-AUTH-VC-VAL-01/02/03`：覆盖验证码正确 / 错误 / 过期（ERR_CODE_INVALID / ERR_CODE_EXPIRED）。
- **AuthService.loginWithPhone**（US-01 / FL-01 / BR-02 / BR-08 / C-01）：
  - `UT-AUTH-AUTH-LOGIN-01`：已有用户正常登录；
  - `UT-AUTH-AUTH-LOGIN-02`：手机号不存在 → 新建用户；
  - `UT-AUTH-AUTH-LOGIN-03`：封禁用户 → ERR_USER_BANNED；
  - `UT-AUTH-AUTH-LOGIN-04`：注销用户（status=-1）按新用户处理并生成新 GUID。
- **TokenService.refreshAccessToken**（FL-02 / BR-03/04）：
  - `UT-AUTH-TOKEN-REF-01/02/03/04`：覆盖正常刷新、Refresh Expired、Refresh 不匹配、app_id 不匹配等场景。
- **TokenValidator.validateAccessToken**（FL-03 / BR-05）：
  - `UT-AUTH-TOKEN-VAL-01/02/03/04`：覆盖 Token 有效 / 过期 / 签名错误 / app_id 不匹配。

### 4.2 SSO / SESS / ADMIN 模块示例

- **LocalSessionCrypto / LocalSessionValidator / SsoStartupHandler / SsoSecurityHandler**：
  - 负责 BR-06 / C-03 / RISK-03 下本地会话加解密、结构校验、2 小时阈值、DPAPI/ACL 异常降级等；
  - 相关 UT 覆盖：文件缺失/损坏、时间溢出、异常降级为“仅在线登录”等。
- **SessionService / LogoutService / BanService**：
  - 覆盖 BR-07（TTL 与全局退出）与 BR-08（封禁/解封规则）；
  - UT 关注 Redis 会话创建/删除幂等性，以及封禁时的会话删除与 User.status 更新行为。
- **UserQueryService / ActivityQueryService / ActivityExportService / PermissionChecker / MetricsRecorder**：
  - 覆盖后台查询与导出（FL-06/07）、权限矩阵（11 章）、LoginLog 与监控指标上报（DM-04 / 12 章 / NFR 10.2）。

> 这些 UT 设计均显式附带“关联 Cycle + US/FL/BR/ERR”，确保从函数级测试也能回溯到 PRD 与 Dev Plan。

---

## 5. 各角色的推荐工作流（TDD 视角）

### 5.1 开发（RD）

1. 进入某个 Cycle 前：
   - 查 Dev Plan 中该 Cycle 对应的 Task（例如 `[AUTH-01][US-01][FL-01][BE]`）；
   - 在测试用例文档中找到关联用例（TC-...），理解端到端行为；
   - 在单元测试设计文档中找到对应函数级 UT（UT-...）。
2. 开始实现时：
   - 先落地该 Cycle 对应的 UT（红）；
   - 再实现最小业务逻辑直到 UT 通过（绿）；
   - 最后运行对应 TC 用例和回归测试（重构阶段）。

### 5.2 测试（QA）

1. 基于 PRD + Q/C + QA 视图构建测试计划；
2. 使用 `测试用例-DevPlan对齐版` 作为用例总表，按模块/FL 补充环境细节与自动化脚本；
3. 与 RD 协同：
   - 在每个 Cycle 开始前，对齐该 Cycle 需要通过的用例（TC-...）；
   - 在 Cycle 完成前确认所有关联用例已实现并通过。

### 5.3 架构 / 技术负责人

1. 利用 TDD 适配分析文档，确认文档体系支撑 Story/Feature 级 TDD；
2. 在复杂模块（例如 SSO / 退出 / 封禁 / 日志与监控）上推进函数级 UT 的落地；
3. 定期检查 Dev Plan / TestCase / UT 三者之间的一致性，并在需求或架构调整时同步更新。

---

## 6. 历史与演进视角的补充说明

- 多视图审查与决策阶段的完整过程与细节，已由《passport-统一认证中心-会话关键内容整理.md》进行系统性总结；
- 进入开发阶段前的“文档入口与分层职责对齐”，由《passport-统一认证中心-会话关键内容整理-开发入口.md》负责；
- 本文件聚焦在“开发 & 测试 & TDD”视角下的会话关键结论，是 Dev Plan / TestCase / UT 几份工程文档的导航与粘合层；
- 后续如对 Dev Plan or 测试体系做较大调整（例如引入新模块 / 新 US / 新 NFR），建议同时更新：
  - `开发计划.md`；
  - `测试用例-DevPlan对齐版.md`；
  - `单元测试设计-TDD版.md`；
  - 以及本《开发与测试TDD版》的“核心文档清单与工作流”章节。
