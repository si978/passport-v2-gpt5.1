import { AuthExceptionFilter } from './auth-exception.filter';
import { AuthErrorCode, AuthException } from './auth-error';

describe('AuthExceptionFilter', () => {
  function createMockResponse() {
    return {
      statusCode: 0,
      body: null as any,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(payload: any) {
        this.body = payload;
        return this;
      },
    };
  }

  function createMockHost(res: any) {
    return {
      switchToHttp: () => ({
        getResponse: () => res,
      }),
    } as any;
  }

  it('maps AuthException to appropriate HTTP status and body', () => {
    const filter = new AuthExceptionFilter();
    const res = createMockResponse();
    const host = createMockHost(res);

    const exc = new AuthException(AuthErrorCode.ERR_ACCESS_EXPIRED, 'expired');
    filter.catch(exc, host);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ code: AuthErrorCode.ERR_ACCESS_EXPIRED, message: 'expired' });
  });

  it('treats ERR_USER_BANNED as 403', () => {
    const filter = new AuthExceptionFilter();
    const res = createMockResponse();
    const host = createMockHost(res);

    const exc = new AuthException(AuthErrorCode.ERR_USER_BANNED, 'banned');
    filter.catch(exc, host);

    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe(AuthErrorCode.ERR_USER_BANNED);
  });

  it('maps ERR_CODE_TOO_FREQUENT to 429', () => {
    const filter = new AuthExceptionFilter();
    const res = createMockResponse();
    const host = createMockHost(res);

    const exc = new AuthException(AuthErrorCode.ERR_CODE_TOO_FREQUENT, 'too frequent');
    filter.catch(exc, host);

    expect(res.statusCode).toBe(429);
    expect(res.body.code).toBe(AuthErrorCode.ERR_CODE_TOO_FREQUENT);
  });
});
