import { RateLimitService } from './rate-limit.service';
import { AuthException, AuthErrorCode } from './auth-error';
import { FakeRedis } from './test-utils/fake-redis';

describe('RateLimitService', () => {
  it('allows login when under per-ip and per-ip+phone limits', async () => {
    const svc = new RateLimitService(new FakeRedis() as any);
    await expect(svc.ensureLoginAllowed('1.1.1.1', '13800138000')).resolves.toBeUndefined();
  });

  it('throws ERR_CODE_TOO_FREQUENT when login exceeds per-ip limit', async () => {
    const svc = new RateLimitService(new FakeRedis() as any);
    const ip = '2.2.2.2';
    for (let i = 0; i < 60; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await expect(svc.ensureLoginAllowed(ip)).resolves.toBeUndefined();
    }
    await expect(svc.ensureLoginAllowed(ip)).rejects.toMatchObject({
      code: AuthErrorCode.ERR_CODE_TOO_FREQUENT,
    } as Partial<AuthException>);
  });

  it('throws ERR_CODE_TOO_FREQUENT when login exceeds per-ip+phone limit', async () => {
    const svc = new RateLimitService(new FakeRedis() as any);
    const ip = '3.3.3.3';
    const phone = '13800138000';
    for (let i = 0; i < 10; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await expect(svc.ensureLoginAllowed(ip, phone)).resolves.toBeUndefined();
    }
    await expect(svc.ensureLoginAllowed(ip, phone)).rejects.toMatchObject({
      code: AuthErrorCode.ERR_CODE_TOO_FREQUENT,
    } as Partial<AuthException>);
  });

  it('allows refresh when under per-ip limit and blocks when exceeded', async () => {
    const svc = new RateLimitService(new FakeRedis() as any);
    const ip = '4.4.4.4';
    for (let i = 0; i < 120; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await expect(svc.ensureRefreshAllowed(ip, 'G1')).resolves.toBeUndefined();
    }
    await expect(svc.ensureRefreshAllowed(ip, 'G1')).rejects.toMatchObject({
      code: AuthErrorCode.ERR_CODE_TOO_FREQUENT,
    } as Partial<AuthException>);
  });
});
