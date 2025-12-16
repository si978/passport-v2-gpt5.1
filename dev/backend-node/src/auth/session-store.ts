import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { Session } from './session.types';

const REFRESH_TTL_DAYS = 2;

@Injectable()
export class SessionStore {
  constructor(@Inject('REDIS') private readonly redis: Redis) {}

  private key(guid: string) {
    return `passport:session:${guid}`;
  }

  async put(session: Session): Promise<void> {
    const ttlSeconds = REFRESH_TTL_DAYS * 24 * 3600;
    await this.redis.set(this.key(session.guid), JSON.stringify(session), 'EX', ttlSeconds);
  }

  /**
   * 对会话做原子更新（Redis WATCH + MULTI/EXEC），避免并发 refresh 时互相覆盖 apps 字段。
   * - 找不到会话返回 null；
   * - 乐观锁冲突会重试，超过次数抛错（上层应映射为 ERR_INTERNAL）。
   */
  async update(
    guid: string,
    updater: (session: Session) => Session,
    maxRetries = 6,
  ): Promise<Session | null> {
    const key = this.key(guid);
    const ttlSeconds = REFRESH_TTL_DAYS * 24 * 3600;

    for (let attempt = 0; attempt < maxRetries; attempt += 1) {
      await this.redis.watch(key);
      const raw = await this.redis.get(key);
      if (!raw) {
        await this.redis.unwatch();
        return null;
      }

      let session: Session;
      try {
        session = JSON.parse(raw) as Session;
      } catch (e) {
        await this.redis.unwatch();
        throw e;
      }

      let next: Session;
      try {
        next = updater(session);
      } catch (e) {
        await this.redis.unwatch();
        throw e;
      }

      const tx = this.redis.multi();
      tx.set(key, JSON.stringify(next), 'EX', ttlSeconds);
      const res = await tx.exec();
      if (res) {
        return next;
      }
      // 冲突：重试
    }

    throw new Error('session update conflict');
  }

  async get(guid: string): Promise<Session | null> {
    const raw = await this.redis.get(this.key(guid));
    if (!raw) return null;
    return JSON.parse(raw) as Session;
  }

  async delete(guid: string): Promise<void> {
    await this.redis.del(this.key(guid));
  }

  async findByAccessToken(accessToken: string): Promise<Session | null> {
    const parts = accessToken.split('.');
    // 期望格式：A.{guid}.{random}
    if (parts.length < 3 || parts[0] !== 'A') {
      return null;
    }
    const guid = parts[1];
    const session = await this.get(guid);
    if (!session) return null;

    for (const app of Object.values(session.apps)) {
      if (app.accessToken === accessToken) {
        return session;
      }
    }
    return null;
  }
}
