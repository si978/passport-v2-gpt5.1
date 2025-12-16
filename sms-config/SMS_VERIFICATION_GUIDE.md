# 短信验证码功能开发指南

> 本文档面向AI阅读，用于在其他业务中复用短信验证码功能。

---

## 项目总结：经验与教训

### 项目背景

从零实现短信验证码登录功能，面向不懂技术的个人开发者，使用阿里云服务，前端React + 后端Python FastAPI。

### 遇到的问题与解决方案

| 序号 | 问题 | 原因 | 解决方案 | 耗时 |
|------|------|------|----------|------|
| 1 | API调用报错 `isv.SMS_TEMPLATE_ILLEGAL` | 混淆了两个不同服务：短信服务(Dysmsapi) vs 号码认证服务(Dypnsapi) | 确认用户实际使用的是哪个服务，查看阿里云控制台URL区分 | 高 |
| 2 | 权限错误 `NoPermission` | 子账户只授权了 AliyunDysmsFullAccess | 额外授权 AliyunDypnsFullAccess | 中 |
| 3 | DNS解析失败 | 使用了新加坡节点 `dypnsapi.ap-southeast-1.aliyuncs.com` | 改用国内节点 `dypnsapi.aliyuncs.com` | 低 |
| 4 | 验证码校验失败 | 使用 `##code##` 让阿里云自动生成验证码，但后端存储的是自己生成的验证码，两者不一致 | 改为传入自己生成的验证码 `{"code":"{code}","min":"5"}` | 中 |
| 5 | 签名配置错误 | 用户提供的签名名称与实际使用的不一致 | 直接查看阿里云API调试页面的实际参数 | 低 |
| 6 | 误判测试手机限制 | 以为公共签名只能发送给绑定的测试手机号 | 实际测试验证，公共签名可发送任意手机号 | 低 |

### 关键经验总结

#### 1. 阿里云服务区分（重要）

```
短信服务（传统）                    号码认证服务（本项目使用）
├── 产品：Dysmsapi                 ├── 产品：Dypnsapi
├── 接口：SendSms                  ├── 接口：SendSmsVerifyCode
├── 参数：phone_numbers（复数）     ├── 参数：phone_number（单数）
├── 控制台：dysms.console.aliyun   ├── 控制台：dypns.console.aliyun
└── 权限：AliyunDysmsFullAccess    └── 权限：AliyunDypnsFullAccess
```

**教训**：遇到API报错时，首先确认使用的是哪个服务，查看用户在阿里云哪个控制台操作。

#### 2. 信息获取策略

当用户提供的信息不完整或可能有误时：
- 要求用户提供阿里云API调试页面的完整URL
- 要求用户截图或复制成功调用的完整参数
- 不要假设，直接验证

#### 3. 验证码生成方式选择

| 方式 | 实现 | 优点 | 缺点 |
|------|------|------|------|
| 自行生成（推荐） | `{"code":"{code}"}` | 本地校验，无需额外API调用 | 需自己存储验证码 |
| 阿里云生成 | `{"code":"##code##"}` | 阿里云托管 | 需调用CheckSmsVerifyCode校验 |

**教训**：选择自行生成验证码，简化架构，避免校验不一致问题。

#### 4. 权限配置清单

子账户必须授权的权限：
```
✅ AliyunDypnsFullAccess  - 号码认证服务（必须）
✅ AliyunDysmsFullAccess  - 短信服务（如同时使用）
```

**教训**：权限问题是最常见的错误，遇到403/NoPermission时优先检查RAM授权。

#### 5. 调试流程标准化

```
1. 确认服务类型 → 查看控制台URL
2. 确认配置参数 → 查看API调试页面
3. 确认权限授权 → 检查RAM用户权限
4. 确认网络连通 → 测试Endpoint是否可达
5. 确认参数格式 → 对比成功调用的参数
```

### 避免问题的检查清单

在开始短信功能开发前，确认以下信息：

```markdown
□ 使用哪个阿里云服务？（Dysmsapi / Dypnsapi）
□ 签名名称是什么？（精确到每个字）
□ 模板CODE是什么？（是否需要SMS_前缀）
□ 模板参数格式？（参数名称、是否有多个参数）
□ AccessKey是否已授权对应服务权限？
□ 使用哪个Endpoint？（国内/海外节点）
□ 验证码由谁生成？（自行生成/阿里云生成）
```

### 项目成果

| 指标 | 结果 |
|------|------|
| 功能完整性 | ✅ 发送验证码 + 验证登录 |
| 手机号限制 | ✅ 无限制，任意手机可用 |
| 前端 | React + Vite |
| 后端 | Python FastAPI |
| 文档 | 完整开发指南，AI可直接复用 |

---

## 一、服务概述

本项目使用**阿里云号码认证服务（Dypnsapi）**发送短信验证码，而非传统短信服务（Dysmsapi）。

