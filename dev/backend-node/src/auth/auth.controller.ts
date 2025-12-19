import { Body, Controller, Headers, Param, Post, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiOkResponse, ApiBody } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';
import { LoginByPhoneDto } from './dto/login-by-phone.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { VerifyTokenDto } from './dto/verify-token.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { VerificationCodeService } from './verification-code.service';
import { SendCodeDto } from './dto/send-code.dto';
import { LogoutDto } from './dto/logout.dto';
import { MetricsService } from './metrics.service';
import { AuthErrorCode, AuthException } from './auth-error';
import { ErrorResponse } from '../contracts/contracts';
import { AuditLogService } from './audit-log.service';
import { RateLimitService } from './rate-limit.service';

@ApiTags('passport')
@Controller('passport')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly tokenService: TokenService,
    private readonly vcService: VerificationCodeService,
    private readonly metrics: MetricsService,
    private readonly audit: AuditLogService,
    private readonly rateLimit: RateLimitService,
  ) {}

  private extractFromAuthHeader(authHeader?: string): string | undefined {
    if (!authHeader) return undefined;
    const [scheme, token] = authHeader.split(' ');
    if (!token || scheme.toLowerCase() !== 'bearer') return undefined;
    return token;
  }

  @Post('login-by-phone')
  @ApiOperation({ summary: '手机号 + 验证码登录' })
  @ApiBody({ type: LoginByPhoneDto })
  @ApiOkResponse({ type: LoginResponseDto })
  async loginByPhone(@Body() dto: LoginByPhoneDto, @Req() req: any): Promise<LoginResponseDto> {
    try {
      await this.rateLimit.ensureLoginAllowed(req?.ip, dto.phone);
      const res = await this.authService.loginByPhone(dto);
      this.metrics.incLoginSuccess();
      this.audit.recordLogin(res.guid, dto.phone);
      return res;
    } catch (e) {
      if (e instanceof AuthException) {
        if (e.code === AuthErrorCode.ERR_CODE_TOO_FREQUENT) {
          this.metrics.incRateLimitExceeded();
        }
        this.metrics.incLoginFailure();
        // 交由全局 AuthExceptionFilter 统一返回契约 ErrorResponse 与状态码
        throw new AuthException(e.code, e.message);
      }
      throw e;
    }
  }

  @Post('send-code')
  @ApiOperation({ summary: '发送登录短信验证码' })
  @ApiBody({ type: SendCodeDto })
  async sendCode(@Body() dto: SendCodeDto, @Req() req: any): Promise<{ success: true }> {
    try {
      await this.vcService.sendCode(dto.phone, req?.ip);
      return { success: true };
    } catch (e) {
      if (e instanceof AuthException) {
        if (e.code === AuthErrorCode.ERR_CODE_TOO_FREQUENT) {
          this.metrics.incRateLimitExceeded();
        }
        this.metrics.incSendCodeFailure();
        throw new AuthException(e.code, e.message);
      }
      throw e;
    }
  }

  @Post(':guid/refresh-token')
  @ApiOperation({ summary: '根据 GUID 刷新 Access Token' })
  @ApiBody({ type: RefreshTokenDto })
  @ApiOkResponse({ type: LoginResponseDto })
  async refreshTokenForGuid(
    @Param('guid') guid: string,
    @Body() dto: RefreshTokenDto,
    @Req() req: any,
  ): Promise<LoginResponseDto> {
    try {
      await this.rateLimit.ensureRefreshAllowed(req?.ip, guid);
      return await this.tokenService.refreshAccessToken(guid, dto);
    } catch (e) {
      if (e instanceof AuthException) {
        if (e.code === AuthErrorCode.ERR_CODE_TOO_FREQUENT) {
          this.metrics.incRateLimitExceeded();
        }
        this.metrics.incRefreshFailure();
        throw new AuthException(e.code, e.message);
      }
      throw e;
    }
  }

  @Post('refresh-token')
  @ApiOperation({ summary: '根据请求体中的 guid 刷新 Access Token' })
  @ApiBody({ schema: { $ref: '#/components/schemas/RefreshTokenDto' } })
  @ApiOkResponse({ type: LoginResponseDto })
  async refreshTokenCurrent(
    @Body() dto: RefreshTokenDto & { guid: string },
    @Req() req: any,
  ): Promise<LoginResponseDto> {
    try {
      await this.rateLimit.ensureRefreshAllowed(req?.ip, dto.guid);
      return await this.tokenService.refreshAccessToken(dto.guid, dto);
    } catch (e) {
      if (e instanceof AuthException) {
        if (e.code === AuthErrorCode.ERR_CODE_TOO_FREQUENT) {
          this.metrics.incRateLimitExceeded();
        }
        this.metrics.incRefreshFailure();
        throw new AuthException(e.code, e.message);
      }
      throw e;
    }
  }

  @Post('verify-token')
  @ApiOperation({ summary: '校验 Access Token 有效性' })
  async verifyToken(@Body() dto: VerifyTokenDto): Promise<{
    guid: string;
    app_id: string;
    expires_at: string;
  }> {
    return this.tokenService.verifyAccessToken(dto);
  }

  @Post('logout')
  @ApiOperation({ summary: '退出登录（幂等）' })
  async logout(
    @Body() dto: LogoutDto,
    @Headers('authorization') authHeader?: string,
  ): Promise<{ success: true }> {
    const accessToken = dto.access_token ?? this.extractFromAuthHeader(authHeader);
    if (accessToken) {
      await this.tokenService.logoutByAccessToken(accessToken);
      this.metrics.incLogoutSuccess();
      this.audit.recordLogout({ accessToken });
    }
    // 无 token 时视为“仅本地清理态”的退出，幂等成功
    return { success: true };
  }
}
