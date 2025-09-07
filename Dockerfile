## Build stage
FROM node:20-alpine AS build
WORKDIR /app
COPY react-app/package.json react-app/package-lock.json* ./react-app/
WORKDIR /app/react-app
RUN npm install --no-audit --no-fund
COPY react-app/ /app/react-app/
RUN npm run build

## Runtime stage
FROM nginx:alpine
COPY --from=build /app/react-app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]