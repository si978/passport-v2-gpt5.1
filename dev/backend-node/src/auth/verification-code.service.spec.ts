import { AuthErrorCode, AuthException } from './auth-error';
import { VerificationCodeService } from './verification-code.service';
import type { SmsGateway } from './sms-gateway';

describe('VerificationCodeService', () => {
  const gateway: SmsGateway = {
    sendVerificationCode: jest.fn(async () => {}),
  };

  it('saveCode + validateCode should accept correct code and reject wrong code', () => {
    const svc = new VerificationCodeService(gateway);
    const phone = '13800138000';
    const code = '123456';
    svc.saveCode(phone, code, 60);

    // 正确验证码应通过
    expect(() => svc.validateCode(phone, code)).not.toThrow();

    // 错误验证码应抛 ERR_CODE_INVALID
    expect(() => svc.validateCode(phone, '000000')).toThrowError(
      expect.objectContaining({ code: AuthErrorCode.ERR_CODE_INVALID } as Partial<AuthException>),
    );
  });

  it('sendCode should reject invalid phone format', async () => {
    const svc = new VerificationCodeService(gateway);
    await expect(svc.sendCode('12345')).rejects.toMatchObject({
      code: AuthErrorCode.ERR_PHONE_INVALID,
    } as Partial<AuthException>);
  });

  it('validateCode should throw ERR_PHONE_INVALID when no record exists', () => {
    const svc = new VerificationCodeService(gateway);
    const phone = '13800138000';
    expect(() => svc.validateCode(phone, '123456')).toThrowError(
      expect.objectContaining({ code: AuthErrorCode.ERR_PHONE_INVALID } as Partial<AuthException>),
    );
  });

  it('validateCode should throw ERR_CODE_EXPIRED when code is expired', () => {
    const svc = new VerificationCodeService(gateway);
    const phone = '13800138000';
    const code = '123456';
    // ttlSeconds = 0 使得立刻过期
    svc.saveCode(phone, code, 0);

    const future = new Date(Date.now() + 1000);
    expect(() => svc.validateCode(phone, code, future)).toThrowError(
      expect.objectContaining({ code: AuthErrorCode.ERR_CODE_EXPIRED } as Partial<AuthException>),
    );
  });

  it('sendCode should enforce frequency limit per phone', async () => {
    const svc = new VerificationCodeService(gateway);
    const phone = '13800138000';
    await expect(svc.sendCode(phone)).resolves.toBeUndefined();
    await expect(svc.sendCode(phone)).rejects.toMatchObject({
      code: AuthErrorCode.ERR_CODE_TOO_FREQUENT,
    } as Partial<AuthException>);
  });

  it('sendCode should enforce daily max per phone', async () => {
    const svc = new VerificationCodeService(gateway);
    const phone = '13800138001';

    for (let i = 0; i < 10; i += 1) {
      await expect(svc.sendCode(phone)).resolves.toBeUndefined();
      // 调整 lastSentAt 使下一次调用不受 60 秒限制影响
      (svc as any).lastSentAt.set(phone, new Date(Date.now() - 61 * 1000));
    }

    await expect(svc.sendCode(phone)).rejects.toMatchObject({
      code: AuthErrorCode.ERR_CODE_TOO_FREQUENT,
    } as Partial<AuthException>);
  });

  it('sendCode should enforce basic per-ip window limit when ip provided', async () => {
    const svc = new VerificationCodeService(gateway);
    const ip = '9.9.9.9';

    for (let i = 0; i < 30; i += 1) {
      // 60 秒窗口内同一 IP 对不同手机号连续请求应在前 30 次内成功
      const suffix = (10_000_000 + i).toString().slice(1); // 7 位
      const phone = `1380${suffix}`; // 合法的 11 位中国大陆手机号
      // eslint-disable-next-line no-await-in-loop
      await expect(svc.sendCode(phone, ip)).resolves.toBeUndefined();
    }

    await expect(svc.sendCode('13800999999', ip)).rejects.toMatchObject({
      code: AuthErrorCode.ERR_CODE_TOO_FREQUENT,
    } as Partial<AuthException>);
  });
});
