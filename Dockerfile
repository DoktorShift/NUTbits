FROM node:22-alpine AS builder

# Build deps for better-sqlite3 (optional, only if using sqlite backend)
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --production

# ── Production image ──────────────────────────────────────────
FROM node:22-alpine

WORKDIR /app

# Copy built node_modules from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy application
COPY package.json LICENSE ./
COPY nutbits.js ./
COPY store/ ./store/

# Data volume for state persistence
RUN mkdir -p /data
ENV NUTBITS_STATE_FILE=/data/nutbits_state.enc
ENV NUTBITS_SQLITE_PATH=/data/nutbits.db

# Don't run as root
RUN adduser -D nutbits && chown -R nutbits:nutbits /data
USER nutbits

CMD ["node", "nutbits.js"]
