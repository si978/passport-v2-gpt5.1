import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { User } from './auth/user.entity';
import { AuditLog } from './auth/audit-log.entity';
import { LoginLog } from './auth/login-log.entity';
import { HealthController } from './health.controller';

const isProd = process.env.NODE_ENV === 'production';

const dbPassword = process.env.DB_PASSWORD || (isProd ? (() => {
  throw new Error('DB_PASSWORD environment variable is required in production');
})() : 'passport');

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: +(process.env.DB_PORT || 5432),
      username: process.env.DB_USER || 'passport',
      password: dbPassword,
      database: process.env.DB_NAME || 'passport',
      entities: [User, AuditLog, LoginLog],
      synchronize: false,
    }),
    AuthModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
