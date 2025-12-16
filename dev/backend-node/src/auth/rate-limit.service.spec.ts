import { RateLimitService } from './rate-limit.service';
import { AuthException, AuthErrorCode } from './auth-error';

describe('RateLimitService', () => {
  it('allows login when under per-ip and per-ip+phone limits', () => {
    const svc = new RateLimitService();
    expect(() => svc.ensureLoginAllowed('1.1.1.1', '13800138000')).not.toThrow();
  });

  it('throws ERR_CODE_TOO_FREQUENT when login exceeds per-ip limit', () => {
    const svc = new RateLimitService();
    const ip = '2.2.2.2';
    for (let i = 0; i < 60; i += 1) {
      expect(() => svc.ensureLoginAllowed(ip)).not.toThrow();
    }
    expect(() => svc.ensureLoginAllowed(ip)).toThrowError(
      expect.objectContaining({ code: AuthErrorCode.ERR_CODE_TOO_FREQUENT } as Partial<AuthException>),
    );
  });

  it('throws ERR_CODE_TOO_FREQUENT when login exceeds per-ip+phone limit', () => {
    const svc = new RateLimitService();
    const ip = '3.3.3.3';
    const phone = '13800138000';
    for (let i = 0; i < 10; i += 1) {
      expect(() => svc.ensureLoginAllowed(ip, phone)).not.toThrow();
    }
    expect(() => svc.ensureLoginAllowed(ip, phone)).toThrowError(
      expect.objectContaining({ code: AuthErrorCode.ERR_CODE_TOO_FREQUENT } as Partial<AuthException>),
    );
  });

  it('allows refresh when under per-ip limit and blocks when exceeded', () => {
    const svc = new RateLimitService();
    const ip = '4.4.4.4';
    for (let i = 0; i < 120; i += 1) {
      expect(() => svc.ensureRefreshAllowed(ip, 'G1')).not.toThrow();
    }
    expect(() => svc.ensureRefreshAllowed(ip, 'G1')).toThrowError(
      expect.objectContaining({ code: AuthErrorCode.ERR_CODE_TOO_FREQUENT } as Partial<AuthException>),
    );
  });
});
