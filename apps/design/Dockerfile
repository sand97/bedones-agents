# ── Build stage ──────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json ./
RUN npm install --no-audit --no-fund
COPY . .
RUN npm run build

# ── Serve stage (static SPA via Caddy) ───────────────────
FROM caddy:2-alpine
COPY --from=build /app/dist /srv
RUN printf ':3008 {\n\troot * /srv\n\tencode gzip\n\ttry_files {path} /index.html\n\tfile_server\n}\n' \
  > /etc/caddy/Caddyfile
EXPOSE 3008
