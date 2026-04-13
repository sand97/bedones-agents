# syntax=docker/dockerfile:1.7
FROM node:20-bookworm-slim AS build

ENV PNPM_HOME="/pnpm" \
    PATH="$PNPM_HOME:$PATH"

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/backend/package.json ./apps/backend/package.json

RUN pnpm install --frozen-lockfile --filter backend...

COPY apps/backend ./apps/backend

RUN pnpm --filter backend prisma:generate

WORKDIR /app/apps/backend
RUN pnpm build 2>&1 && ls -la dist/ || true
RUN test -f dist/main.js || (echo "ERROR: dist/main.js not found after build" && ls -la . && exit 1)

FROM node:20-bookworm-slim AS runtime

ENV PNPM_HOME="/pnpm" \
    PATH="$PNPM_HOME:$PATH" \
    NODE_ENV=production

RUN corepack enable \
    && apt-get update \
    && apt-get install -y --no-install-recommends curl openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=build /app /app

WORKDIR /app/apps/backend

EXPOSE 3005

CMD ["sh", "-c", "\
  attempts=0; \
  until pnpm exec prisma migrate deploy; do \
    attempts=$((attempts + 1)); \
    if [ \"$attempts\" -ge 20 ]; then \
      echo 'Prisma migrate deploy failed after 20 attempts'; \
      exit 1; \
    fi; \
    echo \"Migration attempt $attempts failed, retrying in 5s...\"; \
    sleep 5; \
  done; \
  exec node dist/main \
"]
