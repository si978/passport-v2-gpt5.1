## 阿里云正式环境验收（真实短信 + 双 EXE SSO）

目标：在 **生产形态** 启动后端（Nginx + NestJS + Postgres + Redis），使用 **阿里云号码认证服务 Dypnsapi** 的 `SendSmsVerifyCode` 发送验证码；并验证两个 Windows EXE 客户端通过同一份 `session.dat` 完成 **跨 app_id 的 SSO 自动登录**。

---

### 1) 部署后端（阿里云 ECS）

1. 准备一台 ECS（推荐 Linux），安装 Docker 与 Docker Compose。
2. 在服务器上放置项目代码，并准备真实短信配置文件：`sms-config/.env`
   - 必填（Dypnsapi）：
     - `ALIYUN_ACCESS_KEY_ID`
     - `ALIYUN_ACCESS_KEY_SECRET`
     - `ALIYUN_SMS_SIGN_NAME`
     - `ALIYUN_SMS_TEMPLATE_CODE`
   - 短信模版需包含参数：`code` 与 `min`
     - 模版示例：`您的验证码为${code}。尊敬的客户，以上验证码${min}分钟内有效，请注意保密，切勿告知他人。`
3. 配置安全组放行端口：
   - TCP `8080`（前端 Nginx 暴露端口；同时承载 `/api` 反代）
4. 启动生产形态：
   - 在仓库根目录执行：`docker compose -f deploy/docker-compose.yml up -d --build`
5. 健康检查：
   - 访问：`http://<ECS公网IP>:8080/api/health`

---

### 2) Windows 双 EXE 客户端验收（SSO 自动登录）

需要的 EXE：
- `dist/PassportClientJiuweihu.exe`（端 A：手机号登录写入 `session.dat`）
- `dist/PassportClientYoulishe.exe`（端 B：启动自动读取 `session.dat` 并刷新登录）

步骤：
1. 在同一台 Windows 机器、同一 Windows 用户下运行两个 EXE（若启用 DPAPI，加密文件只能由同一用户解密）。
2. 启动端 A：`PassportClientJiuweihu.exe`
   - “后端地址”填写：`http://<ECS公网IP>:8080`（无需手动加 `/api`）
   - 点击“发送验证码（真实短信）”，收到短信后输入验证码
   - 点击“登录并写入 session.dat”
3. 启动端 B：`PassportClientYoulishe.exe`
   - 同样填写“后端地址”（或使用“保存配置”后自动复用）
   - 启动后会自动执行 `refresh-token(app_id=youlishe)`，状态应显示：`自动登录成功`
   - 输出区会打印 `verify-token` 的 `app_id=youlishe`，作为 SSO 成功证据

常见问题：
- 端 B 显示“无可用 session”：确认端 A 已写入 `session.dat`，且写入时间未超过 2 小时阈值（超时会被客户端自动清理）。
- 两个 EXE 在不同用户下运行：若勾选“使用 DPAPI 加密”，会导致无法互解同一份 `session.dat`；请改为同一用户运行或关闭 DPAPI。

---

### 3) 可选：服务端审计佐证（SSO）

后端在首次为某 `app_id` 创建 AppSession 时会记录审计：`audit_logs(type='sso_login')`。

（可选）连接 Postgres 后执行：
```sql
select id, type, guid, meta, created_at
from audit_logs
where type = 'sso_login'
order by id desc
limit 20;
```

