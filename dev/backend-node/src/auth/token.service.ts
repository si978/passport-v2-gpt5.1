import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { AuthErrorCode, AuthException } from './auth-error';
import { SessionStore } from './session-store';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { VerifyTokenDto } from './dto/verify-token.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { Session, AppSession } from './session.types';
import { LoginLogService } from './login-log.service';
import { AuditLogService } from './audit-log.service';
import { resolveAdminRoles, resolveUserTypeLabel } from './user-role.util';

const ACCESS_TTL_HOURS = 4;

function addHours(d: Date, hours: number): Date {
  return new Date(d.getTime() + hours * 3600 * 1000);
}

export type VerifiedAccessTokenClaims = {
  guid: string;
  app_id: string;
  expires_at: string;
  roles: string[];
  user_type: string;
  account_source: string;
};

@Injectable()
export class TokenService {
  constructor(
    private readonly sessions: SessionStore,
    private readonly loginLog: LoginLogService,
    private readonly auditLog: AuditLogService,
  ) {}

  private readonly logger = new Logger(TokenService.name);

  private generateAccessToken(guid: string): string {
    return `A.${guid}.${randomBytes(16).toString('hex')}`;
  }

  private isRefreshValid(session: Session, now: Date): boolean {
    return now < new Date(session.refreshTokenExpiresAt);
  }

  async refreshAccessToken(guid: string, dto: RefreshTokenDto): Promise<LoginResponseDto> {
    const now = new Date();
    try {
      let createdNewApp = false;

      const updated = await this.sessions.update(guid, (session) => {
        if (!this.isRefreshValid(session, now)) {
          throw new AuthException(AuthErrorCode.ERR_REFRESH_EXPIRED, 'refresh expired');
        }
        if (session.refreshToken !== dto.refresh_token) {
          throw new AuthException(AuthErrorCode.ERR_REFRESH_MISMATCH, 'refresh mismatch');
        }

        const accessToken = this.generateAccessToken(session.guid);
        const atExp = addHours(now, ACCESS_TTL_HOURS);

        if (!session.apps) {
          session.apps = {} as any;
        }

        let appSession: AppSession | undefined = session.apps[dto.app_id];
        if (!appSession) {
          createdNewApp = true;
          appSession = {
            accessToken,
            accessTokenExpiresAt: atExp.toISOString(),
            lastActiveAt: now.toISOString(),
          };
        } else {
          createdNewApp = false;
          appSession.accessToken = accessToken;
          appSession.accessTokenExpiresAt = atExp.toISOString();
          appSession.lastActiveAt = now.toISOString();
        }
        session.apps[dto.app_id] = appSession;
        return session;
      });

      if (!updated) {
        throw new AuthException(AuthErrorCode.ERR_SESSION_NOT_FOUND, 'session not found');
      }

      if (createdNewApp) {
        this.auditLog.recordSsoLogin(updated.guid, dto.app_id);
      }

      const appSession = updated.apps[dto.app_id];
      this.logger.log(`refreshAccessToken success for guid=${updated.guid}, app_id=${dto.app_id}`);

      const userTypeLabel = resolveUserTypeLabel(updated.userType);
      const roles = updated.roles ?? resolveAdminRoles(updated.userType);
      return {
        guid: updated.guid,
        access_token: appSession.accessToken,
        refresh_token: updated.refreshToken,
        user_status: 1,
        account_source: updated.accountSource ?? 'phone',
        user_type: userTypeLabel,
        roles,
        access_token_expires_at: appSession.accessTokenExpiresAt,
        refresh_token_expires_at: updated.refreshTokenExpiresAt,
        expires_in: ACCESS_TTL_HOURS * 3600,
      };
    } catch (e) {
      if (e instanceof AuthException) {
        this.logger.warn(`refreshAccessToken failed for guid=${guid}, app_id=${dto.app_id}, code=${e.code}`);
        throw e;
      }
      this.logger.error(`refreshAccessToken redis error for guid=${guid}, app_id=${dto.app_id}`, (e as Error).stack);
      throw new AuthException(AuthErrorCode.ERR_INTERNAL, 'service temporarily unavailable');
    }
  }

