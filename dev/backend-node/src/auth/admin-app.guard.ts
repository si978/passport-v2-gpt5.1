import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

function resolveAdminAppId(): string {
  const raw = (process.env.ADMIN_APP_ID ?? '').trim();
  return raw || 'admin';
}

function asString(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return null;
}

@Injectable()
export class AdminAppGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();

    const adminAppId = resolveAdminAppId();

    const appIdFromUser = asString(req?.user?.app_id);
    const appIdFromHeader = asString(req?.headers?.['x-app-id']);
    const appIdFromBody = asString(req?.body?.app_id);
    const appId = appIdFromUser ?? appIdFromHeader ?? appIdFromBody;

    if (appId === adminAppId) {
      return true;
    }
    throw new ForbiddenException();
  }
}

