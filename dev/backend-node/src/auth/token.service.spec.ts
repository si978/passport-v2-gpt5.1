import { Logger } from '@nestjs/common';
import { TokenService } from './token.service';
import { Session, AppSession } from './session.types';
import { AuthErrorCode, AuthException } from './auth-error';
import { LoginLogService } from './login-log.service';
import { AuditLogService } from './audit-log.service';

class InMemorySessionStore {
  private readonly sessions = new Map<string, Session>();

  async put(session: Session): Promise<void> {
    this.sessions.set(session.guid, session);
  }

  async update(guid: string, updater: (session: Session) => Session): Promise<Session | null> {
    const current = await this.get(guid);
    if (!current) return null;
    const next = updater(current);
    this.sessions.set(guid, next);
    return next;
  }

  async get(guid: string): Promise<Session | null> {
    return this.sessions.get(guid) ?? null;
  }

  async delete(guid: string): Promise<void> {
    this.sessions.delete(guid);
  }

  async findByAccessToken(accessToken: string): Promise<Session | null> {
    for (const s of this.sessions.values()) {
      for (const app of Object.values(s.apps)) {
        if (app.accessToken === accessToken) return s;
      }
    }
    return null;
  }
}

class FakeLoginLogService extends LoginLogService {
  public readonly logoutCalls: string[] = [];

  override recordLogout(guid: string): void {
    this.logoutCalls.push(guid);
  }
}

class FakeAuditLogService extends AuditLogService {
  override recordSsoLogin(guid: string, appId: string): void {
    super.recordSsoLogin(guid, appId);
  }
}

