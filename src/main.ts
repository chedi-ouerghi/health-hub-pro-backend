import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import express from 'express';
import { join } from 'path';
import * as Sentry from '@sentry/node';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true, rawBody: true });

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

  // Serve uploaded files (images / documents) statically
  const uploadsDir = join(process.cwd(), process.env.UPLOAD_DIR ?? 'uploads');
  app.use('/uploads', express.static(uploadsDir));

  // Serve brand assets (logo, etc.) statically — used by transactional emails
  const assetsDir = join(process.cwd(), 'assets');
  app.use('/assets', express.static(assetsDir));

  app.setGlobalPrefix('api/v1');

  const localOrigins = [
    'http://localhost:3000',
    'http://localhost:8080',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:8080',
    'https://health-hub-pro.pages.dev',
  ];

  const productionOrigins = [
    'https://health-hub-pro-frontend.vercel.app',
    // Any Vercel preview deployment: https://health-hub-pro-frontend-<hash>-chediouerghis-projects.vercel.app
    (origin: string) => /^https:\/\/health-hub-pro-frontend-[a-z0-9-]+-chediouerghis-projects\.vercel\.app$/.test(origin),
  ];

  const envOrigins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  const normalizeOrigin = (o: string) => o.replace(/\/+$/, '').toLowerCase();
  const normalizedLocalOrigins = localOrigins.map(normalizeOrigin);

  app.enableCors({
    origin(origin, callback) {
      if (!origin) {
        // Non-browser requests (server-to-server, health checks, webhooks).
        callback(null, false);
        return;
      }
      const normalizedRequestOrigin = normalizeOrigin(origin);
      const allowed =
        normalizedLocalOrigins.includes(normalizedRequestOrigin) ||
        productionOrigins.some((allowedOrigin) =>
          typeof allowedOrigin === 'function' ? allowedOrigin(origin) : normalizeOrigin(allowedOrigin) === normalizedRequestOrigin,
        ) ||
        envOrigins.some((allowedOrigin) => normalizeOrigin(allowedOrigin) === normalizedRequestOrigin);
      callback(null, allowed ? origin : false);
    },
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