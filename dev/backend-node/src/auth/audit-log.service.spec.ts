import { AuditLogService } from './audit-log.service';

describe('AuditLogService', () => {
  it('records login, logout, ban, and unban entries in order', () => {
    const audit = new AuditLogService();

    audit.recordLogin('G1', '13800138000');
    audit.recordLogout({ accessToken: 'A.token' });
    audit.recordBan('G2');
    audit.recordUnban('G2');

    const entries = audit.getEntries();
    expect(entries).toHaveLength(4);
    expect(entries[0].type).toBe('login');
    expect(entries[0].guid).toBe('G1');
    expect(entries[0].phone).toBe('13800138000');
    expect(entries[1].type).toBe('logout');
    expect(entries[1].meta).toEqual({ accessToken: 'A.token' });
    expect(entries[2].type).toBe('ban');
    expect(entries[2].guid).toBe('G2');
    expect(entries[3].type).toBe('unban');
    expect(entries[3].guid).toBe('G2');
  });

  it('clear removes all entries', () => {
    const audit = new AuditLogService();
    audit.recordLogin('G1', '13800138000');
    expect(audit.getEntries().length).toBe(1);
    audit.clear();
    expect(audit.getEntries().length).toBe(0);
  });

  it('query filters entries by type, guid, phone and time window (in-memory)', async () => {
    const audit = new AuditLogService();

    // 固定时间点，便于窗口过滤
    const base = new Date('2025-01-01T10:00:00.000Z');
    const origNow = (audit as any).now as () => string;
    let current = base;
    (audit as any).now = () => {
      const v = current.toISOString();
      current = new Date(current.getTime() + 60_000);
      return v;
    };

    audit.recordLogin('G1', '13800138000'); // t0
    audit.recordLogout({ guid: 'G1' }); // t1
    audit.recordBan('G2'); // t2
    audit.recordUnban('G2'); // t3

    (audit as any).now = origNow;

    const all = await audit.query();
    expect(all).toHaveLength(4);

    const onlyLogin = await audit.query({ type: 'login' });
    expect(onlyLogin).toHaveLength(1);
    expect(onlyLogin[0].type).toBe('login');

    const guidG2 = await audit.query({ guid: 'G2' });
    expect(guidG2).toHaveLength(2);
    expect(guidG2.every((e) => e.guid === 'G2')).toBe(true);

    const phoneFilter = await audit.query({ phone: '13800138000' });
    expect(phoneFilter).toHaveLength(1);
    expect(phoneFilter[0].type).toBe('login');

    const windowStart = new Date('2025-01-01T10:01:00.000Z');
    const windowEnd = new Date('2025-01-01T10:02:00.000Z');
    const windowLogs = await audit.query({ start: windowStart, end: windowEnd });
    // t1, t2 在窗口内
    expect(windowLogs.map((e) => e.type)).toEqual(['logout', 'ban']);
  });

  it('query uses repository when available and maps rows', async () => {
    const rows = [
      {
        type: 'login',
        guid: 'GDB',
        phone: '13800138000',
        at: new Date('2025-01-01T10:00:00.000Z'),
        meta: { channel: 'pc' },
      },
    ];
    const findMock = jest.fn().mockResolvedValue(rows as any);
    const repo = { find: findMock } as any;

    const audit = new AuditLogService(repo);
    const start = new Date('2025-01-01T09:00:00.000Z');
    const end = new Date('2025-01-01T11:00:00.000Z');

    const result = await audit.query({ type: 'login', guid: 'GDB', phone: '13800138000', start, end });

    expect(findMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ type: 'login', guid: 'GDB', phone: '13800138000' }),
        order: { at: 'ASC' },
      }),
    );

    expect(result).toEqual([
      {
        type: 'login',
        guid: 'GDB',
        phone: '13800138000',
        at: '2025-01-01T10:00:00.000Z',
        meta: { channel: 'pc' },
      },
    ]);
  });

  it('query falls back to in-memory cache when repository throws', async () => {
    const audit = new AuditLogService();
    const origNow = (audit as any).now as () => string;
    (audit as any).now = () => '2025-01-01T10:00:00.000Z';

    audit.recordLogin('GF', '13800138000');

    (audit as any).now = origNow;

    (audit as any).repo = {
      find: jest.fn().mockRejectedValue(new Error('db down')),
    };

    const result = await audit.query({ guid: 'GF' });
    expect(result).toHaveLength(1);
    expect(result[0].guid).toBe('GF');
  });
});
