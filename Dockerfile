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
COPY package.json ./
COPY nutbits.js ./
COPY store/ ./store/
COPY api/ ./api/
COPY cli/ ./cli/
COPY bin/ ./bin/

# Data volume for state persistence
RUN mkdir -p /data /home/nutbits/.nutbits

ENV NUTBITS_STATE_FILE=/data/nutbits_state.enc
ENV NUTBITS_SQLITE_PATH=/data/nutbits.db
# Socket inside the container — mount for host CLI access
ENV NUTBITS_API_SOCKET=/home/nutbits/.nutbits/nutbits.sock

# Don't run as root
RUN adduser -D nutbits && chown -R nutbits:nutbits /data /home/nutbits/.nutbits
USER nutbits

CMD ["node", "nutbits.js"]
