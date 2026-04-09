# Deploy NUTbits on a VPS

> Running locally instead? See **[INSTALL.md](INSTALL.md)**. Want the fast path? See **[LAZYDEPLOY.md](LAZYDEPLOY.md)**.

**[Prepare](#1-prepare-the-vps) · [Install](#2-install-nutbits) · [Configure](#3-configure) · [Services](#4-install-systemd-services) · [Caddy](#5-install-caddy) · [Manage](#manage) · [Update](#update) · [Troubleshooting](#troubleshooting)**

This guide gets NUTbits running on a Linux VPS with HTTPS via Caddy. For service management details (start/stop, auto-start, removal), see **[SERVICE.md](SERVICE.md)**.

Architecture:
- Backend API on `127.0.0.1:3338`
- GUI server on `127.0.0.1:8080`
- Caddy terminates TLS and proxies both to the public domain

---

## 1. Prepare the VPS

```bash
sudo apt update && sudo apt install -y curl git build-essential
```

Install Node.js 20:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt install -y nodejs
```

## 2. Install NUTbits

```bash
git clone https://github.com/DoktorShift/nutbits.git ~/nutbits
cd ~/nutbits
npm install
npm --prefix gui install
npm install better-sqlite3
```

## 3. Configure

```bash
cp .env.example .env
nano .env
```

Minimum `.env` for a VPS:

```bash
NUTBITS_MINT_URL=https://mint.minibits.cash/Bitcoin
NUTBITS_STATE_PASSPHRASE=replace-with-a-strong-secret

NUTBITS_STATE_BACKEND=sqlite
NUTBITS_SQLITE_PATH=./nutbits_state.db
NUTBITS_RELAYS=wss://relay.getalby.com/v1,wss://relay.8333.space

NUTBITS_API_ENABLED=true
NUTBITS_API_PORT=3338
NUTBITS_API_TOKEN=replace-with-a-long-random-token

NUTBITS_GUI_HOST=127.0.0.1
NUTBITS_GUI_PORT=8080
```

**Sanity check** — before moving on, verify `.env` is valid:

```bash
npm start
```

You should see a clean boot with mint info and relay status. Stop it with `Ctrl+C`.

If you see `Missing NUTBITS_STATE_PASSPHRASE`, your `.env` is not being read. Recreate it:

```bash
cp .env.example .env && nano .env
```

## 4. Install systemd services

```bash
npm run service:linux
loginctl enable-linger "$USER"
```

This builds the GUI, creates two user services, and starts them:
- `nutbits-backend.service` — the NWC backend
- `nutbits-gui.service` — the web GUI

## 5. Install Caddy

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```

## 6. Configure Caddy

Edit `/etc/caddy/Caddyfile` — replace `nutbits.example.com` with your domain:

```caddy
nutbits.example.com {
    encode gzip zstd

    @api path /api/* /connect /app-icons/*
    reverse_proxy @api 127.0.0.1:3338

    reverse_proxy 127.0.0.1:8080
}
```

`/api/*`, `/connect`, and `/app-icons/*` go to the backend. Everything else goes to the GUI.

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl enable caddy
sudo systemctl reload caddy
```

## 7. Verify

From the VPS:

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" http://127.0.0.1:3338/api/v1/status
curl http://127.0.0.1:8080/healthz
```

From your browser:

```
https://nutbits.example.com
```

In the GUI, set:
- **API URL**: leave empty (same-origin)
- **API Token**: the exact `NUTBITS_API_TOKEN` from your `.env`

---

## Manage

Quick reference:

```bash
systemctl --user status  nutbits-backend nutbits-gui     # status
systemctl --user restart nutbits-backend nutbits-gui     # restart
journalctl --user -u nutbits-backend -f                  # backend logs
journalctl --user -u nutbits-gui -f                      # GUI logs
```

For the full list of service commands (start/stop, auto-start toggle, removal), see **[SERVICE.md](SERVICE.md#linux-systemd)**.

---

## Update

```bash
cd ~/nutbits
git pull
npm install
npm --prefix gui install
npm run build:gui
systemctl --user restart nutbits-backend nutbits-gui
```

---

## Reset / Start Over

Remove the services, fix your config, then reinstall:

```bash
npm run service:linux:remove
systemctl --user daemon-reload
# Fix your .env
npm run service:linux
loginctl enable-linger "$USER"
```

See **[SERVICE.md](SERVICE.md#remove-1)** for details.

---

## Troubleshooting

**GUI loads but API calls fail (401)**
- Verify the token works locally: `curl -H "Authorization: Bearer TOKEN" http://127.0.0.1:3338/api/v1/status`
- In the browser, clear stale state: open devtools console and run:
  ```js
  localStorage.removeItem('nutbits_api_url')
  localStorage.removeItem('nutbits_api_token')
  location.reload()
  ```
- Re-enter the token in the GUI and save

**Relays show 0/0 connected**
- Check: `grep '^NUTBITS_RELAYS=' .env`
- If empty or missing, add relays and restart the backend
- If relays were missing during first boot, create a new NWC connection after fixing

**`/connect` page fails but `/` works**
- Caddy is sending `/connect` to the GUI instead of the backend. Check your Caddyfile `@api` matcher.

**Caddy won't issue a certificate**
- DNS must already point to the VPS
- Ports 80 and 443 must be open

**`Missing NUTBITS_STATE_PASSPHRASE`**
- `.env` is missing or `NUTBITS_STATE_PASSPHRASE` is empty/commented. Recreate it from `.env.example`.

---

## Related

- [SERVICE.md](SERVICE.md) — full service management reference (start/stop, auto-start, removal)
- [INSTALL.md](INSTALL.md) — local setup (bare metal, Docker)
- [DATABASE.md](DATABASE.md) — storage backends (file, SQLite, MySQL)
- [BACKUP.md](BACKUP.md) — backup and recovery procedures
