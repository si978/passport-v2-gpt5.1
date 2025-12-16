import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import Redis from 'ioredis';
import { User } from './user.entity';
import { AuditLog } from './audit-log.entity';
import { LoginLog } from './login-log.entity';
import { AuthController } from './auth.controller';
import { AdminController } from './admin.controller';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';
import { VerificationCodeService } from './verification-code.service';
import { GuidGenerator } from './guid-generator';
import { SessionStore } from './session-store';
import { AdminService } from './admin.service';
import { MetricsService } from './metrics.service';
import { AuditLogService } from './audit-log.service';
import { LoginLogService } from './login-log.service';
import { AuthGuard } from './auth.guard';
import { AliyunSmsGateway, ConsoleSmsGateway, HttpSmsGateway } from './sms-gateway';
import { MetricsController } from './metrics.controller';
import { RateLimitService } from './rate-limit.service';
import { RolesGuard } from './roles.guard';

function hasAliyunSmsConfig(): boolean {
  const id = process.env.ALIYUN_ACCESS_KEY_ID || process.env.ALI_SMS_ACCESS_KEY_ID;
  const secret = process.env.ALIYUN_ACCESS_KEY_SECRET || process.env.ALI_SMS_ACCESS_KEY_SECRET;
  const sign = process.env.ALIYUN_SMS_SIGN_NAME || process.env.ALI_SMS_SIGN_NAME;
  const tpl = process.env.ALIYUN_SMS_TEMPLATE_CODE || process.env.ALI_SMS_TEMPLATE_CODE;
  return Boolean(id && secret && sign && tpl);
}

@Module({
  imports: [TypeOrmModule.forFeature([User, AuditLog, LoginLog])],
  controllers: [AuthController, AdminController, MetricsController],
  providers: [
    AuthService,
    TokenService,
    VerificationCodeService,
    AdminService,
    MetricsService,
    AuditLogService,
    LoginLogService,
    AuthGuard,
    RolesGuard,
    {
      provide: 'SMS_GATEWAY',
      useClass:
        hasAliyunSmsConfig()
          ? AliyunSmsGateway
          : process.env.SMS_GATEWAY_URL
            ? HttpSmsGateway
            : ConsoleSmsGateway,
    },
    RateLimitService,
    GuidGenerator,
    SessionStore,
    {
      provide: 'REDIS',
      useFactory: () => {
        const sentinels = process.env.REDIS_SENTINELS;
        if (sentinels) {
          const nodes = sentinels.split(',').map((item) => {
            const [host, port] = item.split(':');
            return { host, port: +(port || 26379) };
          });
          const name = process.env.REDIS_MASTER_NAME || 'mymaster';
          return new Redis({ sentinels: nodes as any, name });
        }

        return new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
      },
    },
  ],
})
export class AuthModule {}
