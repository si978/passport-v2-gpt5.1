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

  it('allows access when no @Roles metadata is defined', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(undefined),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    const ctx = createContext();
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows access in compatibility mode when role is missing', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([AdminRole.OPERATOR]),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    const ctx = createContext();
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows access when role matches required roles', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockImplementation((key: string) => {
        if (key === ROLES_KEY) {
          return [AdminRole.OPERATOR];
        }
        return undefined;
      }),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    const ctx = createContext({ 'x-admin-role': AdminRole.OPERATOR });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('denies access when role does not match required roles', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockImplementation((key: string) => {
        if (key === ROLES_KEY) {
          return [AdminRole.OPERATOR];
        }
        return undefined;
      }),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    const ctx = createContext({ 'x-admin-role': AdminRole.SUPPORT });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});
