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

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next

# Prisma schema + migrations for `prisma migrate deploy`
COPY --from=builder /app/prisma ./prisma

# Worker runs from TS source using `tsx`
COPY --from=builder /app/src ./src
COPY --from=builder /app/tsconfig.json ./tsconfig.json

EXPOSE 3000

CMD ["npm", "run", "start"]

