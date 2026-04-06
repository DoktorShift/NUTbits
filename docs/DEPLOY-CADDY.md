# Deploy NUTbits on a VPS with Caddy

This guide deploys NUTbits on a Linux VPS behind Caddy with HTTPS.

It assumes:
- your domain points to the VPS
- you want the GUI available publicly
- the API stays bound to `127.0.0.1`
- Caddy terminates TLS and proxies traffic locally

## Overview

NUTbits uses two local services:
- API backend on `127.0.0.1:3338`
- GUI server on `127.0.0.1:8080`

Caddy should proxy:
- `/api/*` to the API
- `/connect` to the API
- `/app-icons/*` to the API
- everything else to the GUI

## 1. Prepare the VPS

Ubuntu/Debian example:

```bash
sudo apt update
sudo apt install -y curl git build-essential
```

Install Node.js 20:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt install -y nodejs
node --version
npm --version
```

## 2. Clone the repo

```bash
git clone https://github.com/DoktorShift/nutbits.git
cd nutbits
npm install
npm --prefix gui install
```

If you want SQLite storage, install the optional driver:

```bash
npm install better-sqlite3
```

## 3. Configure NUTbits

Create your env file:

```bash
cp .env.example .env
nano .env
```

Minimum recommended settings:

```bash
NUTBITS_MINT_URL=https://your-mint.example.com
NUTBITS_STATE_PASSPHRASE=replace-this-with-a-strong-secret

# Keep API local. Caddy will proxy to it.
NUTBITS_API_PORT=3338

# Keep GUI local. Caddy will proxy to it.
NUTBITS_GUI_HOST=127.0.0.1
NUTBITS_GUI_PORT=8080

# Recommended for VPS use
NUTBITS_STATE_BACKEND=sqlite
```

Notes:
- Do not bind the API directly to the public internet.
- Do not point browsers to `http://127.0.0.1:3338`; use your public domain.
- If you use MySQL instead of SQLite, configure `NUTBITS_MYSQL_URL` accordingly.

## 4. First local start

Build the GUI:

```bash
npm run build:gui
```

Start the backend in one terminal:

```bash
npm start
```

Start the GUI in a second terminal:

```bash
npm run gui
```

Quick checks from the VPS:

```bash
curl http://127.0.0.1:3338/api/v1/bootstrap
curl http://127.0.0.1:8080/healthz
```

You should get a JSON response from both endpoints.

Stop both processes after verifying they work.

## 5. Create systemd services

Use the bundled Linux service installer:

```bash
npm run service:linux
```

It will:
- install backend dependencies if needed
- install GUI dependencies if needed
- build the GUI
- create `nutbits-backend.service`
- create `nutbits-gui.service`
- enable and start both services

Allow user services to keep running after logout:

```bash
loginctl enable-linger "$USER"
```

Check status:

```bash
systemctl --user status nutbits-backend
systemctl --user status nutbits-gui
journalctl --user -u nutbits-backend -f
journalctl --user -u nutbits-gui -f
```

## 6. Install Caddy

Ubuntu/Debian example:

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy
```

## 7. Configure Caddy

Edit `/etc/caddy/Caddyfile`:

```bash
sudo nano /etc/caddy/Caddyfile
```

Use this config, replacing `nutbits.example.com` with your real domain:

```caddy
nutbits.example.com {
    encode gzip zstd

    @api path /api/* /connect /app-icons/*
    reverse_proxy @api 127.0.0.1:3338

    reverse_proxy 127.0.0.1:8080
}
```

Why this split matters:
- `/connect` is served by the backend, not the GUI
- `/app-icons/*` is served by the backend for the deeplink page
- the Vue GUI itself is served from port `8080`

Validate and reload:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl enable caddy
sudo systemctl reload caddy
```

## 8. Verify the deployment

From your laptop or browser:

- Open `https://nutbits.example.com`
- Open `https://nutbits.example.com/connect?appname=TestApp&callback=`

From the VPS:

```bash
curl https://nutbits.example.com/connect?appname=TestApp\&callback=
curl https://nutbits.example.com/api/v1/status \
  -H "Authorization: Bearer $(cat ~/.nutbits/nutbits.sock.token)"
```

If the GUI loads but API calls fail, check:
- Caddy is routing `/api/*` to `127.0.0.1:3338`
- the backend service is running
- the GUI is using same-origin API calls, not a stale saved `127.0.0.1` URL in browser storage

## 9. Updating

Update the code and rebuild the GUI:

```bash
cd ~/nutbits
git pull
npm install
npm --prefix gui install
npm run build:gui
systemctl --user restart nutbits-backend
systemctl --user restart nutbits-gui
```

## Troubleshooting

GUI opens, but actions fail:
- open the browser dev tools and confirm requests go to `https://your-domain/api/...`
- if they go to `http://127.0.0.1:3338`, clear the saved API URL in the GUI settings

`/connect` fails, but `/` works:
- your proxy is likely sending `/connect` to the GUI instead of the API

Caddy certificate is not issued:
- confirm DNS already points to the VPS
- confirm ports `80` and `443` are open

Backend not reachable through Caddy:
- verify `curl http://127.0.0.1:3338/api/v1/bootstrap` works on the VPS

GUI not reachable through Caddy:
- verify `curl http://127.0.0.1:8080/healthz` works on the VPS
