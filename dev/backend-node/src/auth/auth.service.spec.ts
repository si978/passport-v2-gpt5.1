import { AuthService } from './auth.service';
import { AuthErrorCode, AuthException } from './auth-error';
import { User } from './user.entity';
import { GuidGenerator } from './guid-generator';
import { VerificationCodeService } from './verification-code.service';
import { SessionStore } from './session-store';
import { LoginLogService } from './login-log.service';
import type { SmsGateway } from './sms-gateway';

class InMemoryUserRepo {
  private readonly users = new Map<string, User>();

  async findOne(options: { where: { phone: string } }): Promise<User | null> {
    const phone = options.where.phone;
    for (const u of this.users.values()) {
      if (u.phone === phone) return u;
    }
    return null;
  }

  create(data: Partial<User>): User {
    const u = new User();
    Object.assign(u, data);
    return u;
  }

  async save(user: User): Promise<User> {
    this.users.set(user.guid, user);
    return user;
  }
}

class FakeGuidGenerator extends GuidGenerator {
  private seq = 1;

  override generate(userType: number): string {
    const n = (this.seq++).toString().padStart(4, '0');
    return `G${userType}${n}`;
  }
}

class FakeVerificationCodeService extends VerificationCodeService {
  constructor() {
    const gateway: SmsGateway = { sendVerificationCode: async () => {} };
    // @ts-expect-error: redis not needed for this test
    super(gateway, {});
  }

  override async validateCode(phone: string, code: string): Promise<void> {
    // 测试中视任意 code 为有效，错误分支由专门 UT 覆盖
  }
}

class InMemorySessionStore extends SessionStore {
  private readonly sessions = new Map<string, any>();

  constructor() {
    // @ts-expect-error: fake redis not needed for tests
    super({});
  }

  override async put(session: any): Promise<void> {
    this.sessions.set(session.guid, session);
  }

  override async get(guid: string): Promise<any | null> {
    return this.sessions.get(guid) ?? null;
  }
}

class FakeLoginLogService extends LoginLogService {
  public readonly records: any[] = [];

  override recordLogin(guid: string, phone: string, success: boolean, opts?: any): void {
    this.records.push({ guid, phone, success, opts });
  }
}

describe('AuthService.loginByPhone', () => {
  it('creates new user when phone not exists', async () => {
    const userRepo = new InMemoryUserRepo();
    const sessions = new InMemorySessionStore();
    const loginLog = new FakeLoginLogService();
    const service = new AuthService(
      // @ts-expect-error: using in-memory repo instead of TypeORM repo
      userRepo,
      new FakeGuidGenerator(),
      new FakeVerificationCodeService(),
      sessions,
      loginLog,
    );

    const result = await service.loginByPhone({ phone: '13800138000', code: '123456', app_id: 'jiuweihu' });

    expect(result.guid).toBeDefined();
    const session = await sessions.get(result.guid);
    expect(session).not.toBeNull();
    expect(session!.apps.jiuweihu).toBeDefined();
    expect(loginLog.records.length).toBe(1);
    expect(loginLog.records[0]).toMatchObject({
      guid: result.guid,
      phone: '13800138000',
      success: true,
    });
  });

  it('throws ERR_USER_BANNED when user is banned', async () => {
    const userRepo = new InMemoryUserRepo();
    const sessions = new InMemorySessionStore();
    const guidGen = new FakeGuidGenerator();
    const loginLog = new FakeLoginLogService();
    const service = new AuthService(
      // @ts-expect-error: using in-memory repo instead of TypeORM repo
      userRepo,
      guidGen,
      new FakeVerificationCodeService(),
      sessions,
      loginLog,
    );

    // 预置封禁用户
    const banned = userRepo.create({
      guid: guidGen.generate(1),
      phone: '13800138001',
      userType: 1,
      accountSource: 'phone',
      status: 0,
    });
    await userRepo.save(banned);

    await expect(
      service.loginByPhone({ phone: '13800138001', code: '123456', app_id: 'jiuweihu' }),
    ).rejects.toMatchObject({ code: AuthErrorCode.ERR_USER_BANNED } as Partial<AuthException>);

    expect(loginLog.records.length).toBe(1);
    expect(loginLog.records[0]).toMatchObject({
      guid: banned.guid,
      phone: '13800138001',
      success: false,
    });
  });

  it('recreates guid when user is deleted', async () => {
    const userRepo = new InMemoryUserRepo();
    const sessions = new InMemorySessionStore();
    const guidGen = new FakeGuidGenerator();
    const loginLog = new FakeLoginLogService();
    const service = new AuthService(
      // @ts-expect-error: using in-memory repo instead of TypeORM repo
      userRepo,
      guidGen,
      new FakeVerificationCodeService(),
      sessions,
      loginLog,
    );

    const oldGuid = guidGen.generate(1);
    const deleted = userRepo.create({
      guid: oldGuid,
      phone: '13800138002',
      userType: 1,
      accountSource: 'phone',
      status: -1,
    });
    await userRepo.save(deleted);

    const result = await service.loginByPhone({ phone: '13800138002', code: '123456', app_id: 'jiuweihu' });
    expect(result.guid).not.toEqual(oldGuid);
    const session = await sessions.get(result.guid);
    expect(session).not.toBeNull();
    expect(loginLog.records.length).toBe(1);
    expect(loginLog.records[0]).toMatchObject({
      guid: result.guid,
      phone: '13800138002',
      success: true,
    });
  });
});