  async logoutByAccessToken(accessToken: string): Promise<void> {
    try {
      const session = await this.sessions.findByAccessToken(accessToken);
      if (!session) {
        // 幂等：找不到会话也视为成功
        return;
      }
      this.loginLog.recordLogout(session.guid);
      await this.sessions.delete(session.guid);
      this.logger.log(`logoutByAccessToken success for guid=${session.guid}`);
    } catch (e) {
      if (e instanceof AuthException) {
        this.logger.warn(`logoutByAccessToken failed with auth error code=${e.code}`);
        throw e;
      }
      this.logger.error('logoutByAccessToken redis error', (e as Error).stack);
      throw new AuthException(AuthErrorCode.ERR_INTERNAL, 'service temporarily unavailable');
    }
  }

  async logoutByGuid(guid: string): Promise<void> {
    try {
      const session = await this.sessions.get(guid);
      if (!session) {
        // 找不到会话时视为幂等成功，便于后台强制下线多次调用。
        return;
      }
      this.loginLog.recordLogout(guid);
      await this.sessions.delete(guid);
      this.logger.log(`logoutByGuid success for guid=${guid}`);
    } catch (e) {
      if (e instanceof AuthException) {
        this.logger.warn(`logoutByGuid failed with auth error code=${e.code}`);
        throw e;
      }
      this.logger.error('logoutByGuid redis error', (e as Error).stack);
      throw new AuthException(AuthErrorCode.ERR_INTERNAL, 'service temporarily unavailable');
    }
  }

  async verifyAccessToken(dto: VerifyTokenDto): Promise<{ guid: string; app_id: string; expires_at: string }> {
    const v = await this.verifyAccessTokenWithClaims(dto);
    return { guid: v.guid, app_id: v.app_id, expires_at: v.expires_at };
  }

  async verifyAccessTokenWithClaims(dto: VerifyTokenDto): Promise<VerifiedAccessTokenClaims> {
    const now = new Date();
    try {
      const session = await this.sessions.findByAccessToken(dto.access_token);
      if (!session) {
        throw new AuthException(AuthErrorCode.ERR_ACCESS_INVALID, 'invalid access token');
      }

      const apps = session.apps ?? ({} as any);
      let matchedAppId: string | null = null;
      let appSession: AppSession | null = null;
      for (const [appId, s] of Object.entries(apps)) {
        if (s && (s as AppSession).accessToken === dto.access_token) {
          matchedAppId = appId;
          appSession = s as AppSession;
          break;
        }
      }
      if (!matchedAppId || !appSession) {
        throw new AuthException(AuthErrorCode.ERR_ACCESS_INVALID, 'invalid access token');
      }

      if (new Date(appSession.accessTokenExpiresAt) <= now) {
        throw new AuthException(AuthErrorCode.ERR_ACCESS_EXPIRED, 'access expired');
      }
      if (matchedAppId !== dto.app_id) {
        throw new AuthException(AuthErrorCode.ERR_APP_ID_MISMATCH, 'app id mismatch');
      }

      const roles = session.roles ?? resolveAdminRoles(session.userType);
      const userTypeLabel = resolveUserTypeLabel(session.userType);
      const accountSource = session.accountSource ?? 'phone';

      this.logger.log(`verifyAccessToken success for guid=${session.guid}, app_id=${matchedAppId}`);
      return {
        guid: session.guid,
        app_id: matchedAppId,
        expires_at: appSession.accessTokenExpiresAt,
        roles,
        user_type: userTypeLabel,
        account_source: accountSource,
      };
    } catch (e) {
      if (e instanceof AuthException) {
        this.logger.warn(`verifyAccessToken failed for app_id=${dto.app_id}, code=${e.code}`);
        throw e;
      }
      this.logger.error('verifyAccessToken redis error', (e as Error).stack);
      throw new AuthException(AuthErrorCode.ERR_INTERNAL, 'service temporarily unavailable');
    }
  }
}
