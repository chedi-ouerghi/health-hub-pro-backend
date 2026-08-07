# Health Hub Pro — Backend MVP (NestJS + Prisma + Redis)

Plateforme médicale de prise de rendez-vous **en présentiel uniquement**.

## Requirements

- Node.js >= 20
- PostgreSQL >= 15
- Redis (optionnel pour dev local, activé si `REDIS_URL` est présent)

## Configuration

1. Copier le fichier d'environnement exemple :
   ```bash
   cp .env.example .env
   ```
2. Ajuster les variables d'environnement dans `.env` (`DATABASE_URL`, `JWT_SECRET`, `REDIS_URL`, etc.).

## Installation & Démarrage

```bash
# 1. Installer les dépendances
npm install

# 2. Générer le client Prisma
npx prisma generate

# 3. Exécuter les migrations de base de données
npx prisma migrate dev

# 4. Lancer le seeder (optionnel)
npm run prisma:seed

# 5. Démarrer le serveur en mode développement
npm run start:dev
```

## Documentation Swagger

Une fois le serveur lancé (par défaut sur http://localhost:5000) :
- Swagger UI : http://localhost:5000/api-docs
- Health Check : http://localhost:5000/api/v1/health

## Modules principaux

- `auth` : Register (PATIENT/DOCTOR), Login (protection brute-force argon2id), Refresh token rotation, Logout, Email verification, Password reset.
- `users` : Profile me (Patient/Doctor), patch profile.
- `specialties` : Liste des spécialités médicales (mise en cache Redis).
- `doctors` : Recherche avec filtres (spécialité, ville, dispo), profil complet, gestion des créneaux de disponibilité (`Availability`).
- `patients` : Gestion du profil patient et accès sécurisé aux dossiers patients par les médecins traitants.
- `appointments` : Réservation de rendez-vous en présentiel, snapshot de l'adresse du cabinet, gestion des statuts (`UPCOMING`, `COMPLETED`, `CANCELLED`, `NO_SHOW`), annulation sécurisée.
- `invoices` : Factures générées automatiquement à la fin des RDV (`COMPLETED`), marquage payé (ADMIN).
- `reviews` : Avis et notes vérifiés après RDV terminé.
- `medications`, `vitals`, `notifications`, `activity-logs` : Suivi médical du patient et traçabilité.
