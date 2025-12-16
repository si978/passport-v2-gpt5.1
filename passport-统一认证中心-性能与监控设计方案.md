# Passport 统一认证中心 - 性能与监控设计方案（v1.0）

> 目的：在 PRD v1.1 已给出性能与监控的业务级约束前提下，补充工程实现层面的性能目标、监控指标与测试方法，为开发与测试提供统一依据。

关联文档：

- PRD：`passport-统一认证中心-PRD-草稿.md`（10 / 12 章）；
- 决策：Q-15 / Q-17、C-02；
- 开发计划：`passport-统一认证中心-开发计划.md`（尤其 Cycle7、Cycle15、Cycle20、Cycle28/29）；
- 测试：`passport-统一认证中心-测试用例-DevPlan对齐版.md`（TC-SSO-FL04-006、TC-AUTH-FL02-004、TC-ADMIN-FL07-003 等）。

---

## 1. 性能目标（Performance Targets）

### 1.1 本地 SSO 启动性能

- **场景定义**：
  - 用户在 Windows 桌面点击“启动客户端”（九尾狐或游利社），客户端启动流程包括：
    - 进程启动与 UI 初始化；
    - 壳层读取本地会话文件 `session.dat`；
    - 通过刷新接口获取最新 Access Token；
    - 前端进入业务首页（已登录态）。
- **度量指标**：
  - `SSO_startup_duration`：从进程启动（主窗口创建）到前端完成登录并可操作的总耗时（毫秒）。
- **目标值（与 PRD 10.1 对齐）**：
  - 在“标准测试环境”（公司规定的参考机型 + 正常网络条件）下：
    - **P95(SSO_startup_duration) < 1500 ms**；
    - P50 建议 < 800 ms，P90 建议 < 1200 ms（作为优化参考，不列为强制门槛）。
- **比较基线**：
  - 与“仅远程校验方案”（不使用本地会话文件，只依赖远程登录）相比，本地 SSO 启动耗时应有明显优势（例如 P95 至少缩短 30%）。

### 1.2 认证接口性能

- 登录接口（API-02）：
  - 在正常条件下（验证码服务可用 / DB / Redis 正常）：
    - P95 响应时间 < 500 ms；
    - QPS 基线按业务预估值确定，V1 要求单实例可支撑日常登录峰值 × 2 的流量。
- 刷新接口（API-03）：
  - P95 响应时间 < 300 ms；
  - 在 Redis 正常可用前提下，绝大多数延迟来自网络与 Redis 访问。
- 验证接口（API-04）：
  - 作为业务网关前置验证的一部分，应尽量轻量：
    - P95 响应时间 < 150 ms；
  - 建议通过本地缓存 / 连接池等手段优化。

> 说明：上述数值为 V1 初始目标，可在后续性能压测中按需调整；如需调整，应通过新增 Q/C 条目并同步更新本方案与 PRD。

---

## 2. 监控指标设计（Metrics）

### 2.1 指标命名规范

- 采用统一前缀：`passport_`；
- 指标名使用“资源 + 动作 + 指标类型”模式，如：`passport_login_success_total`；
- 标签（label）建议包含：
  - `app_id`：调用方应用标识（如 `jiuweihu` / `youlishe`）；
  - `channel`：登录渠道（客户端、后台、其他）；
  - `error_code`：错误码（如 `ERR_CODE_INVALID`）；
  - `env`：环境（dev / staging / prod）。

### 2.2 登录流程相关指标

1. 登录成功 / 失败计数：
   - `passport_login_success_total{app_id,channel}`（counter）；
   - `passport_login_error_total{app_id,channel,error_code}`（counter）；
   - 用途：计算登录成功率 / 错误率，区分不同错误类型（验证码错误 / Token 失效 / 封禁等）。

2. 验证码发送：
   - `passport_send_code_success_total{app_id}`；
   - `passport_send_code_error_total{app_id,error_code}`；
   - 尤其关心 `ERR_CODE_TOO_FREQUENT`、短信通道异常等。

3. Token 刷新：
   - `passport_refresh_success_total{app_id}`；
   - `passport_refresh_error_total{app_id,error_code}`；
   - 用于监控刷新失败率、识别 Refresh Token 设计或实现问题。

4. Redis 会话读写：
   - `passport_redis_session_error_total{operation}`（operation ∈ {read,write,delete}）；
   - 与 C-02（Redis 故障策略）配合使用，用于监控 Redis 故障对业务的影响程度。

### 2.3 延迟分布指标

- 使用 histogram 记录关键接口延迟：
  - `passport_login_duration_seconds_bucket{app_id}`；
  - `passport_refresh_duration_seconds_bucket{app_id}`；
  - `passport_verify_duration_seconds_bucket{app_id}`；
  - `passport_sso_startup_duration_seconds_bucket{app_id,client}`（客户端埋点上报）。
- 通过 histogram 可直接在监控平台计算 P50/P90/P95 等分位数，用于对照本方案的性能目标。

### 2.4 告警建议（示例）

- 登录成功率：
  - 最近 5 分钟登录成功率 < 95% → 报警（需结合业务峰谷和特定活动灵活调整）；
- 验证码发送失败率：
  - 最近 5 分钟 `passport_send_code_error_total / (success+error) > 5%` → 报警；
- Redis 会话错误率：
  - 最近 5 分钟 `passport_redis_session_error_total` 显著高于基线 → 报警；
- 接口延迟：
  - 最近 15 分钟登录 P95 延迟超过 1.5× 目标值（如 > 2250 ms） → 性能报警。

> 具体阈值需结合线上运行经验逐步调整，本方案给出初始建议。

---

## 3. 数据采集与实现要求

### 3.1 服务端埋点

- 所有 Passport 服务端接口（API-01～05）需在以下位置埋点：
  - 请求进入时记录请求计数；
  - 处理完成后记录成功 / 失败计数与错误码；
  - 记录接口处理耗时（用于 duration histogram）。
- 遵循以下原则：
  - 不在指标中记录敏感字段（如手机号完整值、明文 Token 等）；
  - 通过 guid / app_id / error_code 等非敏感字段实现聚合分析。

### 3.2 客户端埋点（SSO 启动）

- 客户端需要：
  - 在主窗口创建时记录 start 时间戳；
  - 在前端完成登录并可交互时记录 end 时间戳；
  - 上报 `SSO_startup_duration = end - start` 到监控系统（可通过网关或日志收集再聚合）。

---

## 4. 与测试用例的对应

- TC-SSO-FL04-006：
  - 使用本方案中的 SSO P95 目标（1500 ms）作为判断标准；
- TC-AUTH-FL02-004：
  - 验证 Redis 故障场景下的行为，并结合 `passport_redis_session_error_total` 指标检查监控是否正确记录异常；
- TC-ADMIN-FL07-003：
  - 验证本方案中所列的主要指标（登录成功率/错误率、验证码发送失败率、刷新失败率、Redis 会话错误率、接口错误率）是否正确上报，并与实际行为一致。

---

## 5. 调整与版本化

- 本性能与监控方案与 PRD v1.1 一致：
  - 若未来对性能目标（如 SSO P95 目标值）或指标集合有重大调整：
    - 应通过新增 Q/C 条目与 PRD 版本升级进行决策；
    - 同步更新本方案文档的版本号，并在“变更记录”中说明调整原因与影响范围。
- 在实际运行中，应：
  - 定期回顾监控数据与性能表现，评估是否需要收紧 / 放松目标；
  - 根据报警情况优化代码与架构（如增加缓存、优化 DB 索引、扩容等）。
