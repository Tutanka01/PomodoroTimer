# Flow Pomodoro Timer

Un minuteur Pomodoro moderne, réactif et fiable avec statistiques avancées, authentification Supabase et déploiement Docker/Nginx prêt pour la production.

## 🎯 Objectif
Optimiser les sessions de concentration (focus) en offrant : précision du temps (anti-dérive), visualisation des progrès, suivi des habitudes et expérience UI soignée (palette froide cyan/bleu, glassmorphism).

## ✨ Fonctionnalités principales
- Timer Pomodoro fiable (horodatage epoch + resynchronisation) sans dérive ni pause en onglet inactif.
- Durées configurables (Focus / Short Break / Long Break) avec presets + contrôles +/-.
- Démarrage manuel des pauses (pas d’enchaînement forcé).
- Historique sessions enregistré (intention, rating optionnel post-session).
- Dashboard analytique :
  - Streak quotidienne, plus longue série, constance (% jours actifs)
  - Progression de niveau (XP cumulée)
  - Calendrier mensuel navigable
  - Vue horaire (fondations pour densité journalière)
- Auth Supabase (email + Google OAuth) — usage anonyme possible.
- Politique RLS stricte (chaque utilisateur ne lit que ses données).
- Thème clair/sombre + palette froide (bleu / cyan / teal) homogène.
- Interface inline Settings (plus de modal intrusive).
- Build Vite + React 18 + Tailwind + CSS custom (glass, gradients, animations douces).
- Conteneur multi‑stage avec Nginx optimisé (gzip, cache assets long-terme, fallback SPA, headers sécurité de base).

## 🧱 Pile technique
| Couche | Outils |
|--------|--------|
| UI | React 18, Vite, Tailwind, CSS custom gradients & glass |
| Audio | Tone.js |
| Auth & Données | Supabase (Postgres + Auth + RLS) |
| Déploiement | Docker multi-stage (Node build → Nginx runtime) |
| Sécurité base | Row Level Security, vues agrégées read-only |

## 🗂 Structure simplifiée
```
.
├─ Dockerfile
├─ docker-compose.yml
├─ nginx.conf
├─ react-app/
│  ├─ package.json
│  ├─ src/
│  │  ├─ main.css
│  │  ├─ main.jsx / App.jsx
│  │  ├─ modules/
│  │  │  ├─ usePomodoro.js (logique timer epoch)
│  │  │  ├─ useAuth.js
│  │  │  ├─ statsUtils.js
│  │  │  ├─ Dashboard.jsx
│  │  │  ├─ TimerDisplay.jsx
│  │  │  └─ sessionStore.js
│  └─ .env.example
└─ README.md
```

## ⏱ Logique du timer
Contrairement à un simple setInterval accumulatif (sujet au throttling navigateur), on stocke :
- `targetEpoch` (timestamp de fin en ms)
- Au tick (rafraîchi via interval léger + visibility change) on calcule `remaining = max(0, targetEpoch - Date.now())`.
Avantages : précision stable, pas de dérive cumulative, reprise exacte après tab inactif.

## 🔐 Données & Sécurité
(Table SQL indicative — non incluse ici intégralement)
- `focus_sessions`: user_id (UUID), start_ts, end_ts, duration_sec, kind (focus/break), intention, rating (nullable).
- Vue/jour agrégée pour métriques (streak & régularité) — accessible en lecture seule.
- RLS : chaque requête filtrée par auth.uid() = user_id.

## 🖥 UI / UX
- Palette froide (cyan / bleu / teal) appliquée à timer, barre de progression, points cycles, cartes accent.
- Glass panels + ombres subtiles + animations de gradient lentes.
- Pas de compteurs agressifs / ni compte à rebours 3‑2‑1 (supprimé).
- Paramètres inline (plus accessible / moins context-switch).

## ⚙️ Variables d’environnement
Copier `react-app/.env.example` vers un `.env` à la racine (utilisé par docker-compose) :
```
VITE_SUPABASE_URL= https://<your-ref>.supabase.co
VITE_SUPABASE_ANON_KEY= <public-anon-key>
```
La clé anon est publique (lecture contrôlée par RLS). Ne jamais exposer la service_role dans le front.

## 🐳 Exécution avec Docker Compose
Build + run (utilise `.env` racine) :
```
docker compose up -d --build
```
Accès : http://localhost:8080

Si problème de cache build, forcer :
```
docker compose build --no-cache web
```
Logs :
```
docker compose logs -f
```
Arrêt & nettoyage :
```
docker compose down
```

## 🔧 Scripts NPM (dans `react-app/`)
| Script | Description |
|--------|-------------|
| `npm run dev` | Dev server Vite (HMR) |
| `npm run build` | Build production (minification + hashing) |
| `npm run preview` | Prévisualisation locale du build |

## 🚀 Build Production (manuel hors compose)
```
cd react-app
cp .env.example .env  # remplir valeurs
npm ci
npm run build
# dist/ prêt à être servi (Nginx déjà config dans l’image)
```

## 🛡 Sécurité front / Nginx
- GZIP + cache long (assets hashés). HTML forcé no-cache.
- En‑têtes : X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy.
- Possibles améliorations futures : CSP stricte, COOP/COEP, SRI.

## 🔍 Observabilité basique
Health endpoint : `/healthz` (retourne `ok`).

## 🧪 Fiabilité / Edge cases
| Cas | Comportement |
|-----|--------------|
| Tab inactive | Timer reste exact via epoch diff |
| Changement durée en cours de cycle | Appliqué au prochain cycle |
| Perte focus puis retour | Recalcule restants sans saut visible |
| Session <= 1s restante | Transition propre (callback completion) |

## 🗺 Roadmap (suggestions)
- Injection runtime config (éviter bake-time pour URL Supabase).
- Histogramme horaire complet (graduations + densité).
- Mode ultra-focus (masque UI non-essentielle avec toggle).
- Gradient dynamique basé sur % temps écoulé.
- CSP + SRI + Trusted Types.
- PWA (offline + add to home screen).

## ♻️ Changer de palette (guide rapide)
Tout centralisé dans `main.css` (sélecteurs `.timer-*`, `.focus-progress`, `.cycle-dot`, `.metric-card.accent`). Modifier gradients en conservant contrastes AA.

## 🧩 Conception niveau / XP
Niveaux calculés sur somme de durées focus (ex: palier progressif). Voir `statsUtils.js` pour la formule (adaptable).

## 📦 Docker – Détails
Multi‑stage :
1. `deps`: install dépendances (dev incluses pour build Vite).
2. `build`: build production Vite.
3. `runtime`: Nginx minimal (assets statiques + headers + health).

CMD force `daemon off;` + pid dans `/tmp` (support non-root). L’utilisateur `app` possède les répertoires caches/temp/logs.

## 📝 Licence
MIT. Voir en-têtes des sources si ajout futur.

## 🤝 Contributions
Fork, branche feature, PR. Idées de stats ou optimisations bienvenues.

## ❓ FAQ rapide
| Question | Réponse |
|----------|---------|
| Timer s’arrête quand fenêtre inactive ? | Non, basé sur epoch. |
| Peut-on utiliser sans compte ? | Oui (mode anonyme), mais pas de persistance cloud. |
| Les clés Supabase sont-elles sensibles ? | Clé anon publique seulement. |
| Pourquoi pas service worker ? | PWA prévu en roadmap. |

---
Pour toute amélioration souhaitée (CSP, PWA, runtime config), ouvrir une issue ou adapter directement.
