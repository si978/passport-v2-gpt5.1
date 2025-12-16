import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AdminRole, ROLES_KEY } from './roles.decorator';

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

    const headerRole = (req.headers?.['x-admin-role'] as string | undefined) ?? (req.headers?.['X-Admin-Role'] as string | undefined);
    const role: string | undefined = (user.role as string | undefined) ?? headerRole;

    // 兼容模式：若当前环境尚未引入后台角色体系，则不做限制，以免影响已有使用方式。
    if (!role) {
      return true;
    }

    if (requiredRoles.includes(role as AdminRole)) {
      return true;
    }

    throw new ForbiddenException();
  }
}
