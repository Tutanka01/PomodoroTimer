# Flow Pomodoro Timer

Minuteur Pomodoro avec statistiques, auto-hébergé. Le serveur Node sert à la fois l'API JSON et l'application React, et stocke tout dans un fichier SQLite local.

## Fonctionnalités

- Minuteur Focus / Pause courte / Pause longue basé sur des horodatages (aucune dérive, exact même onglet inactif).
- Compte email + mot de passe, session par cookie HttpOnly ; usage anonyme possible sans persistance.
- Historique des sessions avec intention et note de productivité facultative (1–5).
- Statistiques : agrégats journaliers, séries, calendrier, objectif de focus quotidien.
- Thème clair/sombre, interface responsive.

## Stack

| Couche | Technologie |
|--------|-------------|
| Front | React 18 + Vite + Tailwind |
| Serveur | Node natif (`node:http`, `node:crypto`) — **zéro dépendance npm** |
| Base | SQLite via `node:sqlite` (module natif, Node ≥ 24) |
| Déploiement | Docker multi-stage, un seul conteneur |

## Démarrage Docker

```bash
git clone https://github.com/Tutanka01/PomodoroTimer.git
cd PomodoroTimer
docker compose up -d --build
```

L'application est disponible sur <http://localhost:8080>. Aucun fichier `.env` n'est nécessaire.

## Où sont les données

Tout vit dans le volume Docker nommé `flow-data` (base `/data/flow.db` en mode WAL). Les données survivent aux mises à jour et à la suppression du conteneur.

Sauvegarde :

```bash
docker compose stop
docker run --rm -v flow-data:/data -v "$PWD":/backup alpine \
  tar czf /backup/flow-backup.tgz -C /data .
docker compose start
```

Restauration :

```bash
docker compose stop
docker run --rm -v flow-data:/data -v "$PWD":/backup alpine \
  sh -c 'find /data -mindepth 1 -delete && tar xzf /backup/flow-backup.tgz -C /data'
docker compose start
```

## Variables d'environnement

| Variable | Défaut | Description |
|----------|--------|-------------|
| `PORT` | `3000` | Port HTTP du serveur. |
| `DB_PATH` | `./data/flow.db` | Fichier SQLite (dossier parent créé automatiquement). |
| `PUBLIC_DIR` | `react-app/dist` | Dossier des fichiers statiques (build Vite). |
| `SESSION_SECRET` | auto-généré | Secret HMAC des cookies ; s'il est absent, généré et conservé dans `data/.session-secret` (chmod 0600). **32 caractères minimum** si fourni. |
| `COOKIE_SECURE` | — | `1` derrière un reverse proxy HTTPS (cookie `Secure`). |
| `TRUST_PROXY` | — | `1` derrière un reverse proxy : utilise `X-Forwarded-For` (dernière entrée, ajoutée par votre proxy) pour le rate limiting. |

Voir `.env.example` pour un modèle commenté.

## Développement local

Node ≥ 24 requis (testé sur Node 26).

```bash
# Terminal 1 — API + base SQLite
node server/index.js

# Terminal 2 — front Vite avec proxy /api vers :3000
cd react-app
npm install
npm run dev
```

Front sur <http://localhost:5173>, API sur <http://localhost:3000>.

Tests du serveur :

```bash
node --test server/
```

## Mise à jour

```bash
git pull
docker compose up -d --build
```

Le volume `flow-data` n'est pas touché ; les migrations de schéma sont appliquées au démarrage.

## Sécurité

- Mots de passe hachés avec `scrypt` (sel aléatoire, comparaison en temps constant).
- Cookie de session signé HMAC-SHA256, `HttpOnly`, `SameSite=Lax`, expiration 30 jours.
- Limitation des tentatives de connexion par couple (IP, email) : 10 échecs / 15 min, plus un plafond global de 50 échecs par IP. Une connexion réussie ne réarme pas les compteurs des autres comptes. Création de comptes plafonnée à 10 par IP et par heure.
- Hachage `scrypt` asynchrone (l'event loop n'est pas bloqué) ; réponse à coût constant pour les emails inconnus.
- Validation stricte des entrées, corps JSON limité à 64 Ko, requêtes SQL paramétrées.
- En-têtes `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`.
- Pas de dépendance npm côté serveur : surface d'attaque minimale.
- En HTTPS (reverse proxy), activez `COOKIE_SECURE=1` et définissez un `SESSION_SECRET` fixe.

## Licence

MIT.
