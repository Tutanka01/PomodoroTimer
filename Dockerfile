############################
# Build stage
############################
FROM node:20-alpine AS deps
WORKDIR /app
COPY react-app/package.json react-app/package-lock.json* ./react-app/
WORKDIR /app/react-app
# Need devDependencies (vite, tailwind, plugin-react) for the build. Removing --omit=dev fixes rollup optional binary error.
# Fallback retry handles npm optional dependency bug.
RUN npm ci --no-audit --no-fund || (echo 'Primary npm ci failed – retrying with clean cache' && rm -rf node_modules package-lock.json && npm cache clean --force && npm install --no-audit --no-fund)

FROM node:20-alpine AS build
WORKDIR /app/react-app
COPY --from=deps /app/react-app/node_modules ./node_modules
COPY react-app/ ./
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
	VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
RUN npm run build

############################
# Runtime stage (Nginx)    #
############################
FROM nginx:1.27-alpine AS runtime
LABEL org.opencontainers.image.source="https://github.com/Tutanka01/PomodoroTimer" \
	  org.opencontainers.image.title="Flow Pomodoro" \
	  org.opencontainers.image.description="Production image for Flow Pomodoro Timer" \
	  org.opencontainers.image.licenses="MIT"

# Remove default config & add ours
RUN rm /etc/nginx/conf.d/default.conf || true
COPY nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/react-app/dist /usr/share/nginx/html

# Non-root user best practice
RUN addgroup -S app && adduser -S app -G app && \
	mkdir -p /var/cache/nginx/client_temp /var/cache/nginx/proxy_temp /var/cache/nginx/fastcgi_temp /var/cache/nginx/uwsgi_temp /var/cache/nginx/scgi_temp /var/run /var/log/nginx && \
	chown -R app:app /usr/share/nginx/html /var/cache/nginx /var/run /var/log/nginx
USER app

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD wget -qO- http://127.0.0.1/healthz || exit 1
# Custom pid path in /tmp (writable) to allow non-root execution
CMD ["nginx", "-g", "pid /tmp/nginx.pid; daemon off;"]