import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { AuthErrorCode, AuthException } from './auth-error';
import { SmsGateway } from './sms-gateway';

interface CodeRecord {
  code: string;
  expiresAt: Date;
}

const PHONE_REGEX = /^1[3-9][0-9]{9}$/;

@Injectable()
export class VerificationCodeService {
  constructor(
    @Inject('SMS_GATEWAY') private readonly smsGateway: SmsGateway,
    @Inject('REDIS') private readonly redis: Redis,
  ) {}

  private codeKey(phone: string): string {
    return `passport:vc:code:${phone}`;
  }

  private cooldownKey(phone: string): string {
    return `passport:vc:cooldown:${phone}`;
  }

  private dailyKey(phone: string, day: string): string {
    return `passport:vc:daily:${phone}:${day}`;
  }

  private ipWindowKey(ip: string): string {
    return `passport:vc:ip:${ip}`;
  }

  private generateCode(): string {
    return Array.from({ length: 6 }, () => Math.floor(Math.random() * 10)).join('');
  }

  async saveCode(phone: string, code: string, ttlSeconds: number, now = new Date()): Promise<void> {
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);
    const rec: CodeRecord = { code, expiresAt };

    // 为了保持“过期后仍能返回 ERR_CODE_EXPIRED”的行为，额外保留一段宽限期。
    const graceSeconds = 60 * 60; // 1 hour
    const ttl = Math.max(1, ttlSeconds + graceSeconds);

    await this.redis.set(this.codeKey(phone), JSON.stringify(rec), 'EX', ttl);
  }

  async validateCode(phone: string, code: string, now = new Date()): Promise<void> {
    const raw = await this.redis.get(this.codeKey(phone));
    if (!raw) throw new AuthException(AuthErrorCode.ERR_PHONE_INVALID, 'no code');

    let rec: CodeRecord;
    try {
      const parsed = JSON.parse(raw) as CodeRecord;
      rec = { code: String(parsed.code), expiresAt: new Date(parsed.expiresAt) };
    } catch {
      throw new AuthException(AuthErrorCode.ERR_PHONE_INVALID, 'no code');
    }

    if (Number.isNaN(rec.expiresAt.getTime())) {
      throw new AuthException(AuthErrorCode.ERR_PHONE_INVALID, 'no code');
    }
    if (now >= rec.expiresAt) throw new AuthException(AuthErrorCode.ERR_CODE_EXPIRED, 'expired');
    if (code !== rec.code) throw new AuthException(AuthErrorCode.ERR_CODE_INVALID, 'mismatch');
  }

  async sendCode(phone: string, ip?: string): Promise<void> {
    if (!PHONE_REGEX.test(phone)) {
      throw new AuthException(AuthErrorCode.ERR_PHONE_INVALID, 'invalid phone');
    }

    const now = new Date();

    // 60 秒内同一手机号最多发送 1 次。
    const cooldownSeconds = 60;
    const cooldownOk = await this.redis.set(this.cooldownKey(phone), now.toISOString(), 'EX', cooldownSeconds, 'NX');
    if (!cooldownOk) {
      throw new AuthException(AuthErrorCode.ERR_CODE_TOO_FREQUENT, 'too frequent');
    }

    // 每日最多 10 次（按 UTC 日期分割，保持原有行为）。
    const today = now.toISOString().slice(0, 10);
    const dailyKey = this.dailyKey(phone, today);
    const dailyCount = await this.redis.incr(dailyKey);
    if (dailyCount === 1) {
      const tomorrowUtcMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0);
      const secToTomorrow = Math.max(1, Math.ceil((tomorrowUtcMs - now.getTime()) / 1000));
      // 保留一点缓冲，避免边界抖动。
      await this.redis.expire(dailyKey, secToTomorrow + 60);
    }
    if (dailyCount > 10) {
      throw new AuthException(AuthErrorCode.ERR_CODE_TOO_FREQUENT, 'too frequent today');
    }

    if (ip) {
      // 同一 IP 60 秒窗口最多 30 次（固定窗口，保持原有语义）。
      const ipKey = this.ipWindowKey(ip);
      const perIpCount = await this.redis.incr(ipKey);
      if (perIpCount === 1) {
        await this.redis.expire(ipKey, 60);
      }
      if (perIpCount > 30) {
        throw new AuthException(AuthErrorCode.ERR_CODE_TOO_FREQUENT, 'too many requests from this ip');
      }
    }

    const code = this.generateCode();
    // 5 分钟有效期
    await this.saveCode(phone, code, 5 * 60, now);
    await this.smsGateway.sendVerificationCode(phone, code);
  }
}
