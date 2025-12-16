import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';

describe('MetricsController', () => {
  it('returns prometheus-style metrics text based on snapshot', () => {
    const svc = new MetricsService();
    svc.incLoginSuccess();
    svc.incLoginFailure();
    svc.incSendCodeFailure();
    svc.incRefreshFailure();
    svc.incLogoutSuccess();
    svc.incRateLimitExceeded();

    const controller = new MetricsController(svc);
    const text = controller.getMetrics();

    expect(text).toContain('passport_login_success_total 1');
    expect(text).toContain('passport_login_failure_total 1');
    expect(text).toContain('passport_send_code_failure_total 1');
    expect(text).toContain('passport_refresh_failure_total 1');
    expect(text).toContain('passport_logout_success_total 1');
    expect(text).toContain('passport_rate_limit_exceeded_total 1');
  });
});
