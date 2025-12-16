import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as PopCore from '@alicloud/pop-core';
import { maskCode, maskPhone } from './logging.util';
import { AuthErrorCode, AuthException } from './auth-error';

/**
 * 抽象短信网关，便于在不同环境下接入真实短信服务或使用开发 mock。
 */
export interface SmsGateway {
  sendVerificationCode(phone: string, code: string): Promise<void>;
}

@Injectable()
export class ConsoleSmsGateway implements SmsGateway {
  private readonly logger = new Logger(ConsoleSmsGateway.name);

  async sendVerificationCode(phone: string, code: string): Promise<void> {
    // 仅用于开发/测试环境：记录脱敏后的手机号与验证码，不实际调用外部网关。
    const maskedPhone = maskPhone(phone) ?? '[unknown]';
    const maskedCode = maskCode(code);
    this.logger.log(`sendVerificationCode phone=${maskedPhone}, code=${maskedCode}`);
  }
}

@Injectable()
export class HttpSmsGateway implements SmsGateway {
  private readonly logger = new Logger(HttpSmsGateway.name);

  async sendVerificationCode(phone: string, code: string): Promise<void> {
    const url = process.env.SMS_GATEWAY_URL;
    if (!url) {
      this.logger.error('SMS_GATEWAY_URL not configured');
      throw new AuthException(AuthErrorCode.ERR_INTERNAL, 'sms gateway not configured');
    }

    const maskedPhone = maskPhone(phone) ?? '[unknown]';
    const apiKey = process.env.SMS_GATEWAY_KEY;

    try {
      await axios.post(
        url,
        { phone, code },
        {
          headers: apiKey ? { 'x-api-key': apiKey } : undefined,
          timeout: 5000,
        },
      );
      this.logger.log(`SMS sent to phone=${maskedPhone}`);
    } catch (e) {
      this.logger.error(`Failed to send SMS to phone=${maskedPhone}`, (e as Error).stack);
      throw new AuthException(AuthErrorCode.ERR_INTERNAL, 'sms gateway error');
    }
  }
}

@Injectable()
export class AliyunSmsGateway implements SmsGateway {
  private readonly logger = new Logger(AliyunSmsGateway.name);
  private readonly client: any;
  private readonly signName: string;
  private readonly templateCode: string;

  constructor() {
    const accessKeyId = process.env.ALIYUN_ACCESS_KEY_ID || process.env.ALI_SMS_ACCESS_KEY_ID;
    const accessKeySecret =
      process.env.ALIYUN_ACCESS_KEY_SECRET || process.env.ALI_SMS_ACCESS_KEY_SECRET;
    this.signName = process.env.ALIYUN_SMS_SIGN_NAME || process.env.ALI_SMS_SIGN_NAME || '';
    this.templateCode =
      process.env.ALIYUN_SMS_TEMPLATE_CODE || process.env.ALI_SMS_TEMPLATE_CODE || '';

    if (!accessKeyId || !accessKeySecret || !this.signName || !this.templateCode) {
      this.logger.error('Aliyun SMS config incomplete, fallback should prevent using this gateway');
      this.client = null;
      return;
    }

    const CoreCtor: any = (PopCore as any)?.default ?? PopCore;
    this.client = new CoreCtor({
      accessKeyId,
      accessKeySecret,
      endpoint: 'https://dypnsapi.aliyuncs.com',
      apiVersion: '2017-05-25',
    });
  }

  async sendVerificationCode(phone: string, code: string): Promise<void> {
    const maskedPhone = maskPhone(phone) ?? '[unknown]';

    if (!this.client) {
      this.logger.error('AliyunSmsGateway used without proper configuration');
      throw new AuthException(AuthErrorCode.ERR_INTERNAL, 'sms gateway not configured');
    }

    const params = {
      PhoneNumber: phone,
      SignName: this.signName,
      TemplateCode: this.templateCode,
      TemplateParam: JSON.stringify({ code, min: '5' }),
    };

    try {
      const res = await this.client.request('SendSmsVerifyCode', params, { method: 'POST' });
      const codeField = res?.Code ?? res?.code ?? res?.body?.code ?? res?.body?.Code;
      if (codeField && codeField !== 'OK') {
        const msgField = res?.Message ?? res?.message ?? res?.body?.message ?? res?.body?.Message;
        this.logger.error(
          `Aliyun SMS failed for phone=${maskedPhone}: code=${codeField}, message=${msgField ?? ''}`,
        );
        throw new AuthException(AuthErrorCode.ERR_INTERNAL, 'sms gateway error');
      }

      this.logger.log(`Aliyun SMS sent to phone=${maskedPhone}`);
    } catch (e) {
      const err = e as any;
      const errCode = err?.code ?? err?.data?.Code;
      const errMsg = err?.message ?? err?.data?.Message;
      this.logger.error(
        `Aliyun SMS exception for phone=${maskedPhone}: code=${errCode ?? 'UNKNOWN'}, message=${errMsg ?? ''}`,
        (e as Error).stack,
      );
      throw new AuthException(AuthErrorCode.ERR_INTERNAL, 'sms gateway error');
    }
  }
}
