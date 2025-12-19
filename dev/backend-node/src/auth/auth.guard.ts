import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { TokenService } from './token.service';
import { AuthException } from './auth-error';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly tokenService: TokenService) {}

  private extractToken(req: any): string | null {
    const raw = req.headers?.authorization as string | string[] | undefined;
    const authHeader = Array.isArray(raw) ? raw[0] : raw;
    if (!authHeader) return null;

    const m = /^Bearer\s+(.+)$/i.exec(String(authHeader).trim());
    if (!m) return null;
    const token = m[1].trim();
    if (!token) return null;
    return token;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const accessToken = this.extractToken(req);
    const rawAppId = req.headers?.['x-app-id'] as string | string[] | undefined;
    const appIdHeader = Array.isArray(rawAppId) ? rawAppId[0] : rawAppId;
    const appId = (appIdHeader ? String(appIdHeader).trim() : '') || req.body?.app_id;
    if (!accessToken || !appId) {
      throw new UnauthorizedException();
    }

    try {
      const payload = await this.tokenService.verifyAccessTokenWithClaims({
        access_token: accessToken,
        app_id: appId,
      });
      req.user = {
        guid: payload.guid,
        app_id: payload.app_id,
        roles: payload.roles,
        user_type: payload.user_type,
        account_source: payload.account_source,
      };
      return true;
    } catch (e) {
      if (e instanceof AuthException) {
        // 交由 AuthExceptionFilter 统一处理 HTTP 状态码
        throw e;
      }
      throw new UnauthorizedException();
    }
  }
}
