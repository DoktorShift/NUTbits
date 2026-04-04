# Deploy NUTbits on a VPS

> Production deployment with HTTPS, reverse proxy, and 24/7 uptime.
> For local development, see [INSTALL.md](INSTALL.md).

**[Requirements](#requirements) · [Install Node](#step-1-install-nodejs) · [Configure](#step-3-configure) · [Systemd](#step-5-install-as-a-system-service) · [Caddy](#option-a-caddy-recommended) · [nginx](#option-b-nginx) · [Verify](#step-7-verify-the-deployment) · [Security](#security-checklist) · [Troubleshooting](#troubleshooting)**

---

## Requirements

- A Linux VPS (Ubuntu 22+, Debian 12+, or similar)
- A domain name pointing to your VPS IP (e.g. `nutbits.yourdomain.com`)
- Node.js >= 18
- A Cashu mint URL ([find one](https://bitcoinmints.com) or run your own)

## Step 1: Install Node.js

```bash
# Ubuntu/Debian — install Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt-get install -y nodejs

# Verify
node --version   # should be >= 18
npm --version
```

## Step 2: Clone and install

```bash
git clone https://github.com/DoktorShift/nutbits.git
cd nutbits
npm install
```

## Step 3: Configure

```bash
cp .env.example .env
nano .env
```

**Required settings:**

```bash
NUTBITS_MINT_URL=https://your-mint.example.com
NUTBITS_STATE_PASSPHRASE=a-strong-passphrase-here

# API must listen on HTTP for the reverse proxy to reach it
NUTBITS_API_PORT=3338

# Recommended: use SQLite for production
NUTBITS_STATE_BACKEND=sqlite
```

Install SQLite driver:

```bash
npm install better-sqlite3
```

## Step 4: First run (test it works)

```bash
npm start
```

You should see the boot sequence with all green indicators. Copy the NWC connection string and the seed. Press `Ctrl+C` to stop.

**Back up your seed immediately.** Without it, proof recovery is impossible.

## Step 5: Install as a system service

```bash
npm run service:linux
```

This creates a systemd user service that:
- Starts on boot
- Restarts on crash
- Runs in the background

Enable linger so the service survives SSH logout:

```bash
loginctl enable-linger "$USER"
```

**Verify it's running:**

```bash
systemctl --user status nutbits
journalctl --user -u nutbits -f
```

## Step 6: Set up the reverse proxy

NUTbits listens on `127.0.0.1:3338`. A reverse proxy serves it to the internet with HTTPS.

Pick one: **Caddy** (recommended — automatic HTTPS) or **nginx**.

---

### Option A: Caddy (recommended)

Caddy handles HTTPS certificates automatically via Let's Encrypt.

**Install Caddy:**

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy
```

**Configure:**

```bash
sudo nano /etc/caddy/Caddyfile
```

```
nutbits.yourdomain.com {
    reverse_proxy 127.0.0.1:3338
}
```

Replace `nutbits.yourdomain.com` with your actual domain.

**Start Caddy:**

```bash
sudo systemctl enable caddy
sudo systemctl restart caddy
```

That's it. Caddy fetches the TLS certificate automatically. Your NUTbits is now live at `https://nutbits.yourdomain.com`.

---

### Option B: nginx

**Install nginx:**

```bash
sudo apt install -y nginx
```

**Install certbot for HTTPS:**

```bash
sudo apt install -y certbot python3-certbot-nginx
```

**Configure nginx:**

```bash
sudo nano /etc/nginx/sites-available/nutbits
```

```nginx
server {
    listen 80;
    server_name nutbits.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3338;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
    }
}
```

Replace `nutbits.yourdomain.com` with your actual domain.

**Enable the site:**

```bash
sudo ln -s /etc/nginx/sites-available/nutbits /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

**Get HTTPS certificate:**

```bash
sudo certbot --nginx -d nutbits.yourdomain.com
```

Follow the prompts. Certbot modifies the nginx config to add HTTPS and sets up auto-renewal.

---

## Step 7: Verify the deployment

**API health check:**

```bash
curl https://nutbits.yourdomain.com/api/v1/status \
  -H "Authorization: Bearer $(cat ~/.nutbits/nutbits.sock.token)"
```

**Deeplink test — open in a browser:**

```
https://nutbits.yourdomain.com/connect?appname=TestApp&callback=
```

You should see the NUTbits connection page with the bridge animation.

**CLI access (on the VPS):**

```bash
cd ~/nutbits
npm link          # once
nutbits status
nutbits balance
nutbits connections
```

## Step 8: Connect your apps

With NUTbits live on a public domain, deeplink URLs become:

```
https://nutbits.yourdomain.com/connect?appname=MyApp&callback=myapp://nwc-connected
```

For manual NWC connections, create them on the VPS:

```bash
nutbits connect
```

Copy the NWC string and paste it into LNbits, Alby, or any NWC-compatible app.

## Updating

```bash
cd ~/nutbits
npm run nutbits:update
```

This pulls the latest code, installs dependencies, rebuilds the GUI, and restarts the service.

Or manually:

```bash
cd ~/nutbits
git pull
npm install
systemctl --user restart nutbits
```

## Security

### What NUTbits protects automatically

When deployed behind a reverse proxy, NUTbits:

- **Rate limits deeplink connections** — max 5 per minute per IP on `POST /connect`. Uses `X-Forwarded-For` / `X-Real-IP` headers from the proxy to identify the real client. Only trusts these headers when the connection comes from loopback (the proxy is on the same machine).
- **Blocks SSRF** — Lightning Address resolution validates that hostnames don't resolve to private IPs (10.x, 172.16-31.x, 192.168.x, 127.x, 169.254.x). Prevents attackers from using lud16 to probe internal networks.
- **Restricts deeplink permissions** — unknown apps connecting via deeplink get only `get_balance` + `get_info`. Full permissions require being registered in the deeplink app registry (`api/deeplink-apps.js`).
- **Validates deeplink callbacks** — HTTP(S) callbacks are blocked for unregistered apps. Only registered app URI schemes or non-HTTP app deep links are allowed as redirect targets.
- **Hides NWC secrets** — the regular connections list endpoint never returns NWC strings. They're only available via the explicit `/export` endpoint (authenticated).
- **Dedicated by default** — all connections start with their own isolated balance (0 sats). External apps can never access the main wallet.

### Reverse proxy headers

Both Caddy and nginx configs in this guide already send the correct headers (`X-Forwarded-For`, `X-Real-IP`). NUTbits reads them automatically. No extra configuration needed.

**Do NOT expose port 3338 directly to the internet.** Always use a reverse proxy with HTTPS. The API port should only be reachable from localhost.

### Checklist

- [ ] Domain has HTTPS (Caddy auto, or certbot for nginx)
- [ ] `NUTBITS_STATE_PASSPHRASE` is strong (16+ characters)
- [ ] Seed is backed up (`NUTBITS_SEED` from `.env`)
- [ ] `.env` file permissions are restricted: `chmod 600 .env`
- [ ] Firewall allows only ports 80, 443, and SSH: `sudo ufw allow 80,443,22/tcp && sudo ufw enable`
- [ ] API port (3338) is NOT exposed to the internet — only the reverse proxy reaches it
- [ ] SSH uses key-based auth (disable password login)
- [ ] State database permissions restricted: `chmod 600 nutbits_state.db` (or `.enc`)

## GUI (optional)

If you want the web GUI alongside the API:

```bash
cd ~/nutbits
npm run gui
```

The GUI builds and serves on port 8080. To expose it, add another reverse proxy block:

**Caddy:**
```
gui.yourdomain.com {
    reverse_proxy 127.0.0.1:8080
}
```

**nginx:** same pattern as above, change `proxy_pass` to `127.0.0.1:8080`.

The GUI is optional. All functionality (connections, fund, withdraw, pay, receive) is available via CLI and deeplinks without it.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `EADDRINUSE` on port 3338 | Another process uses the port. Check: `lsof -i :3338` |
| Caddy won't start | Check domain DNS points to this IP: `dig nutbits.yourdomain.com` |
| certbot fails | DNS not propagated yet. Wait a few minutes and retry. |
| `Cannot connect to NUTbits` in CLI | Service not running. Check: `systemctl --user status nutbits` |
| Deeplink page shows error | Check the API is reachable: `curl http://127.0.0.1:3338/connect?appname=Test` |
| Relay connection failed | Check relay URL in `.env`. Some relays block VPS IPs. Try `wss://relay.getalby.com/v1`. |
