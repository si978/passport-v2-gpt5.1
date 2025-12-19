import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AdminRole, ROLES_KEY } from './roles.decorator';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  const createContext = (headers: Record<string, string> = {}, user: any = {}): ExecutionContext => {
    const req = { headers, user };
    return {
      switchToHttp: () => ({ getRequest: () => req }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
  };

  beforeEach(() => {
    delete process.env.ADMIN_AUTH_MODE;
  });

  it('allows access when no @Roles metadata is defined', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(undefined),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    const ctx = createContext();
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('denies access in strict mode when roles are missing', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([AdminRole.OPERATOR]),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    const ctx = createContext();
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('allows access in strict mode when roles match required roles', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockImplementation((key: string) => {
        if (key === ROLES_KEY) {
          return [AdminRole.OPERATOR];
        }
        return undefined;
      }),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    const ctx = createContext({}, { roles: [AdminRole.OPERATOR] });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('denies access in strict mode when roles do not match required roles', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockImplementation((key: string) => {
        if (key === ROLES_KEY) {
          return [AdminRole.OPERATOR];
        }
        return undefined;
      }),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    const ctx = createContext({}, { roles: [AdminRole.SUPPORT] });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('allows access in legacy mode when any admin role exists', () => {
    process.env.ADMIN_AUTH_MODE = 'legacy';
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([AdminRole.OPERATOR]),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    const ctx = createContext({}, { roles: [AdminRole.SUPPORT] });
    expect(guard.canActivate(ctx)).toBe(true);
  });
});
