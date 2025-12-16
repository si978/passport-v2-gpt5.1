import { Injectable } from '@nestjs/common';
import { AuthErrorCode, AuthException } from './auth-error';

interface WindowCounter {
  windowStart: number;
  count: number;
}

@Injectable()
export class RateLimitService {
  private readonly loginByIp = new Map<string, WindowCounter>();
  private readonly loginByIpPhone = new Map<string, WindowCounter>();
  private readonly refreshByIp = new Map<string, WindowCounter>();

  private touch(map: Map<string, WindowCounter>, key: string, maxPerWindow: number, nowMs: number, windowMs: number) {
    const current = map.get(key);
    if (!current || nowMs - current.windowStart >= windowMs) {
      map.set(key, { windowStart: nowMs, count: 1 });
      return;
    }
    if (current.count >= maxPerWindow) {
      throw new AuthException(AuthErrorCode.ERR_CODE_TOO_FREQUENT, 'too many requests');
    }
    current.count += 1;
    map.set(key, current);
  }

  /**
   * 登录接口限流：
   * - 按 IP：60 秒窗口内最多 60 次；
   * - 按 IP+手机号：60 秒窗口内最多 10 次。
   */
  ensureLoginAllowed(ip?: string, phone?: string): void {
    if (!ip) return;
    const nowMs = Date.now();
    const windowMs = 60 * 1000;

    this.touch(this.loginByIp, ip, 60, nowMs, windowMs);

    if (phone) {
      const key = `${ip}|${phone}`;
      this.touch(this.loginByIpPhone, key, 10, nowMs, windowMs);
    }
  }

  /**
   * Token 刷新接口限流：
   * - 按 IP：60 秒窗口内最多 120 次。
   */
  ensureRefreshAllowed(ip?: string, guid?: string): void {
    if (!ip) return;
    const nowMs = Date.now();
    const windowMs = 60 * 1000;

    const key = guid ? `${ip}|${guid}` : ip;
    this.touch(this.refreshByIp, key, 120, nowMs, windowMs);
  }
}
