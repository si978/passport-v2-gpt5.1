import { LoginLogService } from './login-log.service';

describe('LoginLogService', () => {
  it('filters logs by phone, time window and channel', async () => {
    const svc = new LoginLogService();
    const base = new Date('2025-01-01T10:00:00.000Z');

    // user A, pc login + logout
    svc.recordLogin('GA', '13800138000', true, {
      channel: 'pc',
      ip: '1.1.1.1',
      when: base,
    });
    svc.recordLogout('GA', '13800138000', {
      channel: 'pc',
      ip: '1.1.1.1',
      when: new Date(base.getTime() + 60 * 60 * 1000),
    });

    // user A, mobile failed login
    svc.recordLogin('GA', '13800138000', false, {
      channel: 'mobile',
      ip: '2.2.2.2',
      errorCode: 'ERR_CODE_INVALID',
      when: new Date(base.getTime() + 2 * 60 * 60 * 1000),
    });

    // user B, pc login
    svc.recordLogin('GB', '13800138001', true, {
      channel: 'pc',
      ip: '3.3.3.3',
      when: new Date(base.getTime() + 3 * 60 * 60 * 1000),
    });

    const logsA = await svc.queryLogs({ phone: '13800138000' });
    expect(logsA).toHaveLength(2);
    expect(logsA.every((l) => l.phone === '13800138000')).toBe(true);

    const start = new Date('2025-01-01T11:00:00.000Z');
    const end = new Date('2025-01-01T13:00:00.000Z');
    const logsWindow = await svc.queryLogs({ start, end });
    expect(logsWindow).toHaveLength(2);

    const pcLogs = await svc.queryLogs({ channel: 'pc' });
    expect(pcLogs).toHaveLength(2);
    expect(pcLogs.every((l) => l.channel === 'pc')).toBe(true);
  });

  it('recordLogout updates logoutAt on the latest open session', async () => {
    const svc = new LoginLogService();
    const base = new Date('2025-01-02T10:00:00.000Z');

    svc.recordLogin('GC', '13800138002', true, { channel: 'pc', when: base });
    svc.recordLogout('GC', '13800138002', {
      channel: 'pc',
      when: new Date(base.getTime() + 30 * 60 * 1000),
    });

    const logs = await svc.queryLogs({ phone: '13800138002' });
    expect(logs).toHaveLength(1);
    expect(logs[0].logoutAt).toBeDefined();
  });

  it('clear removes all logs', async () => {
    const svc = new LoginLogService();
    svc.recordLogin('G1', '13800138000', true);
    expect((await svc.queryLogs()).length).toBe(1);
    svc.clear();
    expect((await svc.queryLogs()).length).toBe(0);
  });

  it('queryLogs uses repository when provided and maps rows correctly', async () => {
    const rows = [
      {
        guid: 'GR',
        phone: '13800138000',
        loginAt: new Date('2025-01-01T10:00:00.000Z'),
        logoutAt: new Date('2025-01-01T11:00:00.000Z'),
        channel: 'pc',
        ip: '1.1.1.1',
        success: true,
        errorCode: 'ERR_TEST',
      },
    ];

    const findMock = jest.fn().mockResolvedValue(rows);
    const repo = { find: findMock } as any;
    const svc = new LoginLogService(repo);

    const start = new Date('2025-01-01T09:00:00.000Z');
    const end = new Date('2025-01-01T12:00:00.000Z');

    const result = await svc.queryLogs({ phone: '13800138000', channel: 'pc', start, end, offset: 5, limit: 10 });

    expect(findMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ phone: '13800138000', channel: 'pc' }),
        order: { loginAt: 'ASC' },
        skip: 5,
        take: 10,
      }),
    );

    expect(result).toEqual([
      {
        guid: 'GR',
        phone: '13800138000',
        loginAt: '2025-01-01T10:00:00.000Z',
        logoutAt: '2025-01-01T11:00:00.000Z',
        channel: 'pc',
        ip: '1.1.1.1',
        success: true,
        errorCode: 'ERR_TEST',
        mac: null,
        gateway: null,
        cafeName: null,
      },
    ]);
  });

  it('queryLogs falls back to in-memory cache when repository throws', async () => {
    const svc = new LoginLogService();

    svc.recordLogin('GF', '13800138000', true, {
      channel: 'pc',
      ip: '1.1.1.1',
      when: new Date('2025-01-01T10:00:00.000Z'),
    });

    // 模拟运行时才注入 repo 的情况：query 时抛错应回退到内存 logs
    (svc as any).repo = {
      find: jest.fn().mockRejectedValue(new Error('db down')),
    };

    const result = await svc.queryLogs({ phone: '13800138000' });
    expect(result).toHaveLength(1);
    expect(result[0].guid).toBe('GF');
  });
});
