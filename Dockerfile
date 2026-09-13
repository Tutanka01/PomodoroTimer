############################
# Étape 1 — build du front Vite
############################
FROM node:26-alpine AS build
WORKDIR /app
COPY react-app/package.json react-app/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY react-app/ ./
RUN npm run build

############################
# Étape 2 — exécution : Node sert l'API + le build statique
############################
FROM node:26-alpine AS runtime

LABEL org.opencontainers.image.source="https://github.com/Tutanka01/PomodoroTimer" \
      org.opencontainers.image.title="Flow Pomodoro" \
      org.opencontainers.image.description="Production image for Flow Pomodoro Timer" \
      org.opencontainers.image.licenses="MIT"

ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=/data/flow.db \
    PUBLIC_DIR=/app/public

WORKDIR /app
COPY server/ ./server/
COPY --from=build /app/dist ./public
RUN mkdir -p /data && chown node:node /data

USER node
EXPOSE 3000
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1

CMD ["node", "server/index.js"]
