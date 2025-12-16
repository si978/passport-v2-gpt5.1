import { MetricsService } from './metrics.service';

describe('MetricsService', () => {
  it('starts from zero snapshot', () => {
    const m = new MetricsService();
    expect(m.snapshot()).toEqual({
      loginSuccess: 0,
      loginFailure: 0,
      sendCodeFailure: 0,
      refreshFailure: 0,
      logoutSuccess: 0,
      rateLimitExceeded: 0,
    });
  });

  it('increments counters correctly', () => {
    const m = new MetricsService();

    m.incLoginSuccess();
    m.incLoginFailure();
    m.incLoginFailure();
    m.incSendCodeFailure();
    m.incRefreshFailure();
    m.incRefreshFailure();
    m.incLogoutSuccess();
    m.incRateLimitExceeded();

    expect(m.snapshot()).toEqual({
      loginSuccess: 1,
      loginFailure: 2,
      sendCodeFailure: 1,
      refreshFailure: 2,
      logoutSuccess: 1,
      rateLimitExceeded: 1,
    });
  });

  it('reset sets all counters back to zero', () => {
    const m = new MetricsService();
    m.incLoginSuccess();
    m.reset();
    expect(m.snapshot()).toEqual({
      loginSuccess: 0,
      loginFailure: 0,
      sendCodeFailure: 0,
      refreshFailure: 0,
      logoutSuccess: 0,
      rateLimitExceeded: 0,
    });
  });
});
