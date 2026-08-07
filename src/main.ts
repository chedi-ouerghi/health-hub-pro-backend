import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import * as Sentry from '@sentry/node';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  if (process.env.SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV ?? 'development',
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0,
      beforeSend(event) {
        if (event.request?.headers) {
          delete event.request.headers['authorization'];
          delete event.request.headers['cookie'];
          delete event.request.headers['x-api-key'];
        }
        if (event.request?.data) {
          try {
            const body = typeof event.request.data === 'string' ? JSON.parse(event.request.data) : event.request.data;
            if (body.password) body.password = '[REDACTED]';
            if (body.newPassword) body.newPassword = '[REDACTED]';
            if (body.currentPassword) body.currentPassword = '[REDACTED]';
            if (body.token) body.token = '[REDACTED]';
            if (body.refreshToken) body.refreshToken = '[REDACTED]';
            event.request.data = body;
          } catch { /* leave as-is if unparseable */ }
        }
        return event;
      },
    });
  }

  app.use(helmet());
  app.use(cookieParser());

  app.setGlobalPrefix('api/v1');

  app.enableCors({
    origin: [process.env.FRONTEND_URL ?? 'http://localhost:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor(), new LoggingInterceptor());

  app.enableShutdownHooks();

  const config = new DocumentBuilder()
    .setTitle('Health Hub Pro API — Prise de rendez-vous médical')
    .setDescription('Plateforme médicale de prise de rendez-vous en présentiel (NestJS + Prisma + Redis)')
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT', in: 'header', name: 'Authorization' })
    .build();

  const document = SwaggerModule.createDocument(app, config, { ignoreGlobalPrefix: false });
  SwaggerModule.setup('api-docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  if (process.env.SENTRY_DSN) {
    Sentry.setupExpressErrorHandler(app);
  }

  const port = process.env.PORT ?? 5000;
  await app.listen(port);
  console.log(`Health Hub Pro API running on port ${port}`);
  console.log(`Swagger docs at http://localhost:${port}/api-docs`);
}

bootstrap();