import { AdminService, AdminUserStatus } from './admin.service';
import { User } from './user.entity';
import { SessionStore } from './session-store';
import { LoginLogService } from './login-log.service';

class InMemoryUserRepo {
  private readonly users = new Map<string, User>();

  async find(options: { where?: { status?: number }; order?: any }): Promise<User[]> {
    const status = options.where?.status;
    let rows = Array.from(this.users.values());
    if (status !== undefined) {
      rows = rows.filter((u) => u.status === status);
    }
    return rows;
  }

  async findOne(options: { where: { guid: string } }): Promise<User | null> {
    const guid = options.where.guid;
    return this.users.get(guid) ?? null;
  }

  async save(user: User): Promise<User> {
    this.users.set(user.guid, user);
    return user;
  }

  seed(user: Partial<User>) {
    const u = new User();
    Object.assign(u, user);
    this.users.set(u.guid, u as User);
  }
}

class FakeSessionStore extends SessionStore {
  public readonly deleted: string[] = [];

  constructor() {
    // @ts-expect-error fake redis client
    super({});
  }

  override async delete(guid: string): Promise<void> {
    this.deleted.push(guid);
  }
}

class FakeLoginLogService extends LoginLogService {}

describe('AdminService', () => {
  it('listUsers returns all users and can filter by status', async () => {
    const repo = new InMemoryUserRepo();
    const sessions = new FakeSessionStore();
    const loginLogs = new FakeLoginLogService();
    const svc = new AdminService(
      // @ts-expect-error using in-memory repo instead of TypeORM
      repo,
      sessions,
      loginLogs,
    );

    repo.seed({ guid: 'G1', phone: '13800138010', status: 1, accountSource: 'phone' });
    repo.seed({ guid: 'G2', phone: '13800138011', status: 0, accountSource: 'phone' });

    const all = await svc.listUsers();
    expect(all.map((u) => u.guid).sort()).toEqual(['G1', 'G2']);

    const banned = await svc.listUsers('BANNED');
    expect(banned).toHaveLength(1);
    expect(banned[0].guid).toBe('G2');
    expect(banned[0].status).toBe('BANNED');
  });

  it('banUser updates status and deletes session', async () => {
    const repo = new InMemoryUserRepo();
    const sessions = new FakeSessionStore();
    const loginLogs = new FakeLoginLogService();
    const svc = new AdminService(
      // @ts-expect-error using in-memory repo instead of TypeORM
      repo,
      sessions,
      loginLogs,
    );

    repo.seed({ guid: 'G3', phone: '13800138012', status: 1, accountSource: 'phone' });

    await svc.banUser('G3');
    const users = await svc.listUsers();
    const u = users.find((x) => x.guid === 'G3')!;
    expect(u.status).toBe<'BANNED' | AdminUserStatus>('BANNED');
    expect(sessions.deleted).toContain('G3');
  });

  it('unbanUser updates status back to ACTIVE', async () => {
    const repo = new InMemoryUserRepo();
    const sessions = new FakeSessionStore();
    const loginLogs = new FakeLoginLogService();
    const svc = new AdminService(
      // @ts-expect-error using in-memory repo instead of TypeORM
      repo,
      sessions,
      loginLogs,
    );

    repo.seed({ guid: 'G4', phone: '13800138013', status: 0, accountSource: 'phone' });

    await svc.unbanUser('G4');
    const users = await svc.listUsers();
    const u = users.find((x) => x.guid === 'G4')!;
    expect(u.status).toBe<'ACTIVE' | AdminUserStatus>('ACTIVE');
  });

  it('listActivity returns mapped login logs', async () => {
    const repo = new InMemoryUserRepo();
    const sessions = new FakeSessionStore();
    const loginLogs = new LoginLogService();
    const svc = new AdminService(
      // @ts-expect-error using in-memory repo instead of TypeORM
      repo,
      sessions,
      loginLogs,
    );

    loginLogs.recordLogin('G1', '13800138010', true, {
      channel: 'pc',
      ip: '1.1.1.1',
      when: new Date('2025-01-01T10:00:00.000Z'),
    });
    loginLogs.recordLogout('G1', '13800138010', {
      channel: 'pc',
      when: new Date('2025-01-01T11:00:00.000Z'),
    });

    const activities = await svc.listActivity();
    expect(activities).toHaveLength(1);
    expect(activities[0]).toMatchObject({
      guid: 'G1',
      phone: '13800138010',
      channel: 'pc',
      ip: '1.1.1.1',
    });
    expect(activities[0].login_at).toBe('2025-01-01T10:00:00.000Z');
    expect(activities[0].logout_at).toBe('2025-01-01T11:00:00.000Z');
  });
});
