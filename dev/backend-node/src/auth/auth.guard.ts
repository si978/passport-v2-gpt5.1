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
    const authHeader = req.headers?.authorization as string | undefined;
    if (!authHeader) return null;
    const [scheme, token] = authHeader.split(' ');
    if (!token || scheme.toLowerCase() !== 'bearer') return null;
    return token;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const accessToken = this.extractToken(req);
    const appId = (req.headers?.['x-app-id'] as string | undefined) ?? req.body?.app_id;
    if (!accessToken || !appId) {
      throw new UnauthorizedException();
    }

    try {
      const payload = await this.tokenService.verifyAccessToken({
        access_token: accessToken,
        app_id: appId,
      });
      req.user = { guid: payload.guid, app_id: payload.app_id };
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
