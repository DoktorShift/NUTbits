<img src="../assets/headers/doc-lazydeploy.svg" alt="Lazy Deploy" width="100%">

# Lazy Deploy

> The fast path. One wizard, a few answers, done.
>
> For the full step-by-step with explanations, see **[DEPLOY.md](DEPLOY.md)** (VPS) or **[INSTALL.md](INSTALL.md)** (local).

## Local

```bash
git clone https://github.com/DoktorShift/nutbits.git && cd nutbits
npm install
npm run setup
npm start
```

The wizard asks for your mint URL and passphrase, writes `.env`, and installs the SQLite driver if needed. Done.

## VPS

```bash
# 1. Prepare
sudo apt update && sudo apt install -y curl git build-essential
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt install -y nodejs

# 2. Install
git clone https://github.com/DoktorShift/nutbits.git ~/nutbits
cd ~/nutbits
npm install
npm --prefix gui install

# 3. Setup wizard (creates .env + optional Caddyfile)
npm run setup

# 4. Start services
npm run service:linux
loginctl enable-linger "$USER"
```

When the wizard asks **Deploy Mode**, choose `2) VPS`. It will:
- Ask for your mint URL (adds `https://` if you forget it)
- Ask for an encryption passphrase (with confirmation)
- Suggest good NWC relays — confirm or enter your own (adds `wss://` if you forget it)
- Choose storage backend (SQLite recommended, driver installed automatically)
- Generate a random API token for the browser GUI
- Show a **summary** of everything before writing — confirm or redo
- Write a complete `.env` (permissions 600, old one backed up)
- Optionally generate a Caddyfile for your domain

### Caddy (if generated)

```bash
sudo apt install -y caddy
sudo cp Caddyfile /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl enable caddy
sudo systemctl reload caddy
```

### Verify

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" http://127.0.0.1:3338/api/v1/status
```

Open `https://your-domain.com` in a browser and enter the API token to log in.

## Re-run the wizard

You can run `npm run setup` again at any time. It will ask before overwriting an existing `.env`.

## What's different from DEPLOY.md?

Nothing changes about how NUTbits works. The wizard just writes the same `.env` file you would write by hand. If you prefer full control, use **[DEPLOY.md](DEPLOY.md)** instead.
