import { Logger } from '@nestjs/common';
import axios from 'axios';
import Core from '@alicloud/pop-core';
import { ConsoleSmsGateway, HttpSmsGateway, AliyunSmsGateway } from './sms-gateway';
import { AuthErrorCode, AuthException } from './auth-error';

jest.mock('axios');
jest.mock('@alicloud/pop-core', () => {
  const CoreMock = jest.fn();
  return { __esModule: true, default: CoreMock };
});

describe('SmsGateways', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('ConsoleSmsGateway logs masked phone and code without throwing', async () => {
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    const gw = new ConsoleSmsGateway();
    await expect(gw.sendVerificationCode('13800138000', '123456')).resolves.toBeUndefined();

    expect(logSpy).toHaveBeenCalledTimes(1);
    const msg = String(logSpy.mock.calls[0][0]);
    expect(msg).toContain('138****8000');
    expect(msg).toContain('******');
    expect(msg).not.toContain('13800138000');
    expect(msg).not.toContain('123456');
  });

  it('HttpSmsGateway posts to configured SMS_GATEWAY_URL with phone and code', async () => {
    const postMock = axios.post as jest.Mock;
    postMock.mockResolvedValue({ status: 200 });

    process.env.SMS_GATEWAY_URL = 'https://sms.example.com/send';
    process.env.SMS_GATEWAY_KEY = 'test-key';

    const gw = new HttpSmsGateway();
    await gw.sendVerificationCode('13800138000', '123456');

    expect(postMock).toHaveBeenCalledWith(
      'https://sms.example.com/send',
      { phone: '13800138000', code: '123456' },
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-api-key': 'test-key' }),
      }),
    );
  });

  it('AliyunSmsGateway sends code via Dypnsapi with correct params', async () => {
    const requestMock = jest.fn().mockResolvedValue({ Code: 'OK', Message: 'OK' });
    (Core as unknown as jest.Mock).mockImplementation(() => ({ request: requestMock }));

    process.env.ALIYUN_ACCESS_KEY_ID = 'id';
    process.env.ALIYUN_ACCESS_KEY_SECRET = 'secret';
    process.env.ALIYUN_SMS_SIGN_NAME = '速通互联验证码';
    process.env.ALIYUN_SMS_TEMPLATE_CODE = '100001';

    const gw = new AliyunSmsGateway();
    await gw.sendVerificationCode('13800138000', '123456');

    expect(requestMock).toHaveBeenCalledWith(
      'SendSmsVerifyCode',
      {
        PhoneNumber: '13800138000',
        SignName: '速通互联验证码',
        TemplateCode: '100001',
        TemplateParam: JSON.stringify({ code: '123456', min: '5' }),
      },
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('AliyunSmsGateway throws AuthException when provider returns non-OK code', async () => {
    const requestMock = jest.fn().mockResolvedValue({ Code: 'ERROR', Message: 'fail' });
    (Core as unknown as jest.Mock).mockImplementation(() => ({ request: requestMock }));

    process.env.ALIYUN_ACCESS_KEY_ID = 'id';
    process.env.ALIYUN_ACCESS_KEY_SECRET = 'secret';
    process.env.ALIYUN_SMS_SIGN_NAME = '速通互联验证码';
    process.env.ALIYUN_SMS_TEMPLATE_CODE = '100001';

    const gw = new AliyunSmsGateway();
    await expect(gw.sendVerificationCode('13800138000', '123456')).rejects.toEqual(
      expect.objectContaining({ code: AuthErrorCode.ERR_INTERNAL } as Partial<AuthException>),
    );
  });
});
