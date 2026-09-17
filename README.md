# Health Hub Pro API

The backend is a modular NestJS REST API for Health Hub Pro. It exposes authentication, doctor discovery, availability, appointments, patient records, invoices, notifications, reviews, administration, and audit workflows.

## Stack

- NestJS 11 and TypeScript
- Prisma ORM with PostgreSQL
- Redis for caching and rate limiting
- JWT access and refresh tokens
- Swagger/OpenAPI at `/api-docs`
- Jest, Supertest, ESLint, and Prettier

## Local development

Requirements: Node.js 20+, npm 10+, PostgreSQL 15+, and Redis 6+.

```bash
npm ci
copy .env.example .env       # Windows PowerShell
# cp .env.example .env       # macOS/Linux
npm run prisma:generate
npm run prisma:migrate:dev
npm run prisma:seed          # optional
npm run start:dev
```

The default API URL is `http://localhost:5000/api/v1`. Swagger is available at `http://localhost:5000/api-docs`.

## Configuration

See [.env.example](.env.example) for the complete list. The required development settings are:

- `DATABASE_URL`: PostgreSQL connection string
- `JWT_SECRET` and `JWT_REFRESH_SECRET`: different, high-entropy signing secrets
- `PORT`: API port, default `5000`
- `REDIS_URL`: Redis connection string
- `FRONTEND_URL` and `CORS_ORIGINS`: allowed frontend origins

Stripe, Resend, Turnstile, Sentry, and two-factor encryption settings are optional integrations. Use test credentials only during development.

## Useful commands

| Command | Purpose |
| --- | --- |
| `npm run start:dev` | Run the API with file watching |
| `npm run build` | Compile the production bundle |
| `npm run start:prod` | Start the compiled API |
| `npm run prisma:generate` | Generate the Prisma client |
| `npm run prisma:migrate:dev` | Create/apply a local migration |
| `npm run prisma:migrate` | Apply committed migrations |
| `npm run prisma:studio` | Open Prisma Studio |
| `npm run test:unit` | Run unit tests |
| `npm run test:e2e` | Run end-to-end tests with a test database |
| `npm run test:all` | Run unit and end-to-end tests |
| `npm run lint` | Lint and autofix TypeScript files |

## Project organization

```text
src/
├── auth/          # Registration, login, refresh, verification, JWT strategy
├── common/        # Guards, decorators, filters, pipes, interceptors, utilities
├── config/        # Application configuration
├── modules/       # Business domains such as appointments and invoices
├── prisma/        # Prisma service and module
└── redis/         # Redis service and module
prisma/
├── schema.prisma  # Relational data model
├── migrations/    # Versioned database changes
└── seed.ts        # Optional development data
```

The API uses the global prefix `/api/v1`, JWT bearer authentication, role and permission guards, DTO validation, soft deletion for sensitive entities, and audit logging for important mutations. Appointment creation and invoice behavior are documented in [../docs/endpoints.md](../docs/endpoints.md).

## Database changes

Edit `prisma/schema.prisma`, create a named migration locally, and review the generated SQL before committing:

```bash
npm run prisma:migrate:dev -- --name describe_the_change
npm run prisma:generate
```

Production environments should apply committed migrations with `npm run prisma:migrate`. Do not edit production data or migration history manually.

## Security notes

This API handles authentication and health-related data. Do not log passwords, tokens, payment credentials, or real patient information. The local payment service and Stripe test configuration are for development/testing until a production compliance review is complete.
