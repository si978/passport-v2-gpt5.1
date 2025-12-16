import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from './auth.guard';
import { TokenService } from './token.service';
import { AuthException, AuthErrorCode } from './auth-error';

describe('AuthGuard', () => {
  const mockTokenService = {
    verifyAccessToken: jest.fn(),
  } as unknown as TokenService;

  const guard = new AuthGuard(mockTokenService);

  const createContext = (headers: Record<string, string> = {}) => {
    const req = { headers, body: {} };
    return {
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows request when token is valid', async () => {
    (mockTokenService.verifyAccessToken as jest.Mock).mockResolvedValue({ guid: 'G1', app_id: 'jiuweihu' });
    const ctx = createContext({ authorization: 'Bearer A.G1.token', 'x-app-id': 'jiuweihu' });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(mockTokenService.verifyAccessToken).toHaveBeenCalledWith({
      access_token: 'A.G1.token',
      app_id: 'jiuweihu',
    });
  });

  it('throws UnauthorizedException when header is missing', async () => {
    const ctx = createContext({});
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rethrows AuthException from TokenService', async () => {
    (mockTokenService.verifyAccessToken as jest.Mock).mockRejectedValue(
      new AuthException(AuthErrorCode.ERR_ACCESS_INVALID, 'invalid'),
    );
    const ctx = createContext({ authorization: 'Bearer A.bad', 'x-app-id': 'jiuweihu' });

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(AuthException);
  });
});
