import { Test } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';
import { VerificationCodeService } from './verification-code.service';
import { MetricsService } from './metrics.service';
import { AuthException, AuthErrorCode } from './auth-error';
import { AuditLogService } from './audit-log.service';
import { RateLimitService } from './rate-limit.service';

describe('AuthController', () => {
  let controller: AuthController;
  const mockAuthService = {
    loginByPhone: jest.fn(),
  } as unknown as AuthService;

  const mockTokenService = {
    refreshAccessToken: jest.fn(),
    verifyAccessToken: jest.fn(),
    logoutByAccessToken: jest.fn(),
  } as unknown as TokenService;

  const mockVcService = {
    sendCode: jest.fn(),
  } as unknown as VerificationCodeService;

  const mockMetrics = {
    incLoginSuccess: jest.fn(),
    incLoginFailure: jest.fn(),
    incSendCodeFailure: jest.fn(),
    incRefreshFailure: jest.fn(),
    incLogoutSuccess: jest.fn(),
    incRateLimitExceeded: jest.fn(),
  } as unknown as MetricsService;

  const mockAudit = {
    recordLogin: jest.fn(),
    recordLogout: jest.fn(),
  } as unknown as AuditLogService;

  const mockRateLimit = {
    ensureLoginAllowed: jest.fn(),
    ensureRefreshAllowed: jest.fn(),
  } as unknown as RateLimitService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: TokenService, useValue: mockTokenService },
        { provide: VerificationCodeService, useValue: mockVcService },
        { provide: MetricsService, useValue: mockMetrics },
        { provide: AuditLogService, useValue: mockAudit },
        { provide: RateLimitService, useValue: mockRateLimit },
      ],
    }).compile();

    controller = moduleRef.get(AuthController);
  });

  it('loginByPhone should delegate to AuthService', async () => {
    const dto = { phone: '13800138000', code: '123456', app_id: 'jiuweihu' } as any;
    (mockAuthService.loginByPhone as jest.Mock).mockResolvedValue({ guid: 'G1' });

    const res = await controller.loginByPhone(dto, { ip: '1.1.1.1' } as any);
    expect((mockRateLimit.ensureLoginAllowed as jest.Mock)).toHaveBeenCalledWith('1.1.1.1', '13800138000');
    expect(mockAuthService.loginByPhone).toHaveBeenCalledWith(dto);
    expect(res).toEqual({ guid: 'G1' });
    expect((mockMetrics.incLoginSuccess as jest.Mock)).toHaveBeenCalledTimes(1);
    expect((mockMetrics.incLoginFailure as jest.Mock)).not.toHaveBeenCalled();
    expect((mockAudit.recordLogin as jest.Mock)).toHaveBeenCalledWith('G1', '13800138000');
  });

  it('sendCode should call VerificationCodeService.sendCode', async () => {
    await controller.sendCode({ phone: '13800138000' }, { ip: '1.2.3.4' } as any);
    expect(mockVcService.sendCode).toHaveBeenCalledWith('13800138000', '1.2.3.4');
    expect((mockMetrics.incSendCodeFailure as jest.Mock)).not.toHaveBeenCalled();
  });

  it('loginByPhone increments loginFailure metric on AuthException', async () => {
    const dto = { phone: '13800138000', code: '000000', app_id: 'jiuweihu' } as any;
    (mockAuthService.loginByPhone as jest.Mock).mockRejectedValue(
      new AuthException(AuthErrorCode.ERR_CODE_INVALID, 'invalid'),
    );

    await expect(controller.loginByPhone(dto, { ip: '1.1.1.1' } as any)).rejects.toBeInstanceOf(AuthException);
    expect((mockMetrics.incLoginFailure as jest.Mock)).toHaveBeenCalledTimes(1);
    expect((mockMetrics.incRateLimitExceeded as jest.Mock)).not.toHaveBeenCalled();
  });

  it('sendCode increments sendCodeFailure metric on AuthException', async () => {
    (mockVcService.sendCode as jest.Mock).mockRejectedValue(
      new AuthException(AuthErrorCode.ERR_PHONE_INVALID, 'invalid'),
    );

    await expect(controller.sendCode({ phone: '12345' } as any, { ip: '1.2.3.4' } as any)).rejects.toBeInstanceOf(
      AuthException,
    );
    expect((mockMetrics.incSendCodeFailure as jest.Mock)).toHaveBeenCalledTimes(1);
    expect((mockMetrics.incRateLimitExceeded as jest.Mock)).not.toHaveBeenCalled();
  });

  it('loginByPhone increments rateLimitExceeded on ERR_CODE_TOO_FREQUENT', async () => {
    const dto = { phone: '13800138000', code: '000000', app_id: 'jiuweihu' } as any;
    (mockAuthService.loginByPhone as jest.Mock).mockRejectedValue(
      new AuthException(AuthErrorCode.ERR_CODE_TOO_FREQUENT, 'too frequent'),
    );

    await expect(controller.loginByPhone(dto, { ip: '1.1.1.1' } as any)).rejects.toBeInstanceOf(AuthException);
    expect((mockMetrics.incRateLimitExceeded as jest.Mock)).toHaveBeenCalledTimes(1);
    expect((mockMetrics.incLoginFailure as jest.Mock)).toHaveBeenCalledTimes(1);
  });

  it('sendCode increments rateLimitExceeded on ERR_CODE_TOO_FREQUENT', async () => {
    (mockVcService.sendCode as jest.Mock).mockRejectedValue(
      new AuthException(AuthErrorCode.ERR_CODE_TOO_FREQUENT, 'too frequent'),
    );

    await expect(controller.sendCode({ phone: '13800138000' } as any, { ip: '1.2.3.4' } as any)).rejects.toBeInstanceOf(
      AuthException,
    );
    expect((mockMetrics.incRateLimitExceeded as jest.Mock)).toHaveBeenCalledTimes(1);
    expect((mockMetrics.incSendCodeFailure as jest.Mock)).toHaveBeenCalledTimes(1);
  });

  it('refreshTokenForGuid delegates to TokenService with path guid', async () => {
    const dto = { refresh_token: 'R.token', app_id: 'jiuweihu' } as any;
    (mockTokenService.refreshAccessToken as jest.Mock).mockResolvedValue({ guid: 'G2' });

    const res = await controller.refreshTokenForGuid('G2', dto, { ip: '2.2.2.2' } as any);
    expect((mockRateLimit.ensureRefreshAllowed as jest.Mock)).toHaveBeenCalledWith('2.2.2.2', 'G2');
    expect(mockTokenService.refreshAccessToken).toHaveBeenCalledWith('G2', dto);
    expect(res).toEqual({ guid: 'G2' });
  });

  it('refreshTokenCurrent uses dto.guid when calling TokenService', async () => {
    const dto = { guid: 'G3', refresh_token: 'R.token', app_id: 'jiuweihu' } as any;
    (mockTokenService.refreshAccessToken as jest.Mock).mockResolvedValue({ guid: 'G3' });

    const res = await controller.refreshTokenCurrent(dto, { ip: '3.3.3.3' } as any);
    expect((mockRateLimit.ensureRefreshAllowed as jest.Mock)).toHaveBeenCalledWith('3.3.3.3', 'G3');
    expect(mockTokenService.refreshAccessToken).toHaveBeenCalledWith('G3', dto);
    expect(res).toEqual({ guid: 'G3' });
  });

  it('refreshTokenCurrent increments refreshFailure on AuthException', async () => {
    const dto = { guid: 'G3', refresh_token: 'R.bad', app_id: 'jiuweihu' } as any;
    (mockTokenService.refreshAccessToken as jest.Mock).mockRejectedValue(
      new AuthException(AuthErrorCode.ERR_REFRESH_EXPIRED, 'expired'),
    );

    await expect(controller.refreshTokenCurrent(dto, { ip: '3.3.3.3' } as any)).rejects.toBeInstanceOf(AuthException);
    expect((mockMetrics.incRefreshFailure as jest.Mock)).toHaveBeenCalledTimes(1);
  });

  it('verifyToken delegates to TokenService.verifyAccessToken', async () => {
    const dto = { access_token: 'A.token', app_id: 'jiuweihu' } as any;
    (mockTokenService.verifyAccessToken as jest.Mock).mockResolvedValue({ guid: 'G4' });

    const res = await controller.verifyToken(dto);
    expect(mockTokenService.verifyAccessToken).toHaveBeenCalledWith(dto);
    expect(res).toEqual({ guid: 'G4' });
  });

  it('logout should use body access_token when provided', async () => {
    await controller.logout({ access_token: 'A.token' } as any, undefined);
    expect(mockTokenService.logoutByAccessToken).toHaveBeenCalledWith('A.token');
    expect((mockAudit.recordLogout as jest.Mock)).toHaveBeenCalledWith({ accessToken: 'A.token' });
  });

  it('logout should extract token from Authorization header when body empty', async () => {
    await controller.logout({} as any, 'Bearer A.headerToken');
    expect(mockTokenService.logoutByAccessToken).toHaveBeenCalledWith('A.headerToken');
    expect((mockAudit.recordLogout as jest.Mock)).toHaveBeenCalledWith({ accessToken: 'A.headerToken' });
  });
});
