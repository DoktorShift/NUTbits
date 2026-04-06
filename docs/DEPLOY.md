# Deploy NUTbits on a VPS

Production deployment means:
- the API stays on `127.0.0.1`
- the GUI stays on `127.0.0.1`
- Caddy terminates HTTPS and proxies requests locally
- Linux `systemd --user` keeps both backend and GUI running

If you want the full step-by-step guide, use **[DEPLOY-CADDY.md](DEPLOY-CADDY.md)**.

## Recommended Path

Run these commands on your VPS:

```bash
git clone https://github.com/DoktorShift/nutbits.git
cd nutbits
npm install
npm --prefix gui install
cp .env.example .env
```

Set at least:

```bash
NUTBITS_MINT_URL=https://your-mint.example.com
NUTBITS_STATE_PASSPHRASE=replace-this-with-a-strong-secret
NUTBITS_API_PORT=3338
NUTBITS_API_TOKEN=replace-this-with-a-long-random-secret
NUTBITS_GUI_HOST=127.0.0.1
NUTBITS_GUI_PORT=8080
NUTBITS_STATE_BACKEND=sqlite
```

If using SQLite:

```bash
npm install better-sqlite3
```

Install and start the Linux services:

```bash
npm run service:linux
loginctl enable-linger "$USER"
```

That command now:
- installs backend dependencies if needed
- installs GUI dependencies if needed
- builds the GUI
- creates `nutbits-backend.service`
- creates `nutbits-gui.service`
- enables and starts both

Check status:

```bash
systemctl --user status nutbits-backend
systemctl --user status nutbits-gui
```

Use that same `NUTBITS_API_TOKEN` in the browser GUI.

## Caddy Config

Edit `/etc/caddy/Caddyfile` and replace the domain:

```caddy
nutbits.example.com {
    encode gzip zstd

    @api path /api/* /connect /app-icons/*
    reverse_proxy @api 127.0.0.1:3338

    reverse_proxy 127.0.0.1:8080
}
```

Reload Caddy:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl enable caddy
sudo systemctl reload caddy
```

## Verify

Open:

```text
https://nutbits.example.com
https://nutbits.example.com/connect?appname=TestApp&callback=
```

Check the API from the VPS:

```bash
curl https://nutbits.example.com/api/v1/status \
  -H "Authorization: Bearer replace-this-with-a-long-random-secret"
```

## Reset / Start Over

If you want to wipe the current Linux service setup and start clean:

```bash
cd ~/projects/NUTbits
npm run service:linux:remove
systemctl --user daemon-reload
```

Then confirm your `.env` contains at least:

```bash
NUTBITS_MINT_URL=https://your-mint.example.com
NUTBITS_STATE_PASSPHRASE=replace-this-with-a-strong-secret
NUTBITS_STATE_BACKEND=sqlite
NUTBITS_SQLITE_PATH=./nutbits_state.db
NUTBITS_RELAYS=wss://relay.getalby.com/v1
NUTBITS_API_ENABLED=true
NUTBITS_API_PORT=3338
NUTBITS_API_TOKEN=replace-this-with-a-long-random-secret
NUTBITS_GUI_HOST=127.0.0.1
NUTBITS_GUI_PORT=8080
```

Then reinstall and start:

```bash
npm run service:linux
loginctl enable-linger "$USER"
```

## Important Note

Do not proxy all traffic to port `3338`. In this repo:
- `/api`, `/connect`, and `/app-icons` come from the backend
- `/` comes from the GUI server

## Full Guide

For the complete walkthrough, troubleshooting, and update commands, see **[DEPLOY-CADDY.md](DEPLOY-CADDY.md)**.


 For ongoing VPS ops, use only:

  systemctl --user start nutbits-backend
  systemctl --user start nutbits-gui
  systemctl --user stop nutbits-backend
  systemctl --user stop nutbits-gui
  systemctl --user restart nutbits-backend
  systemctl --user restart nutbits-gui
  journalctl --user -u nutbits-backend -f
  journalctl --user -u nutbits-gui -f