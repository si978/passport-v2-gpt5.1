import { Injectable } from '@nestjs/common';

export interface MetricsSnapshot {
  loginSuccess: number;
  loginFailure: number;
  sendCodeFailure: number;
  refreshFailure: number;
  logoutSuccess: number;
   rateLimitExceeded: number;
}

const EMPTY: MetricsSnapshot = {
  loginSuccess: 0,
  loginFailure: 0,
  sendCodeFailure: 0,
  refreshFailure: 0,
  logoutSuccess: 0,
  rateLimitExceeded: 0,
};

@Injectable()
export class MetricsService {
  private counters: MetricsSnapshot = { ...EMPTY };

  incLoginSuccess(): void {
    this.counters.loginSuccess += 1;
  }

  incLoginFailure(): void {
    this.counters.loginFailure += 1;
  }

  incSendCodeFailure(): void {
    this.counters.sendCodeFailure += 1;
  }

  incRefreshFailure(): void {
    this.counters.refreshFailure += 1;
  }

  incLogoutSuccess(): void {
    this.counters.logoutSuccess += 1;
  }

  incRateLimitExceeded(): void {
    this.counters.rateLimitExceeded += 1;
  }

  snapshot(): MetricsSnapshot {
    return { ...this.counters };
  }

  reset(): void {
    this.counters = { ...EMPTY };
  }
}
