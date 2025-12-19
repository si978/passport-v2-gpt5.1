import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { AdminAppGuard } from './admin-app.guard';

describe('AdminAppGuard', () => {
  const createContext = (headers: Record<string, string> = {}, user: any = {}, body: any = {}): ExecutionContext => {
    const req = { headers, user, body };
    return {
      switchToHttp: () => ({ getRequest: () => req }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
  };

  beforeEach(() => {
    delete process.env.ADMIN_APP_ID;
  });

  it('allows when req.user.app_id matches default admin app id', () => {
    const guard = new AdminAppGuard();
    const ctx = createContext({}, { app_id: 'admin' });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows when x-app-id header matches default admin app id (even if req.user missing)', () => {
    const guard = new AdminAppGuard();
    const ctx = createContext({ 'x-app-id': 'admin' }, undefined);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('denies when app id does not match', () => {
    const guard = new AdminAppGuard();
    const ctx = createContext({ 'x-app-id': 'jiuweihu' }, { app_id: 'jiuweihu' });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('allows when ADMIN_APP_ID is customized', () => {
    process.env.ADMIN_APP_ID = 'backoffice';
    const guard = new AdminAppGuard();
    const ctx = createContext({}, { app_id: 'backoffice' });
    expect(guard.canActivate(ctx)).toBe(true);
  });
});

