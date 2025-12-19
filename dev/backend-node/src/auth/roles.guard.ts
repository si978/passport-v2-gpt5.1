import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AdminRole, ROLES_KEY } from './roles.decorator';

type AdminAuthMode = 'strict' | 'legacy';

const logger = new Logger('RolesGuard');
let legacyModeWarned = false;

function resolveAdminAuthMode(): AdminAuthMode {
  const raw = (process.env.ADMIN_AUTH_MODE ?? '').trim().toLowerCase();
  if (raw === 'legacy') return 'legacy';
  return 'strict';
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<AdminRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // 未声明 @Roles 的接口保持向后兼容，直接放行。
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const req = context.switchToHttp().getRequest();
    const user = req.user ?? {};

    const roles: string[] = Array.isArray(user.roles) ? user.roles.map((r: any) => String(r)) : [];

    const mode = resolveAdminAuthMode();
    if (mode === 'legacy') {
      if (!legacyModeWarned) {
        legacyModeWarned = true;
        logger.warn('ADMIN_AUTH_MODE=legacy enabled: @Roles checks reduced to "any role" for emergency rollback');
      }
      // 回滚/应急模式：只要是“后台会话”（拥有任意角色）就放行，不再信任可伪造的请求头。
      if (roles.length > 0) return true;
      throw new ForbiddenException();
    }

    // 严格模式（默认）：基于服务端会话中的 roles 精确授权。
    if (requiredRoles.some((r) => roles.includes(r))) {
      return true;
    }
    throw new ForbiddenException();
  }
}
