# Movie In The Park - Backend API

Backend API pour la gestion des réservations, paiements et génération de tickets QR pour l'événement "Movie In The Park".

## Prérequis

- Node.js >= 18.0.0
- npm >= 9.0.0
- PostgreSQL >= 12

## Installation

1. Cloner le projet et installer les dépendances:

\`\`\`bash
npm install
\`\`\`

2. Créer la base de données PostgreSQL:

\`\`\`bash
createdb linsup
\`\`\`

3. Configurer les variables d'environnement:

\`\`\`bash
cp .env.example .env
\`\`\`

Éditer le fichier `.env` avec vos paramètres:

\`\`\`
NODE_ENV=development
PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=linsup
DB_USER=postgres
DB_PASSWORD=Nexus2023.
JWT_SECRET=your_super_secret_jwt_key_change_in_production
JWT_EXPIRY=7d
JWT_REFRESH_SECRET=your_super_secret_refresh_key_change_in_production
JWT_REFRESH_EXPIRY=30d
QR_SECRET=your_qr_secret_key
LOG_LEVEL=debug
\`\`\`

## Démarrage

Mode développement (avec auto-reload):

\`\`\`bash
npm run dev
\`\`\`

Production:

\`\`\`bash
npm start
\`\`\`

Le serveur démarre sur `http://localhost:3000`

## Structure du projet

\`\`\`
src/
├── config/          # Configuration DB et logger
├── controllers/     # Logique des endpoints
├── middlewares/     # Auth, validation, permissions
├── models/          # Modèles Sequelize
├── routes/          # Routes API
├── services/        # Logique métier
├── utils/           # Utilitaires (JWT, QR, PDF)
└── index.js         # Point d'entrée
\`\`\`

## Endpoints API

### Authentification

- \`POST /api/v1/auth/login\` - Connexion
- \`POST /api/v1/auth/register\` - Inscription
- \`POST /api/v1/auth/refresh\` - Rafraîchir le token

### Réservations

- \`GET /api/v1/reservations\` - Lister les réservations
- \`POST /api/v1/reservations\` - Créer une réservation
- \`GET /api/v1/reservations/:id\` - Détails d'une réservation
- \`PUT /api/v1/reservations/:id\` - Modifier une réservation
- \`POST /api/v1/reservations/:id/cancel\` - Annuler une réservation

### Paiements

- \`GET /api/v1/payments\` - Lister les paiements
- \`POST /api/v1/reservations/:id/payments\` - Ajouter un paiement

### Tickets

- \`GET /api/v1/tickets\` - Lister les tickets
- \`POST /api/v1/tickets/:reservationId/generate\` - Générer un ticket

### Scan

- \`POST /api/v1/scan/decode\` - Décoder un QR code
- \`POST /api/v1/scan/validate\` - Valider une entrée

### Packs

- \`GET /api/v1/packs\` - Lister les packs
- \`GET /api/v1/packs/:id\` - Détails d'un pack
- \`POST /api/v1/packs\` - Créer un pack (admin)
- \`PUT /api/v1/packs/:id\` - Modifier un pack (admin)
- \`DELETE /api/v1/packs/:id\` - Supprimer un pack (admin)

## Authentification

L'API utilise JWT (JSON Web Token) pour l'authentification.

Inclure le token dans l'header:

\`\`\`
Authorization: Bearer <token>
\`\`\`

## Rôles et Permissions

- **superadmin**: Accès complet
- **admin**: Gestion des réservations, paiements, tickets
- **cashier**: Création et modification des réservations
- **scanner**: Lecture des tickets et validation d'entrées

## Logs

Les logs sont stockés dans le dossier \`./logs/\`:

- \`error.log\` - Erreurs uniquement
- \`all.log\` - Tous les logs

## License

MIT
