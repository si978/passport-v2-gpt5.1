import React, { useState } from 'react';
import { loginByPhone, sendCode } from '../../api/auth';
import { appConfig } from '../../config/appConfig';
import { getLoginErrorMessage, getSendCodeErrorMessage } from './errorMessages';
import { persistSession } from './tokenStorage';

export const LoginPage: React.FC = () => {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [agree, setAgree] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [message, setMessage] = useState('');

  const isValidPhone = (value: string) => /^1[3-9][0-9]{9}$/.test(value);

  const handleSendCode = async () => {
    if (!isValidPhone(phone)) {
      setMessage('手机号格式不正确');
      return;
    }
    if (cooldown > 0) return;
    try {
      await sendCode(phone);
      setMessage('验证码已发送');
      setCooldown(60);
      const timer = setInterval(() => {
        setCooldown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (err: any) {
      const code = err?.response?.data?.error_code as string | undefined;
      const friendly = getSendCodeErrorMessage(code);
      setMessage(friendly ?? '发送验证码失败');
    }
  };

  const handleSubmit: React.FormEventHandler = async (e) => {
    e.preventDefault();
    if (!isValidPhone(phone)) {
      setMessage('手机号格式不正确');
      return;
    }
    if (!/^[0-9]{6}$/.test(code)) {
      setMessage('请输入 6 位数字验证码');
      return;
    }
    if (!agree) {
      setMessage('请先勾选同意用户协议');
      return;
    }
    try {
      const data = await loginByPhone(phone, code, appConfig.appId);
      persistSession({
        guid: data.guid,
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        accountSource: data.account_source,
        userStatus: data.user_status,
        userType: data.user_type,
        roles: data.roles,
      });
      setMessage('登录成功');
      window.location.href = '/';
    } catch (err: any) {
      const code = err?.response?.data?.error_code as string | undefined;
      const friendly = getLoginErrorMessage(code);
      if (friendly) {
        setMessage(friendly);
      } else if (code) {
        setMessage(`登录失败：${code}`);
      } else {
        setMessage('登录失败');
      }
    }
  };

  return (
    <main>
      <h1>手机号登录 / 注册</h1>
      <form onSubmit={handleSubmit}>
        <div>
          <label>
            手机号：
            <input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
        </div>
        <div>
          <label>
            验证码：
            <input value={code} onChange={(e) => setCode(e.target.value)} />
          </label>
          <button type="button" onClick={handleSendCode} disabled={cooldown > 0}>
            {cooldown > 0 ? `重新发送(${cooldown}s)` : '获取验证码'}
          </button>
        </div>
        <div>
          <label>
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            已阅读并同意用户协议
          </label>
        </div>
        <button type="submit">登录</button>
      </form>
      <div>{message}</div>
    </main>
  );
};
