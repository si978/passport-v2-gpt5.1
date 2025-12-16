import { SessionStore } from './session-store';
import { Session } from './session.types';

class FakeRedis {
  public readonly data = new Map<string, string>();
  public readonly setCalls: Array<{ key: string; value: string; flag: string; ttl: number }> = [];

  async set(key: string, value: string, flag: string, ttl: number): Promise<void> {
    this.setCalls.push({ key, value, flag, ttl });
    this.data.set(key, value);
  }

  async get(key: string): Promise<string | null> {
    return this.data.get(key) ?? null;
  }

  async del(key: string): Promise<void> {
    this.data.delete(key);
  }

  scanStream(_opts: { match: string }) {
    const keys = Array.from(this.data.keys());
    return {
      async *[Symbol.asyncIterator]() {
        if (keys.length > 0) {
          yield keys;
        }
      },
    };
  }
}

describe('SessionStore', () => {
  it('put/get/delete should round trip session with TTL', async () => {
    const redis = new FakeRedis();
    const store = new SessionStore(redis as any);

    const session: Session = {
      guid: 'G1',
      refreshToken: 'R.token',
      refreshTokenExpiresAt: new Date().toISOString(),
      apps: {
        jiuweihu: {
          accessToken: 'A.jiuweihu',
          accessTokenExpiresAt: new Date().toISOString(),
          lastActiveAt: new Date().toISOString(),
        },
      },
    };

    await store.put(session);
    const loaded = await store.get('G1');
    expect(loaded).toEqual(session);

    await store.delete('G1');
    const after = await store.get('G1');
    expect(after).toBeNull();

    expect(redis.setCalls).toHaveLength(1);
    const call = redis.setCalls[0];
    expect(call.key).toBe('passport:session:G1');
    expect(call.flag).toBe('EX');
    expect(call.ttl).toBe(2 * 24 * 3600); // 2 days in seconds
  });

  it('findByAccessToken returns matching session or null', async () => {
    const redis = new FakeRedis();
    const store = new SessionStore(redis as any);

    const session: Session = {
      guid: 'G2',
      refreshToken: 'R.token',
      refreshTokenExpiresAt: new Date().toISOString(),
      apps: {
        jiuweihu: {
          accessToken: 'A.G2.match',
          accessTokenExpiresAt: new Date().toISOString(),
          lastActiveAt: new Date().toISOString(),
        },
      },
    };
    redis.data.set('passport:session:G2', JSON.stringify(session));

    const found = await store.findByAccessToken('A.G2.match');
    expect(found).not.toBeNull();
    expect(found!.guid).toBe('G2');

    const none = await store.findByAccessToken('A.none');
    expect(none).toBeNull();
  });
});
