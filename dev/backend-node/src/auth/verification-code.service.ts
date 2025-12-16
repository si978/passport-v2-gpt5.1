import { Inject, Injectable } from '@nestjs/common';
import { AuthErrorCode, AuthException } from './auth-error';
import { SmsGateway } from './sms-gateway';

interface CodeRecord {
  code: string;
  expiresAt: Date;
}

const PHONE_REGEX = /^1[3-9][0-9]{9}$/;

@Injectable()
export class VerificationCodeService {
  private readonly store = new Map<string, CodeRecord>();
  private readonly lastSentAt = new Map<string, Date>();
  private readonly dailyCount = new Map<string, { date: string; count: number }>();
  private lastDailyResetDate?: string;

  // 简单的按 IP 维度窗口计数，用于基础防护；适合作为 PoC/开发环境限流。
  private readonly ipWindow = new Map<string, { windowStart: number; count: number }>();

  constructor(@Inject('SMS_GATEWAY') private readonly smsGateway: SmsGateway) {}

  private generateCode(): string {
    return Array.from({ length: 6 }, () => Math.floor(Math.random() * 10)).join('');
  }

  saveCode(phone: string, code: string, ttlSeconds: number): void {
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    this.store.set(phone, { code, expiresAt });
  }

  validateCode(phone: string, code: string, now = new Date()): void {
    const rec = this.store.get(phone);
    if (!rec) throw new AuthException(AuthErrorCode.ERR_PHONE_INVALID, 'no code');
    if (now >= rec.expiresAt) throw new AuthException(AuthErrorCode.ERR_CODE_EXPIRED, 'expired');
    if (code !== rec.code) throw new AuthException(AuthErrorCode.ERR_CODE_INVALID, 'mismatch');
  }

  async sendCode(phone: string, ip?: string): Promise<void> {
    if (!PHONE_REGEX.test(phone)) {
      throw new AuthException(AuthErrorCode.ERR_PHONE_INVALID, 'invalid phone');
    }

    const now = new Date();
    const last = this.lastSentAt.get(phone);
    if (last && now.getTime() - last.getTime() < 60 * 1000) {
      throw new AuthException(AuthErrorCode.ERR_CODE_TOO_FREQUENT, 'too frequent');
    }

    const today = now.toISOString().slice(0, 10);

    if (this.lastDailyResetDate && this.lastDailyResetDate !== today) {
      // 新的一天开始时重置每日计数，避免 Map 长期累积导致内存占用增加。
      this.dailyCount.clear();
    }
    this.lastDailyResetDate = today;

    const stat = this.dailyCount.get(phone);
    const currentCount = stat && stat.date === today ? stat.count : 0;
    if (currentCount >= 10) {
      throw new AuthException(AuthErrorCode.ERR_CODE_TOO_FREQUENT, 'too frequent today');
    }
    this.dailyCount.set(phone, { date: today, count: currentCount + 1 });

    this.lastSentAt.set(phone, now);

    if (ip) {
      const nowMs = now.getTime();
      const key = ip;
      const windowMs = 60 * 1000; // 60 秒滑动窗口
      const maxPerWindow = 30; // 同一 IP 每分钟最多 30 次验证码请求
      const current = this.ipWindow.get(key);
      if (!current || nowMs - current.windowStart >= windowMs) {
        this.ipWindow.set(key, { windowStart: nowMs, count: 1 });
      } else if (current.count >= maxPerWindow) {
        throw new AuthException(AuthErrorCode.ERR_CODE_TOO_FREQUENT, 'too many requests from this ip');
      } else {
        current.count += 1;
        this.ipWindow.set(key, current);
      }
    }

    const code = this.generateCode();
    // 5 分钟有效期
    this.saveCode(phone, code, 5 * 60);
    await this.smsGateway.sendVerificationCode(phone, code);
  }
}
