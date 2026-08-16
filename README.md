
# Backend — Health Hub Pro (NestJS + Prisma + Redis)

Ce document est une version professionnelle et approfondie du README backend. Il couvre l'installation, le développement local, les tests, l'architecture, les points critiques (paiement simulé, email, sécurité) et les procédures de déploiement.

Table des matières
- Aperçu
- Prérequis
- Configuration (variables d'environnement)
- Installation rapide (Quickstart)
- Prisma : génération, migrations et seed
- Exécution (dev / prod)
- Tests (unit / e2e)
- Architecture & modules clés
- API : routes importantes et exemples
- Flux de rendez-vous & facturation (logique métier)
- Simulateur de paiement (dev only)
- Sécurité, permissions et conformité
- CI / CD et déploiement
- Dépannage & FAQ
- Contribuer
- Contacts & ressources

## Aperçu

Backend écrit en TypeScript avec NestJS. Accès aux données via Prisma (Postgres). Redis est utilisé pour le caching et les tâches temporaires. La logique métier (rendez‑vous, facturation, notifications, audit) est organisée par modules sous `src/modules`.

Conventions principales
- API prefix : `/api/v1`
- Auth : JWT (access + refresh), rôles (`PATIENT`, `DOCTOR`, `ADMIN`)

## Prérequis

- Node.js 18+ (recommandé 20)
- PostgreSQL (15+ recommandé)
- Redis (optionnel mais recommandé pour cache et notifications)
- Yarn / npm / bun

## Configuration

Copiez le fichier d'exemple et adaptez :

```bash
cp .env.example .env
# Éditez .env → DATABASE_URL, JWT_SECRET, REDIS_URL, SENTRY_DSN, etc.
```

Variables critiques
- `DATABASE_URL` — connexion Postgres
- `DATABASE_URL_TEST` — base pour les tests
- `PORT` — port d'écoute
- `JWT_SECRET` — secret des JWT
- `REDIS_URL` — optional, pour cache/queues

## Installation rapide (Quickstart)

```bash
cd backend
npm ci
npx prisma generate
npx prisma migrate dev --name init
npm run prisma:seed # optionnel
npm run start:dev
```

Lancer en production (build + start):

```bash
npm run build
NODE_ENV=production npm run start:prod
```

## Prisma — génération, migrations et seed

- Générer le client : `npx prisma generate`
- Créer/Appliquer migrations en dev : `npx prisma migrate dev --name <desc>`
- Déployer migrations en prod : `npx prisma migrate deploy`
- Seeder : `npm run prisma:seed` (exécute `prisma/seed.ts`)

Notes
- Ne modifiez pas le schéma Prisma en production sans revue : les changements impliquent des migrations irréversibles.

## Tests

Unitaires :

```bash
npm run test:unit
```

E2E (nécessite DB de test) :

```bash
DATABASE_URL_TEST="postgresql://..." npm run test:e2e
```

Conseils
- Les tests utilisent un mock Prisma ou une base de test isolée (vérifiez `test/prisma-mock.ts`).
- Isoler les tests d'intégration via Docker Compose pour Postgres/Redis facilite la CI.

## Architecture & modules clés

- `src/modules/auth` — authentication, guards, strategies
- `src/modules/users` — profils et permissions
- `src/modules/doctors` — gestion docteurs, disponibilités
- `src/modules/appointments` — logique de réservation, validations métier
- `src/modules/invoices` — création et lecture de factures
- `src/modules/notifications` — envoi / stockage des notifications
- `src/prisma` — wrapper Prisma (`PrismaService`)
- `src/common` — utilitaires, pipes, guards, interceptors

## API — routes importantes (exemples)

- POST /api/v1/auth/register — créer un compte
- POST /api/v1/auth/login — authentifier
- GET /api/v1/doctors — recherche médecins
- POST /api/v1/appointments — créer un rendez‑vous (PATIENT)
- GET /api/v1/appointments/me — lister rendez‑vous de l'utilisateur
- GET /api/v1/invoices/:id — récupérer une facture

Exemple payload minimal pour créer un rendez‑vous (booking):

```json
{
   "doctorId": "uuid-doctor",
   "slotStart": "2026-08-20T10:00:00.000Z",
   "slotEnd": "2026-08-20T10:30:00.000Z",
   "notes": "Consultation pour douleur lombaire",
   "payment": {
      "cardNumber": "4242424242424242",
      "expMonth": 12,
      "expYear": 2026,
      "cvc": "123",
      "cardHolderName": "Jean Dupont"
   }
}
```

Les champs de paiement sont requis selon la configuration du backend (simulation local). Voir `src/modules/appointments/dto` pour les DTOs exacts.

## Flux de rendez‑vous et facturation (logique métier)

Résumé du workflow `POST /appointments` :

1. Validation DTO et permissions (le demandeur doit être PATIENT)
2. Vérification disponibilité (créneau libre, pas de conflit)
3. Si paiement requis : exécution du simulateur de paiement
    - si paiement échoue → retourner 402 / erreur métier
4. Création atomique dans une transaction Prisma : Appointment + Invoice
5. Notifications (email/push) et logs d'audit

Remarque opérationnelle : la séquence actuelle est « payer → créer ». Pour éviter des risques (paiement capturé puis échec DB) envisagez un modèle à deux étapes (pré-autorisation puis capture) avec capacité de remboursement simulé.

## Simulateur de paiement (dev only)

- Fichier : `src/common/services/payment.service.ts`
- But : fournir un flux déterministe pour le développement et les tests
- Comportement principal :
   - Validation Luhn pour `cardNumber`
   - Vérification `expMonth` / `expYear` (non expiré)
   - Règle simple : si le dernier chiffre de la carte est impair → `decline` (utile pour tests)

Carte de test recommandée : `4242424242424242` (succès)

Important : Ne jamais committer de véritables numéros de carte. Le simulateur est uniquement pour dev/test.

## Sécurité, permissions et conformité

- Stockage des mots de passe : argon2/bcrypt (voir `src/auth`)
- JWT : tokens courts + refresh tokens stockés/rotated
- Protection des routes sensibles via Guards et Roles
- Soft delete (`deletedAt`) sur entités personnelles
- Audit logs pour opérations critiques (création/annulation RDV, paiements)

Conformité
- Pour la mise en production, externaliser les paiements (Stripe/Adyen) et suivre PCI-DSS si vous traitez des cartes.

## CI / CD & Déploiement

- CI : lancer `npm run test:unit` et `npm run lint` avant merge
- Build & release : `npm run build` et `npx prisma migrate deploy`
- Orchestration conseillé : Docker + Compose (Postgres, Redis)

Exemple rapide Docker Compose pour dev (suggestion) :

```yaml
version: '3.8'
services:
   postgres:
      image: postgres:15
      environment:
         POSTGRES_PASSWORD: postgres
   redis:
      image: redis:7

   backend:
      build: .
      environment:
         DATABASE_URL: postgresql://postgres:postgres@postgres:5432/postgres
         REDIS_URL: redis://redis:6379
      depends_on:
         - postgres
         - redis
```

## Dépannage & FAQ

- Erreur TypeScript `TS2345` liée à `Decimal` : convertir `Decimal` en `string`/`number` avant de le passer à des helpers (ex: `String(doctor.consultationPrice)`).
- Conflit de slot : Prisma peut lever une erreur P2002 si un slot est reservé en concurrence — gérez via transaction et attrapez `Prisma.PrismaClientKnownRequestError` pour retourner `409 Conflict`.
- Tests qui accèdent à la DB : utiliser une instance de test isolée ou mocker `PrismaService`.

## Contribuer

- Fork & PR : nommez la branche `feat/<objet>` ou `fix/<objet>`.
- Avant PR : `npm run lint`, `npm run test:unit`, exécuter les migrations locales.
- Code style : TypeScript strict, pas de any non justifié.

## Ressources & contacts

- Swagger : `http://localhost:<PORT>/api-docs` une fois le serveur démarré
- Logs : vérifier la sortie console et Sentry si configuré
- Pour questions ouvertes : créez une issue dans le repo

---

Fichier principal à consulter pour la logique de paiement : [src/common/services/payment.service.ts](src/common/services/payment.service.ts#L1)
Pour la logique d'appointments : [src/modules/appointments/appointments.service.ts](src/modules/appointments/appointments.service.ts#L1)

