-- Passport 统一认证中心 - 最小可用数据库结构（PostgreSQL）
--
-- 用途：
-- - 让 `deploy/docker-compose.yml` 在“空数据库”场景下可直接启动并完成登录/审计/登录日志等核心流程。
-- - 该脚本会在 Postgres 容器首次初始化数据目录时由 docker-entrypoint 自动执行。
--
-- 注意：
-- - 生产环境建议使用受控迁移流程（migrations）管理 schema 变更；本脚本作为“可上线可跑”的最小基线。

CREATE TABLE IF NOT EXISTS users (
  guid text PRIMARY KEY,
  phone text UNIQUE NOT NULL,
  "userType" integer NOT NULL DEFAULT 1,
  "accountSource" text NOT NULL DEFAULT 'phone',
  status integer NOT NULL DEFAULT 1,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_phone ON users (phone);

CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  type text NOT NULL,
  guid varchar(64) NULL,
  phone varchar(32) NULL,
  at timestamptz NOT NULL DEFAULT now(),
  meta jsonb NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_guid ON audit_logs (guid);
CREATE INDEX IF NOT EXISTS idx_audit_logs_phone ON audit_logs (phone);
CREATE INDEX IF NOT EXISTS idx_audit_logs_at ON audit_logs (at);

CREATE TABLE IF NOT EXISTS login_logs (
  id SERIAL PRIMARY KEY,
  guid text NOT NULL,
  phone text NOT NULL,
  "loginAt" timestamptz NOT NULL DEFAULT now(),
  "logoutAt" timestamptz NULL,
  channel varchar(32) NULL,
  ip varchar(64) NULL,
  success boolean NOT NULL,
  "errorCode" varchar(64) NULL,
  mac varchar(64) NULL,
  gateway varchar(64) NULL,
  "cafeName" varchar(128) NULL
);

CREATE INDEX IF NOT EXISTS idx_login_logs_phone_login_at ON login_logs (phone, "loginAt");
CREATE INDEX IF NOT EXISTS idx_login_logs_guid_login_at ON login_logs (guid, "loginAt");
