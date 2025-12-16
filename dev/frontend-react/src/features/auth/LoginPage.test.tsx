import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LoginPage } from './LoginPage';
import * as authApi from '../../api/auth';

describe('LoginPage', () => {
  it('shows error when phone format is invalid on send code', async () => {
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText('手机号：'), { target: { value: '12345' } });
    fireEvent.click(screen.getByText('获取验证码'));

    expect(await screen.findByText('手机号格式不正确')).toBeInTheDocument();
  });

  it('calls sendCode and starts cooldown when phone valid', async () => {
    const sendCodeSpy = vi.spyOn(authApi, 'sendCode').mockResolvedValue(undefined);

    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText('手机号：'), { target: { value: '13800138000' } });
    fireEvent.click(screen.getByText('获取验证码'));

    await waitFor(() => {
      expect(sendCodeSpy).toHaveBeenCalledWith('13800138000');
    });
  });

  it('shows friendly message for ERR_CODE_TOO_FREQUENT on send code', async () => {
    vi.spyOn(authApi, 'sendCode').mockRejectedValue({
      response: { data: { error_code: 'ERR_CODE_TOO_FREQUENT' } },
    } as any);

    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText('手机号：'), { target: { value: '13800138000' } });
    fireEvent.click(screen.getByText('获取验证码'));

    expect(
      await screen.findByText('验证码发送过于频繁，请稍后重试'),
    ).toBeInTheDocument();
  });

  it('shows login error message mapping for ERR_CODE_INVALID', async () => {
    vi.spyOn(authApi, 'sendCode').mockResolvedValue(undefined);
    vi.spyOn(authApi, 'loginByPhone').mockRejectedValue({
      response: { data: { error_code: 'ERR_CODE_INVALID' } },
    } as any);

    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText('手机号：'), {
      target: { value: '13800138000' },
    });
    fireEvent.change(screen.getByLabelText('验证码：'), {
      target: { value: '123456' },
    });
    fireEvent.click(screen.getByLabelText('已阅读并同意用户协议'));
    fireEvent.click(screen.getByText('登录'));

    expect(await screen.findByText('验证码错误，请重新输入')).toBeInTheDocument();
  });

  it('shows login error message mapping for ERR_CODE_EXPIRED', async () => {
    vi.spyOn(authApi, 'sendCode').mockResolvedValue(undefined);
    vi.spyOn(authApi, 'loginByPhone').mockRejectedValue({
      response: { data: { error_code: 'ERR_CODE_EXPIRED' } },
    } as any);

    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText('手机号：'), {
      target: { value: '13800138000' },
    });
    fireEvent.change(screen.getByLabelText('验证码：'), {
      target: { value: '123456' },
    });
    fireEvent.click(screen.getByLabelText('已阅读并同意用户协议'));
    fireEvent.click(screen.getByText('登录'));

    expect(await screen.findByText('验证码已过期，请重新获取')).toBeInTheDocument();
  });

  it('shows login error message mapping for ERR_USER_BANNED', async () => {
    vi.spyOn(authApi, 'sendCode').mockResolvedValue(undefined);
    vi.spyOn(authApi, 'loginByPhone').mockRejectedValue({
      response: { data: { error_code: 'ERR_USER_BANNED' } },
    } as any);

    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText('手机号：'), {
      target: { value: '13800138000' },
    });
    fireEvent.change(screen.getByLabelText('验证码：'), {
      target: { value: '123456' },
    });
    fireEvent.click(screen.getByLabelText('已阅读并同意用户协议'));
    fireEvent.click(screen.getByText('登录'));

    expect(await screen.findByText('账号已被封禁，请联系客服')).toBeInTheDocument();
  });

  it('shows generic error message with code when login fails with unknown error_code', async () => {
    vi.spyOn(authApi, 'sendCode').mockResolvedValue(undefined);
    vi.spyOn(authApi, 'loginByPhone').mockRejectedValue({
      response: { data: { error_code: 'ERR_SOMETHING_ELSE' } },
    } as any);

    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText('手机号：'), {
      target: { value: '13800138000' },
    });
    fireEvent.change(screen.getByLabelText('验证码：'), {
      target: { value: '123456' },
    });
    fireEvent.click(screen.getByLabelText('已阅读并同意用户协议'));
    fireEvent.click(screen.getByText('登录'));

    expect(await screen.findByText('登录失败：ERR_SOMETHING_ELSE')).toBeInTheDocument();
  });
});
