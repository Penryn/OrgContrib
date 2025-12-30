# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS base
WORKDIR /app

# Prisma engines require OpenSSL
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps

# Prisma CLI validates env("DATABASE_URL") even for generate steps.
ENV DATABASE_URL=postgresql://postgres:postgres@localhost:5432/zjutjh?schema=public

COPY package.json package-lock.json ./
COPY prisma ./prisma

RUN npm ci

FROM base AS builder
ENV DATABASE_URL=postgresql://postgres:postgres@localhost:5432/zjutjh?schema=public

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

# --- Web (small) ---
# Uses Next.js standalone output: only required node_modules are copied.
FROM base AS web
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000

CMD ["node", "server.js"]

# --- Worker (keeps dev deps because it runs TS via tsx) ---
FROM base AS worker
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/src ./src
COPY --from=builder /app/tsconfig.json ./tsconfig.json

CMD ["npm", "run", "worker"]

# --- Migrate (Prisma CLI) ---
FROM base AS migrate
WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma

CMD ["sh", "-c", "npx prisma migrate deploy"]

