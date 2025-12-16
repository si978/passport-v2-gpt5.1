import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('returns ok status with timestamp and uptime', () => {
    const c = new HealthController();
    const res = c.health();

    expect(res.status).toBe('ok');
    expect(typeof res.timestamp).toBe('string');
    expect(typeof res.uptime).toBe('number');
    expect(res.uptime).toBeGreaterThanOrEqual(0);
    expect(Number.isNaN(Date.parse(res.timestamp))).toBe(false);
  });
});
