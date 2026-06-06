# syntax=docker/dockerfile:1.7
# Build context = bedones-agents repo root.
FROM node:20-bookworm-slim AS build

ENV PNPM_HOME="/pnpm" \
    PATH="$PNPM_HOME:$PATH" \
    PUPPETEER_SKIP_DOWNLOAD=true

RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/whatsapp-connector/package.json ./apps/whatsapp-connector/package.json

RUN pnpm install --filter whatsapp-connector...

COPY apps/whatsapp-connector ./apps/whatsapp-connector

RUN pnpm --filter whatsapp-connector build

FROM node:20-bookworm-slim AS runtime

ENV PNPM_HOME="/pnpm" \
    PATH="$PNPM_HOME:$PATH" \
    NODE_ENV=production \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    CHROME_BIN=/usr/bin/chromium

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      chromium \
      curl \
      dumb-init \
      fonts-liberation \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable

WORKDIR /app

COPY --from=build /app /app

RUN mkdir -p /app/apps/whatsapp-connector/data/sessions

WORKDIR /app/apps/whatsapp-connector

EXPOSE 3001

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main"]
