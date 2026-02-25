# Stage 1: Install dependencies
FROM node:20-alpine AS deps

RUN apk add --no-cache python3 make g++

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Stage 2: Build the application
FROM node:20-alpine AS build

RUN apk add --no-cache python3 make g++

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN npm run build

# Build worker (tsup)
RUN npx tsup src/worker.ts --format cjs --out-dir dist --external better-sqlite3

# Stage 3: Production runtime
FROM node:20-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone server (includes minimal node_modules)
COPY --from=build /app/.next/standalone ./

# Copy static assets
COPY --from=build /app/.next/static ./.next/static

# Copy migration SQL files to a separate path (NOT inside /app/db)
# The /app/db directory is volume-mounted for SQLite persistence,
# which would overwrite migrations if they lived there.
COPY --from=build /app/db/migrations ./migrations

# Copy worker build
COPY --from=build /app/dist ./dist

# Create db directory for SQLite volume mount
RUN mkdir -p /app/db && chown nextjs:nodejs /app/db

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
