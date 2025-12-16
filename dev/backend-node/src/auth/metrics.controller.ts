import { Controller, Get, Header } from '@nestjs/common';
import { ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { MetricsService } from './metrics.service';

function toPrometheus(metrics: ReturnType<MetricsService['snapshot']>): string {
  const lines: string[] = [
    '# HELP passport_login_success_total Number of successful logins',
    '# TYPE passport_login_success_total counter',
    `passport_login_success_total ${metrics.loginSuccess}`,
    '# HELP passport_login_failure_total Number of failed logins',
    '# TYPE passport_login_failure_total counter',
    `passport_login_failure_total ${metrics.loginFailure}`,
    '# HELP passport_send_code_failure_total Number of failed verification code sends',
    '# TYPE passport_send_code_failure_total counter',
    `passport_send_code_failure_total ${metrics.sendCodeFailure}`,
    '# HELP passport_refresh_failure_total Number of failed token refresh attempts',
    '# TYPE passport_refresh_failure_total counter',
    `passport_refresh_failure_total ${metrics.refreshFailure}`,
    '# HELP passport_logout_success_total Number of successful logouts',
    '# TYPE passport_logout_success_total counter',
    `passport_logout_success_total ${metrics.logoutSuccess}`,
    '# HELP passport_rate_limit_exceeded_total Number of requests blocked by rate limit',
    '# TYPE passport_rate_limit_exceeded_total counter',
    `passport_rate_limit_exceeded_total ${metrics.rateLimitExceeded}`,
  ];
  return `${lines.join('\n')}\n`;
}

@ApiTags('metrics')
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  @ApiOperation({ summary: 'Prometheus 指标导出' })
  @ApiProduces('text/plain')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  getMetrics(): string {
    const snapshot = this.metrics.snapshot();
    return toPrometheus(snapshot);
  }
}
