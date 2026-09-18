import { ConfigModule as NestConfigModule } from '@nestjs/config';
import * as Joi from 'joi';

export const ConfigModule = NestConfigModule.forRoot({
  isGlobal: true,
  validationSchema: Joi.object({
    NODE_ENV: Joi.string().valid('development', 'production', 'test').required(),
    PORT: Joi.number().default(5000),
    DATABASE_URL: Joi.string().required(),
    JWT_SECRET: Joi.string().min(32).required(),
    JWT_EXPIRES_IN: Joi.string().default('15m'),
    JWT_REFRESH_SECRET: Joi.string().min(32).required(),
    JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),
    TWO_FACTOR_REQUIRED: Joi.boolean().default(false),
    CORS_ORIGINS: Joi.string().required(),
    FRONTEND_URL: Joi.string().uri().required(),
    REDIS_URL: Joi.string().uri().optional(),
    SENTRY_DSN: Joi.string().uri().optional(),
    TURNSTILE_SECRET_KEY: Joi.string().optional(),
    RATE_LIMIT_WHITELIST: Joi.string().optional(),
    RESEND_API_KEY: Joi.string().optional(),
    RESEND_FROM_EMAIL: Joi.string().email().optional(),
    BRAND_LOGO_URL: Joi.string().uri().optional(),
    STRIPE_SECRET_KEY: Joi.string().pattern(/^sk_test_/).required(),
    STRIPE_PUBLISHABLE_KEY: Joi.string().pattern(/^pk_test_/).required(),
    STRIPE_WEBHOOK_SECRET: Joi.string().pattern(/^whsec_/).required(),
  }),
});