describe('TokenService', () => {
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('refreshAccessToken supports creating new app session for SSO', async () => {
    const store = new InMemorySessionStore();
    const loginLog = new FakeLoginLogService();
    const audit = new FakeAuditLogService();
    const svc = new TokenService(store as any, loginLog, audit);

    const now = new Date();
    const guid = 'G1';
    const session: Session = {
      guid,
      refreshToken: 'R.token',
      refreshTokenExpiresAt: new Date(now.getTime() + 2 * 24 * 3600 * 1000).toISOString(),
      apps: {
        jiuweihu: {
          accessToken: 'A.G1.jiuweihu',
          accessTokenExpiresAt: new Date(now.getTime() + 4 * 3600 * 1000).toISOString(),
          lastActiveAt: now.toISOString(),
        },
      },
    };
    await store.put(session);

    const refreshed = await svc.refreshAccessToken(guid, {
      refresh_token: 'R.token',
      app_id: 'youlishe',
      guid,
    });

    const updated = await store.get(guid);
    expect(updated).not.toBeNull();
    expect(updated!.apps.jiuweihu).toBeDefined();
    expect(updated!.apps.youlishe).toBeDefined();
    expect(updated!.apps.jiuweihu.accessToken).not.toEqual(updated!.apps.youlishe.accessToken);
    expect(refreshed.access_token).toEqual(updated!.apps.youlishe.accessToken);

    const entries = audit.getEntries();
    expect(entries.some((e) => e.type === 'sso_login' && e.guid === guid)).toBe(true);
  });

  it('refreshAccessToken throws ERR_REFRESH_EXPIRED when refresh expired', async () => {
    const store = new InMemorySessionStore();
    const loginLog = new FakeLoginLogService();
    const audit = new FakeAuditLogService();
    const svc = new TokenService(store as any, loginLog, audit);

    const now = new Date();
    const guid = 'G2';
    const session: Session = {
      guid,
      refreshToken: 'R.expired',
      refreshTokenExpiresAt: new Date(now.getTime() - 1000).toISOString(),
      apps: {
        jiuweihu: {
          accessToken: 'A.G2.old',
          accessTokenExpiresAt: now.toISOString(),
          lastActiveAt: now.toISOString(),
        },
      },
    };
    await store.put(session);

    await expect(
      svc.refreshAccessToken(guid, { refresh_token: 'R.expired', app_id: 'jiuweihu', guid }),
    ).rejects.toMatchObject({ code: AuthErrorCode.ERR_REFRESH_EXPIRED } as Partial<AuthException>);
  });

  it('logoutByAccessToken deletes session and is idempotent', async () => {
    const store = new InMemorySessionStore();
    const loginLog = new FakeLoginLogService();
    const audit = new FakeAuditLogService();
    const svc = new TokenService(store as any, loginLog, audit);

    const guid = 'G3';
    const accessToken = 'A.G3.token';
    const now = new Date();
    const session: Session = {
      guid,
      refreshToken: 'R.token',
      refreshTokenExpiresAt: new Date(now.getTime() + 1000).toISOString(),
      apps: {
        jiuweihu: {
          accessToken,
          accessTokenExpiresAt: new Date(now.getTime() + 1000).toISOString(),
          lastActiveAt: now.toISOString(),
        },
      },
    };
    await store.put(session);

    await svc.logoutByAccessToken(accessToken);
    expect(await store.get(guid)).toBeNull();
    expect(loginLog.logoutCalls).toEqual(['G3']);

    // 再次调用不应抛异常
    await expect(svc.logoutByAccessToken(accessToken)).resolves.toBeUndefined();
  });

  it('logoutByGuid deletes session by guid and is idempotent', async () => {
    const store = new InMemorySessionStore();
    const loginLog = new FakeLoginLogService();
    const audit = new FakeAuditLogService();
    const svc = new TokenService(store as any, loginLog, audit);

    const guid = 'G7';
    const accessToken = 'A.G7.token';
    const now = new Date();
    const session: Session = {
      guid,
      refreshToken: 'R.token',
      refreshTokenExpiresAt: new Date(now.getTime() + 1000).toISOString(),
      apps: {
        jiuweihu: {
          accessToken,
          accessTokenExpiresAt: new Date(now.getTime() + 1000).toISOString(),
          lastActiveAt: now.toISOString(),
        },
      },
    };
    await store.put(session);

    await svc.logoutByGuid(guid);
    expect(await store.get(guid)).toBeNull();
    expect(loginLog.logoutCalls).toEqual(['G7']);

    // 再次调用不应抛异常
    await expect(svc.logoutByGuid(guid)).resolves.toBeUndefined();
  });

  it('verifyAccessToken returns payload on success', async () => {
    const store = new InMemorySessionStore();
    const loginLog = new FakeLoginLogService();
    const audit = new FakeAuditLogService();
    const svc = new TokenService(store as any, loginLog, audit);

    const now = new Date();
    const session: Session = {
      guid: 'G4',
      refreshToken: 'R',
      refreshTokenExpiresAt: new Date(now.getTime() + 1000).toISOString(),
      apps: {
        jiuweihu: {
          accessToken: 'A.G4.good',
          accessTokenExpiresAt: new Date(now.getTime() + 1000).toISOString(),
          lastActiveAt: now.toISOString(),
        },
      },
    };
    await store.put(session);

    const res = await svc.verifyAccessToken({ access_token: 'A.G4.good', app_id: 'jiuweihu' });
    expect(res.guid).toBe('G4');
    expect(res.app_id).toBe('jiuweihu');
  });

  it('verifyAccessToken throws ERR_ACCESS_INVALID when token not found', async () => {
    const store = new InMemorySessionStore();
    const loginLog = new FakeLoginLogService();
    const audit = new FakeAuditLogService();
    const svc = new TokenService(store as any, loginLog, audit);

    await expect(
      svc.verifyAccessToken({ access_token: 'A.missing', app_id: 'jiuweihu' }),
    ).rejects.toMatchObject({ code: AuthErrorCode.ERR_ACCESS_INVALID } as Partial<AuthException>);
  });

  it('verifyAccessToken throws ERR_ACCESS_EXPIRED when token expired', async () => {
    const store = new InMemorySessionStore();
    const loginLog = new FakeLoginLogService();
    const audit = new FakeAuditLogService();
    const svc = new TokenService(store as any, loginLog, audit);

    const now = new Date();
    const session: Session = {
      guid: 'G5',
      refreshToken: 'R',
      refreshTokenExpiresAt: new Date(now.getTime() + 1000).toISOString(),
      apps: {
        jiuweihu: {
          accessToken: 'A.G5.expired',
          accessTokenExpiresAt: new Date(now.getTime() - 1000).toISOString(),
          lastActiveAt: now.toISOString(),
        },
      },
    };
    await store.put(session);

    await expect(
      svc.verifyAccessToken({ access_token: 'A.G5.expired', app_id: 'jiuweihu' }),
    ).rejects.toMatchObject({ code: AuthErrorCode.ERR_ACCESS_EXPIRED } as Partial<AuthException>);
  });

  it('verifyAccessToken throws ERR_APP_ID_MISMATCH when app_id mismatch', async () => {
    const store = new InMemorySessionStore();
    const loginLog = new FakeLoginLogService();
    const audit = new FakeAuditLogService();
    const svc = new TokenService(store as any, loginLog, audit);

    const now = new Date();
    const session: Session = {
      guid: 'G6',
      refreshToken: 'R',
      refreshTokenExpiresAt: new Date(now.getTime() + 1000).toISOString(),
      apps: {
        jiuweihu: {
          accessToken: 'A.G6.mismatch',
          accessTokenExpiresAt: new Date(now.getTime() + 1000).toISOString(),
          lastActiveAt: now.toISOString(),
        },
      },
    };
    await store.put(session);

    await expect(
      svc.verifyAccessToken({ access_token: 'A.G6.mismatch', app_id: 'youlishe' }),
    ).rejects.toMatchObject({ code: AuthErrorCode.ERR_APP_ID_MISMATCH } as Partial<AuthException>);
  });

  it('does not log raw tokens in refreshAccessToken success path', async () => {
    const store = new InMemorySessionStore();
    const loginLog = new FakeLoginLogService();
    const audit = new FakeAuditLogService();
    const svc = new TokenService(store as any, loginLog, audit);

    const now = new Date();
    const guid = 'GS';
    const refreshToken = 'R.sensitive-refresh-token';
    const existingAccessToken = 'A.GS.existing-token';

    const session: Session = {
      guid,
      refreshToken,
      refreshTokenExpiresAt: new Date(now.getTime() + 2 * 24 * 3600 * 1000).toISOString(),
      apps: {
        jiuweihu: {
          accessToken: existingAccessToken,
          accessTokenExpiresAt: new Date(now.getTime() + 4 * 3600 * 1000).toISOString(),
          lastActiveAt: now.toISOString(),
        },
      },
    };
    await store.put(session);

    await svc.refreshAccessToken(guid, { refresh_token: refreshToken, app_id: 'jiuweihu', guid });

    const allMessages = [
      ...logSpy.mock.calls.map((c) => String(c[0])),
      ...warnSpy.mock.calls.map((c) => String(c[0])),
      ...errorSpy.mock.calls.map((c) => String(c[0])),
    ].join('\n');

    expect(allMessages).not.toContain(refreshToken);
    expect(allMessages).not.toContain(existingAccessToken);
    expect(allMessages).not.toContain('A.GS.');
  });
});
