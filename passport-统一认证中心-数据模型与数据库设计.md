# Passport 统一认证中心 - 数据模型与数据库设计（v1.0）

> 目的：在 PRD v1.1 中给出的抽象数据模型（DM-01～DM-04）基础上，补充关系型数据库（以 MySQL 为例）的表结构与索引设计，为开发与性能优化提供统一依据。

关联文档：PRD 8 章（数据模型）、BR-01～BR-09、《开发计划.md》（相关 BE Task）、《测试用例-DevPlan对齐版.md》、会话整理（开发与测试TDD版）。

---

## 1. DM-01：User 用户表设计

### 1.1 表结构（示例 MySQL DDL）

```sql
CREATE TABLE passport_user (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '自增主键',
  guid            CHAR(20)        NOT NULL COMMENT '全局唯一 GUID（BR-01）',
  phone           VARCHAR(20)     NOT NULL COMMENT '手机号',
  user_type       TINYINT         NOT NULL DEFAULT 1 COMMENT '用户类型，预留扩展',
  account_source  VARCHAR(32)     NOT NULL COMMENT '账号来源，如 qq,wechat,phone 等',
  status          TINYINT         NOT NULL DEFAULT 1 COMMENT '1=正常,0=封禁,-1=注销/删除（BR-02/BR-08）',
  created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最近更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_guid (guid),
  KEY idx_phone (phone),
  KEY idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Passport 用户表（DM-01）';
```

### 1.2 设计说明

- guid：
  - 由 GuidGenerator 按 BR-01 生成，长度 20，保证全局唯一；
  - 作为跨系统关联的主键，避免直接以 phone 作为主键。
- phone：
  - 索引用于按手机号查询与后台检索；
  - 业务上要求唯一，但允许历史记录（status=-1）存在，因此可在业务层控制“同手机号仅一个 status!= -1 的有效账号”。
- status：
  - 与 BR-02 / BR-08 / C-01 保持一致。

---

## 2. DM-02：Session（Redis 结构与持久化视角）

> 说明：在线会话主要存储在 Redis 中，关系型数据库对 Session 不做完整镜像，仅在部分审计场景下需要（可选）。本节仅约定 Redis Key 结构。

### 2.1 Redis Key 设计

- Key：`session:{guid}`
- Value（JSON 或 Hash）：
  - `guid`：用户 GUID；
  - `refresh_token`：当前 Refresh Token；
  - `refresh_token_expires_at`：Refresh Token 过期时间；
  - `apps`：每个 app_id 的子结构，包括：
    - `access_token`；
    - `access_token_expires_at`；
    - `last_active_at`；
- TTL：
  - 与 BR-07 对齐，统一设置为 2 天（与 Refresh Token 期限一致）。

> 具体 Redis 序列化方式（JSON / Hash）由技术实现决定，本设计文档不做硬编码约束。

---

## 3. DM-03：LocalSession（本地会话文件）

> 说明：本地会话文件 `C:\ProgramData\Passport\session.dat` 由原生模块读写，结构在 PRD BR-06 中已有定义。本节仅做补充说明。

- 字段：
  - `guid` / `phone` / `user_type` / `account_source` / `refresh_token` / `created_at` / `expires_at` / `device_id` / `apps` 等；
- 规则：
  - `expires_at = created_at + 2 天`；
  - 客户端在读取时需做完整性与时间合法性校验（见 LocalSessionValidator 设计与 UT）。

---

## 4. DM-04：LoginLog（登录与活跃日志）

### 4.1 表结构（示例 MySQL DDL）

```sql
CREATE TABLE passport_login_log (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '自增主键',
  guid            CHAR(20)        NOT NULL COMMENT '用户 GUID',
  phone           VARCHAR(20)     NOT NULL COMMENT '登录手机号（可脱敏展示）',
  user_type       TINYINT         NOT NULL COMMENT '用户类型',
  account_source  VARCHAR(32)     NOT NULL COMMENT '账号来源',
  channel         VARCHAR(32)     NOT NULL COMMENT '登录渠道，如 client_jiuweihu/client_youlishe/admin',
  login_time      DATETIME        NOT NULL COMMENT '登录成功时间',
  logout_time     DATETIME        NULL     COMMENT '退出时间或最后一次心跳时间，未退出为 NULL',
  ip              VARCHAR(64)     NULL     COMMENT 'IP 地址',
  mac             VARCHAR(64)     NULL     COMMENT 'MAC 地址（如能获取）',
  gateway         VARCHAR(128)    NULL     COMMENT '网关标识（如腾讯网关）',
  netbar_name     VARCHAR(128)    NULL     COMMENT '网吧名称（如有）',
  status          VARCHAR(16)     NOT NULL DEFAULT 'active' COMMENT '会话状态：active/logged_out/banned',
  created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '记录创建时间',
  updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '记录更新时间',
  PRIMARY KEY (id),
  KEY idx_guid (guid),
  KEY idx_phone (phone),
  KEY idx_login_time (login_time),
  KEY idx_channel (channel)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Passport 登录与活跃日志表（DM-04）';
```

### 4.2 设计说明

- 以 guid 为主查询键，phone / login_time / channel 为常用过滤条件；
- 可根据实际报表需求补充组合索引（如 `(login_time, channel)`）。

---

## 5. 迁移与演进

- 初始版本：
  - 上述表结构可作为 V1 的初始 Schema；
  - 迁移脚本应在版本控制系统中维护（例如 `db/migrations` 目录），并通过 CI 执行；
- 后续调整：
  - 如新增字段或索引，应通过标准 DB 迁移流程演进，避免直接变更生产环境结构；
  - 重大 Schema 变更需同步更新本设计文档与相关 BR/DM 描述。
