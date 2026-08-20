# syntax=docker/dockerfile:1

# =========================================================
#  BAAK AI — production image (multi-stage)
#  Build context : apps/baak-ai (folder ini)
#  Runtime       : node:24-slim + Next.js standalone
# =========================================================

# ---------- Stage 1: deps ----------
FROM node:24-slim AS deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---------- Stage 2: build ----------
FROM node:24-slim AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
# Build standalone. Nilai env TIDAK dibutuhkan saat build (tidak ada
# NEXT_PUBLIC_* yang di-inline) — runtime yang menyediakannya.
RUN npm run build

# ---------- Stage 3: runtime ----------
FROM node:24-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3010
ENV HOSTNAME=0.0.0.0

# Jangan jalankan sebagai root.
RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 nextjs

# Standalone output (Next.js >= 16) + static assets.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Skrip migrasi + seed dijalankan di entrypoint (butuh runtime tooling).
# Dependencies minimal yang dipakai oleh scripts/ dan src/db.
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts
COPY --from=builder --chown=nextjs:nodejs /app/src/db ./src/db
COPY --from=builder --chown=nextjs:nodejs /app/drizzle ./drizzle
COPY --from=builder --chown=nextjs:nodejs /app/tsconfig.json ./tsconfig.json

COPY --from=builder --chown=nextjs:nodejs /app/node_modules/drizzle-orm ./node_modules/drizzle-orm
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/pg ./node_modules/pg
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/dotenv ./node_modules/dotenv
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/tsx ./node_modules/tsx
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/bcryptjs ./node_modules/bcryptjs

# Folder upload (runtime Compose: bind mount ./uploads -> /app/uploads)
RUN mkdir -p /app/uploads && chown nextjs:nodejs /app/uploads

USER nextjs

EXPOSE 3010

COPY --chown=nextjs:nodejs docker-entrypoint.sh /docker-entrypoint.sh
USER root
RUN chmod +x /docker-entrypoint.sh
USER nextjs

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", "server.js"]
