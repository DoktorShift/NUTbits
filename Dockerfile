FROM node:22-alpine AS builder

# Build deps for better-sqlite3 and native modules
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Install backend dependencies
COPY package.json package-lock.json ./
RUN npm ci --production

# Install GUI dependencies and build
COPY gui/package.json gui/package-lock.json ./gui/
RUN npm --prefix gui ci
COPY gui/ ./gui/
RUN npm --prefix gui run build

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
COPY scripts/nutbits-gui-server.js ./scripts/
COPY scripts/docker-entrypoint.sh ./scripts/

# Copy built GUI
COPY --from=builder /app/gui/dist ./gui/dist
COPY gui/package.json ./gui/

# Data volume for state persistence
RUN mkdir -p /data /home/nutbits/.nutbits

ENV NUTBITS_STATE_FILE=/data/nutbits_state.enc
ENV NUTBITS_SQLITE_PATH=/data/nutbits.db
ENV NUTBITS_API_SOCKET=/home/nutbits/.nutbits/nutbits.sock
ENV NUTBITS_API_PORT=3338
ENV NUTBITS_GUI_HOST=0.0.0.0
ENV NUTBITS_GUI_PORT=8080

EXPOSE 3338 8080

# Don't run as root
RUN adduser -D nutbits && chown -R nutbits:nutbits /app /data /home/nutbits/.nutbits
USER nutbits

ENTRYPOINT ["sh", "scripts/docker-entrypoint.sh"]
