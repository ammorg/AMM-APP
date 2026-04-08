# ─── Affordable Mobile Mechanics — Dockerfile ────────────────────────────────
# Multi-stage build: build stage compiles the frontend and bundles the server,
# then a lean runtime stage copies only what is needed to run.

# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies (including dev deps needed for the build)
COPY package.json package-lock.json ./
RUN npm ci

# Copy source
COPY . .

# Build frontend (Vite) + server bundle (esbuild via tsx script/build.ts)
RUN npm run build

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime

WORKDIR /app

# Install only production dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy built artefacts from builder
COPY --from=builder /app/dist ./dist

# Create a directory for the SQLite database that can be mounted as a volume
RUN mkdir -p /data

# The app defaults to "data.db" in the working directory.
# We point it to /data/data.db by setting the DATABASE_PATH env (requires
# the storage.ts patch described in DEPLOYMENT.md — see optional section).
# If you haven't applied the patch, mount a volume to /app and map data.db there.
ENV NODE_ENV=production
ENV PORT=5000
# ENV DATABASE_PATH=/data/data.db

EXPOSE 5000

# Persist SQLite database across container restarts
VOLUME ["/data"]

CMD ["node", "dist/index.cjs"]
