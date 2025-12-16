import { Test } from '@nestjs/testing';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { MetricsService } from './metrics.service';
import { AuditLogService } from './audit-log.service';
import { TokenService } from './token.service';

describe('AdminController', () => {
  let controller: AdminController;

  const mockAdminService = {
    listUsers: jest.fn(),
    banUser: jest.fn(),
    unbanUser: jest.fn(),
    listActivity: jest.fn(),
  } as unknown as AdminService;

  const mockMetrics = {
    snapshot: jest.fn(),
  } as unknown as MetricsService;

  const mockAudit = {
    recordBan: jest.fn(),
    recordUnban: jest.fn(),
    recordLogout: jest.fn(),
    query: jest.fn(),
  } as unknown as AuditLogService;

  const mockTokenService = {
    logoutByGuid: jest.fn(),
  } as unknown as TokenService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        { provide: AdminService, useValue: mockAdminService },
        { provide: MetricsService, useValue: mockMetrics },
        { provide: AuditLogService, useValue: mockAudit },
        { provide: TokenService, useValue: mockTokenService },
      ],
    }).compile();

    controller = moduleRef.get(AdminController);
  });

  it('listUsers maps status query and returns users wrapper', async () => {
    (mockAdminService.listUsers as jest.Mock).mockResolvedValue([
      { guid: 'G1', phone: '13800138010', status: 'ACTIVE', account_source: 'phone' },
    ]);

    const res = await controller.listUsers('ACTIVE');
    expect(mockAdminService.listUsers).toHaveBeenCalledWith('ACTIVE');
    expect(res.users).toHaveLength(1);
    expect(res.users[0].guid).toBe('G1');
  });

  it('banUser delegates to service', async () => {
    await controller.banUser('G2', { user: { guid: 'OP1' } } as any);
    expect(mockAdminService.banUser).toHaveBeenCalledWith('G2');
    expect(mockAudit.recordBan).toHaveBeenCalledWith('G2', { operator: 'OP1' });
  });

  it('unbanUser delegates to service', async () => {
    await controller.unbanUser('G3', { user: { guid: 'OP2' } } as any);
    expect(mockAdminService.unbanUser).toHaveBeenCalledWith('G3');
    expect(mockAudit.recordUnban).toHaveBeenCalledWith('G3', { operator: 'OP2' });
  });

  it('logoutUser delegates to TokenService and records audit log', async () => {
    await controller.logoutUser('G4', { user: { guid: 'OP3' } } as any);
    expect(mockTokenService.logoutByGuid).toHaveBeenCalledWith('G4');
    expect(mockAudit.recordLogout).toHaveBeenCalledWith({ guid: 'G4', operator: 'OP3' });
  });

  it('listActivity wraps activities', async () => {
    (mockAdminService.listActivity as jest.Mock).mockResolvedValue([
      {
        guid: 'G1',
        phone: '13800138010',
        login_at: '2025-01-01T10:00:00Z',
        logout_at: null,
        channel: 'pc',
        ip: '1.1.1.1',
      },
    ]);

    const res = await controller.listActivity();
    expect(mockAdminService.listActivity).toHaveBeenCalled();
    expect(res.activities).toHaveLength(1);
  });

  it('getMetrics returns snapshot from MetricsService', async () => {
    (mockMetrics.snapshot as jest.Mock).mockReturnValue({
      loginSuccess: 1,
      loginFailure: 2,
      sendCodeFailure: 3,
      refreshFailure: 4,
    });

    const res = await controller.getMetrics();
    expect(mockMetrics.snapshot).toHaveBeenCalledTimes(1);
    expect(res.metrics.loginSuccess).toBe(1);
    expect(res.metrics.refreshFailure).toBe(4);
  });

  it('listAuditLogs returns entries from AuditLogService.query', async () => {
    (mockAudit.query as jest.Mock).mockReturnValue([
      { type: 'login', guid: 'G1', phone: '13800138000', at: '2025-01-01T10:00:00Z' },
    ]);

    const res = await controller.listAuditLogs(
      'login',
      'G1',
      '13800138000',
      '2025-01-01T00:00:00Z',
      '2025-01-02T00:00:00Z',
    );

    expect(mockAudit.query).toHaveBeenCalledTimes(1);
    expect(res.entries).toHaveLength(1);
    expect(res.entries[0].type).toBe('login');
  });
});
