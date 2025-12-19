import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AuthExceptionFilter } from './auth/auth-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  const trustProxyRaw = (process.env.TRUST_PROXY ?? '').trim();
  if (trustProxyRaw) {
    const lower = trustProxyRaw.toLowerCase();
    let trustProxy: any = trustProxyRaw;
    if (lower === 'true') trustProxy = true;
    if (lower === 'false') trustProxy = false;
    if (/^\d+$/.test(trustProxyRaw)) trustProxy = parseInt(trustProxyRaw, 10);
    app.set('trust proxy', trustProxy);
  }

  app.enableShutdownHooks();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new AuthExceptionFilter());

  const enableSwagger =
    process.env.ENABLE_SWAGGER === '1' ||
    (process.env.NODE_ENV !== 'production' && process.env.ENABLE_SWAGGER !== '0');
  if (enableSwagger) {
    const config = new DocumentBuilder()
      .setTitle('Passport 统一认证中心 API')
      .setDescription('统一认证中心后端接口文档')
      .setVersion('1.0.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'access-token',
      )
      .addApiKey(
        { type: 'apiKey', in: 'header', name: 'x-app-id' },
        'app-id',
      )
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  await app.listen(process.env.PORT || 3000);
}

bootstrap();
