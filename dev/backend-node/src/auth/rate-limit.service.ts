import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { AuthErrorCode, AuthException } from './auth-error';

@Injectable()
export class RateLimitService {
  constructor(@Inject('REDIS') private readonly redis: Redis) {}

  private readonly logger = new Logger(RateLimitService.name);

  private async touch(key: string, maxPerWindow: number, windowSeconds: number): Promise<void> {
    try {
      const count = await this.redis.incr(key);
      if (count === 1) {
        await this.redis.expire(key, windowSeconds);
      }
      if (count > maxPerWindow) {
        throw new AuthException(AuthErrorCode.ERR_CODE_TOO_FREQUENT, 'too many requests');
      }
    } catch (e) {
      if (e instanceof AuthException) {
        throw e;
      }
      this.logger.error(`rate limit redis error for key=${key}`, (e as Error).stack);
      throw new AuthException(AuthErrorCode.ERR_INTERNAL, 'service temporarily unavailable');
    }
  }

  /**
   * 登录接口限流：
   * - 按 IP：60 秒窗口内最多 60 次；
   * - 按 IP+手机号：60 秒窗口内最多 10 次。
   */
  async ensureLoginAllowed(ip?: string, phone?: string): Promise<void> {
    if (!ip) return;
    const windowSeconds = 60;

    await this.touch(`passport:rl:login:ip:${ip}`, 60, windowSeconds);

    if (phone) {
      await this.touch(`passport:rl:login:ip_phone:${ip}:${phone}`, 10, windowSeconds);
    }
  }

  /**
   * Token 刷新接口限流：
   * - 按 IP：60 秒窗口内最多 120 次。
   */
  async ensureRefreshAllowed(ip?: string, guid?: string): Promise<void> {
    if (!ip) return;
    const windowSeconds = 60;

    const key = guid ? `passport:rl:refresh:ip_guid:${ip}:${guid}` : `passport:rl:refresh:ip:${ip}`;
    await this.touch(key, 120, windowSeconds);
  }
}