| 属性 | 值 |
|------|-----|
| 服务名称 | 阿里云号码认证服务 |
| API产品 | Dypnsapi |
| API接口 | SendSmsVerifyCode |
| API版本 | 2017-05-25 |
| Endpoint | dypnsapi.aliyuncs.com |
| Python SDK | alibabacloud_dypnsapi20170525 |

## 二、当前配置参数

```env
ALIYUN_ACCESS_KEY_ID=<your_access_key_id>
ALIYUN_ACCESS_KEY_SECRET=<your_access_key_secret>
ALIYUN_SMS_SIGN_NAME=<your_sms_sign_name>
ALIYUN_SMS_TEMPLATE_CODE=<your_template_code>
```

### 模板参数格式

```json
{"code":"123456","min":"5"}
```

- `code`：自行生成的6位验证码（注意：不使用`##code##`占位符，改为传入实际验证码）
- `min`：验证码有效期提示（分钟），仅用于短信文案显示

### 重要说明：验证码生成方式

有两种方式：
1. **自行生成验证码**（当前使用）：后端生成验证码 → 传入API → 存储验证码 → 用户输入后本地校验
2. **阿里云自动生成**：使用`##code##`占位符 → 阿里云生成 → 需调用CheckSmsVerifyCode接口校验

当前项目使用方式1，验证码由后端生成并存储，校验也在本地完成。

## 三、Python SDK 调用方式

### 3.1 安装依赖

```bash
pip install alibabacloud_dypnsapi20170525 python-dotenv
```

### 3.2 核心代码

```python
from alibabacloud_dypnsapi20170525.client import Client
from alibabacloud_dypnsapi20170525 import models
from alibabacloud_tea_openapi import models as open_api_models

def send_sms_code(phone: str, code: str) -> bool:
    """
    发送短信验证码
    
    Args:
        phone: 手机号码（11位）
        code: 6位数字验证码（自行生成）
    
    Returns:
        bool: 发送成功返回True，失败返回False
    """
    # 创建客户端
    config = open_api_models.Config(
        access_key_id="你的AccessKeyId",
        access_key_secret="你的AccessKeySecret"
    )
    config.endpoint = "dypnsapi.aliyuncs.com"
    client = Client(config)
    
    # 构建请求（code为自行生成的6位验证码）
    request = models.SendSmsVerifyCodeRequest(
        phone_number=phone,
        sign_name="速通互联验证码",
        template_code="100001",
        template_param=f'{{"code":"{code}","min":"5"}}'  # code为传入的验证码
    )
    
    # 发送请求
    response = client.send_sms_verify_code(request)
    
    return response.body.code == "OK"
```

### 3.3 关键参数说明

| 参数名 | 类型 | 说明 |
|--------|------|------|
| phone_number | str | 接收短信的手机号（注意：是phone_number，不是phone_numbers） |
| sign_name | str | 短信签名，当前使用"速通互联验证码" |
| template_code | str | 模板CODE，当前使用"100001" |
| template_param | str | JSON字符串，必须包含code和min两个参数 |

## 四、与传统短信服务（Dysmsapi）的区别

| 对比项 | 号码认证服务（Dypnsapi） | 短信服务（Dysmsapi） |
|--------|--------------------------|----------------------|
| SDK包名 | alibabacloud_dypnsapi20170525 | alibabacloud_dysmsapi20170525 |
| 发送接口 | SendSmsVerifyCode | SendSms |
| 手机号参数 | phone_number（单数） | phone_numbers（复数） |
| 验证码生成 | 阿里云自动生成（##code##） | 需自行生成并传入 |
| Endpoint | dypnsapi.aliyuncs.com | dysmsapi.aliyuncs.com |

## 五、阿里云RAM权限配置

子账户需要授权以下权限策略：

1. **AliyunDypnsFullAccess** - 号码认证服务完整权限（必须）
2. AliyunDysmsFullAccess - 短信服务完整权限（如果同时使用传统短信服务）

授权路径：RAM控制台 → 用户 → 权限管理 → 新增授权

## 六、项目文件结构

```
sms-login/
├── backend/
│   ├── main.py              # FastAPI主程序，提供API接口
│   ├── sms_service.py       # 短信发送核心逻辑
│   ├── requirements.txt     # Python依赖
│   ├── .env                 # 环境变量配置（敏感信息）
│   └── test_sms.py          # 短信发送测试脚本
├── frontend/
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   └── src/
│       ├── main.jsx
│       ├── App.jsx          # React登录组件
│       └── App.css
└── README.md
```

## 七、后端API接口

### 7.1 发送验证码

```
POST /api/sms/send
Content-Type: application/json

Request:
{
    "phone": "13800138000"
}

Response (成功):
{
    "success": true,
    "message": "验证码已发送"
}

Response (失败):
{
    "detail": "错误信息"
}
```

