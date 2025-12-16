import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { User } from './user.entity';
import { AuthErrorCode, AuthException } from './auth-error';
import { GuidGenerator } from './guid-generator';
import { VerificationCodeService } from './verification-code.service';
import { SessionStore } from './session-store';
import { LoginByPhoneDto } from './dto/login-by-phone.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { ContractAuthErrorCode } from '../contracts/contracts';
import { Session, AppSession } from './session.types';
import { LoginLogService } from './login-log.service';
import { resolveAdminRoles, resolveUserTypeLabel } from './user-role.util';

const REFRESH_TTL_DAYS = 2;
const ACCESS_TTL_HOURS = 4;

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 24 * 3600 * 1000);
}

function addHours(d: Date, hours: number): Date {
  return new Date(d.getTime() + hours * 3600 * 1000);
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly guidGen: GuidGenerator,
    private readonly vcService: VerificationCodeService,
    private readonly sessions: SessionStore,
    private readonly loginLog: LoginLogService,
  ) {}

  private generateToken(prefix: string): string {
    return `${prefix}.${randomBytes(16).toString('hex')}`;
  }

  private generateAccessToken(guid: string): string {
    return `A.${guid}.${randomBytes(16).toString('hex')}`;
  }

  async loginByPhone(dto: LoginByPhoneDto): Promise<LoginResponseDto> {
    const now = new Date();
    this.vcService.validateCode(dto.phone, dto.code, now);

    let user = await this.users.findOne({ where: { phone: dto.phone } });

    if (!user) {
      const guid = this.guidGen.generate(1, now);
      user = this.users.create({ guid, phone: dto.phone, userType: 1, accountSource: 'phone', status: 1 });
      await this.users.save(user);
    } else if (user.status === 0) {
      this.loginLog.recordLogin(user.guid, user.phone, false, {
        channel: dto.app_id,
        errorCode: AuthErrorCode.ERR_USER_BANNED,
        when: now,
      });
      throw new AuthException(AuthErrorCode.ERR_USER_BANNED, 'user banned');
    } else if (user.status === -1) {
      const guid = this.guidGen.generate(user.userType, now);
      user.guid = guid;
      user.status = 1;
      await this.users.save(user);
    }

    const refreshToken = this.generateToken('R');
    const accessToken = this.generateAccessToken(user.guid);
    const rtExp = addDays(now, REFRESH_TTL_DAYS);
    const atExp = addHours(now, ACCESS_TTL_HOURS);

    const appSession: AppSession = {
      accessToken,
      accessTokenExpiresAt: atExp.toISOString(),
      lastActiveAt: now.toISOString(),
    };

    const session: Session = {
      guid: user.guid,
      refreshToken,
      refreshTokenExpiresAt: rtExp.toISOString(),
      userType: user.userType,
      accountSource: user.accountSource,
      roles: resolveAdminRoles(user.userType),
      apps: { [dto.app_id]: appSession },
    };
    await this.sessions.put(session);

    this.loginLog.recordLogin(user.guid, user.phone, true, {
      channel: dto.app_id,
      when: now,
    });

    return {
      guid: user.guid,
      access_token: accessToken,
      refresh_token: refreshToken,
      user_status: user.status as 1 | 0 | -1,
      account_source: user.accountSource,
      user_type: resolveUserTypeLabel(user.userType),
      roles: resolveAdminRoles(user.userType),
      access_token_expires_at: atExp.toISOString(),
      refresh_token_expires_at: rtExp.toISOString(),
      expires_in: ACCESS_TTL_HOURS * 3600,
    };
  }
}