### 7.2 验证码登录

```
POST /api/sms/login
Content-Type: application/json

Request:
{
    "phone": "13800138000",
    "code": "123456"
}

Response (成功):
{
    "success": true,
    "message": "登录成功",
    "token": "jwt_token_here",
    "user": {"phone": "13800138000"}
}

Response (失败):
{
    "detail": "验证码错误"
}
```

## 八、集成到其他业务的步骤

### 步骤1：复制核心文件

将以下文件复制到目标项目：
- `sms_service.py` - 短信发送核心逻辑

### 步骤2：安装依赖

```bash
pip install alibabacloud_dypnsapi20170525 python-dotenv
```

### 步骤3：配置环境变量

在目标项目的 `.env` 文件中添加：

```env
ALIYUN_ACCESS_KEY_ID=<your_access_key_id>
ALIYUN_ACCESS_KEY_SECRET=<your_access_key_secret>
ALIYUN_SMS_SIGN_NAME=<your_sms_sign_name>
ALIYUN_SMS_TEMPLATE_CODE=<your_template_code>
SMS_TEST_MODE=false
```

### 步骤4：调用发送函数

```python
from sms_service import send_sms_code

# 发送验证码
success = send_sms_code("13800138000", "123456")
# 注意：第二个参数code在当前实现中未使用，因为阿里云自动生成
```

## 九、注意事项

1. **验证码由后端生成**：使用`random.randint(100000, 999999)`生成6位验证码，传入API发送
2. **验证码校验**：验证码存储在后端内存/Redis中，用户输入后在本地校验
3. **发送频率限制**：限制60秒内只能发送一次（防止短信轰炸）
4. **有效期**：验证码5分钟后过期，需重新获取
5. **Endpoint**：使用国内节点 `dypnsapi.aliyuncs.com`
6. **安全建议**：生产环境使用Redis存储验证码，添加图形验证码防刷

## 十、测试验证

运行测试脚本验证配置是否正确：

```bash
cd backend
python test_sms.py
```

预期输出：
```
阿里云返回: code=OK, message=OK
短信发送成功: <手机号>
发送结果: 成功
```

## 十一、常见错误及解决

| 错误码 | 原因 | 解决方案 |
|--------|------|----------|
| NoPermission | AccessKey无权限 | RAM控制台授权AliyunDypnsFullAccess |
| isv.SMS_TEMPLATE_ILLEGAL | 模板不存在 | 检查template_code是否正确 |
| InvalidParameterValue | 参数错误 | 检查template_param格式是否为有效JSON |
| Forbidden.NoPermission | 子账户无权限 | 授权AliyunDypnsFullAccess权限 |

## 十二、完整sms_service.py源码

```python
import os
from dotenv import load_dotenv

load_dotenv()

ACCESS_KEY_ID = os.getenv("ALIYUN_ACCESS_KEY_ID", "")
ACCESS_KEY_SECRET = os.getenv("ALIYUN_ACCESS_KEY_SECRET", "")
SIGN_NAME = os.getenv("ALIYUN_SMS_SIGN_NAME", "")
TEMPLATE_CODE = os.getenv("ALIYUN_SMS_TEMPLATE_CODE", "")
TEST_MODE = os.getenv("SMS_TEST_MODE", "true").lower() == "true"

def send_sms_code(phone: str, code: str) -> bool:
    """
    发送短信验证码
    
    Args:
        phone: 11位手机号
        code: 6位数字验证码
    
    Returns:
        bool: 发送成功返回True
    """
    if TEST_MODE:
        print(f"【测试模式】手机号: {phone}, 验证码: {code}")
        return True
    
    if not all([ACCESS_KEY_ID, ACCESS_KEY_SECRET, SIGN_NAME, TEMPLATE_CODE]):
        print("错误：阿里云配置不完整")
        return False
    
    try:
        from alibabacloud_dypnsapi20170525.client import Client
        from alibabacloud_dypnsapi20170525 import models
        from alibabacloud_tea_openapi import models as open_api_models
        
        config = open_api_models.Config(
            access_key_id=ACCESS_KEY_ID,
            access_key_secret=ACCESS_KEY_SECRET
        )
        config.endpoint = "dypnsapi.aliyuncs.com"
        client = Client(config)
        
        # 使用传入的验证码，而非阿里云自动生成
        request = models.SendSmsVerifyCodeRequest(
            phone_number=phone,
            sign_name=SIGN_NAME,
            template_code=TEMPLATE_CODE,
            template_param=f'{{"code":"{code}","min":"5"}}'
        )
        
        response = client.send_sms_verify_code(request)
        
        if response.body.code == "OK":
            print(f"短信发送成功: {phone}")
            return True
        else:
            print(f"短信发送失败: {response.body.code}, {response.body.message}")
            return False
            
    except Exception as e:
        print(f"短信发送异常: {str(e)}")
        return False
```
