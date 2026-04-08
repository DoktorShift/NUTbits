<img src="../assets/headers/doc-install.svg" alt="Installation Guide" width="100%">

# Installation (Local)

> Deploying to a **VPS with HTTPS**? See **[DEPLOY.md](DEPLOY.md)** or the quick **[LAZYDEPLOY.md](LAZYDEPLOY.md)**.

**[Requirements](#requirements) · [Bare Metal](#bare-metal) · [Docker](#docker) · [LNbits](#connect-to-lnbits) · [Funding](#funding-your-wallet) · [Upgrading](#upgrading)**

Get NUTbits running on your local machine — bare metal or Docker. Covers installation, first connection to LNbits, and funding your wallet.

## Requirements

- **Node.js** >= 18
- A **Cashu mint** ([find one](https://bitcoinmints.com) or run your own)
- A **Nostr relay** (public or self-hosted)

## Bare Metal

```bash
git clone https://github.com/DoktorShift/nutbits.git
cd nutbits
npm install
```

### Configure

```bash
cp .env.example .env
```

Edit `.env` — only two values are required:

```bash
NUTBITS_MINT_URL=https://your-mint.example.com
NUTBITS_STATE_PASSPHRASE=your-strong-passphrase-here
```

> Need SQLite or MySQL? Install the driver: `npm install better-sqlite3` or `npm install mysql2`

### Start

```bash
npm start
```

On first run, NUTbits prints your NWC connection string:

```
=== YOUR NWC CONNECTION STRING (copy this, it won't be shown again) ===
nostr+walletconnect://abc123...?relay=wss://nostrue.com&secret=xyz789...
======================================================================
```

Copy this string. You'll need it to connect LNbits or any NWC client.

### Running Modes

Pick one depending on how you want to run it:

```bash
npm start                        # backend only, attached to terminal
npm run nutbits                  # backend + GUI, background
npm run nutbits:interactive      # GUI background, backend in terminal
npm run nutbits:stop             # stop background processes
npm run nutbits:restart          # restart background processes
npm run nutbits:update           # pull, install, rebuild, restart
```

### 24/7 Service

To survive logout, reboot, and crashes, use an OS service manager:

```bash
npm run service:mac              # macOS (launchd)
npm run service:linux            # Linux (systemd)
```

See **[SERVICE.md](SERVICE.md)** for details and management commands.

### Management Console

Make the `nutbits` command available:

```bash
npm link
```

Then in a second terminal:

```bash
nutbits              # interactive TUI dashboard
nutbits balance      # check balance
nutbits connections  # list NWC connections
```

> Don't want to `npm link`? Use `npm run cli` or `node bin/nutbits.js` instead.

See **[CLI.md](CLI.md)** for the full command reference.

### Web GUI

If you used `npm run nutbits` or the service scripts, the GUI is served automatically at:

```
http://127.0.0.1:8080
```

The GUI talks to the local backend and bootstraps the API token automatically for local use.

## Docker

```bash
git clone https://github.com/DoktorShift/nutbits.git
cd nutbits
cp .env.example .env
# Edit .env — set NUTBITS_MINT_URL and NUTBITS_STATE_PASSPHRASE
docker compose up -d
```

This builds the image (backend + GUI), starts both services, and exposes:
- API on `127.0.0.1:3338`
- GUI on `127.0.0.1:8080`

The seed is auto-generated on first run and saved back to your `.env` file.

View logs:

```bash
docker compose logs -f
```

The NWC connection string appears in the logs on first run.

### CLI with Docker

```bash
docker compose exec nutbits nutbits              # interactive TUI
docker compose exec nutbits nutbits balance       # single command
docker compose exec nutbits nutbits connections    # list connections
```

Quick alias:

```bash
alias nutbits="docker compose exec nutbits nutbits"
```

## Connect to LNbits

1. Start NUTbits and copy your NWC connection string
2. In LNbits, go to **Manage Server** > **Funding Sources**
3. Select **NWCWallet** as the funding source
4. Paste the NWC connection string
5. Save and restart LNbits

<img src="../assets/Inline_Explaining/flow.svg" alt="LNbits → NWC → NUTbits → Mint → Lightning → Network" width="100%">

## Funding Your Wallet

NUTbits starts with a zero balance. To fund it:

1. From LNbits (or any NWC client), create an invoice using `make_invoice`
2. Pay the Lightning invoice from any Lightning wallet
3. NUTbits automatically mints ecash tokens when the invoice is paid
4. Your balance is now available for outgoing payments

## Verify It Works

Check the logs for:

```
[INFO] cashu wallet initialized {"mint":"https://...","name":"..."}
[INFO] NWC connection ready
```

From LNbits, check the balance; it should respond via NWC.

## Upgrading

```bash
cd nutbits
git pull
npm install
npm start
```

Or with the stack scripts:

```bash
npm run nutbits:update
```

Your state is preserved across upgrades. For storage backend migration, see [DATABASE.md](DATABASE.md).

---

## Related

- [DEPLOY.md](DEPLOY.md) — VPS deployment with HTTPS (Caddy)
- [SERVICE.md](SERVICE.md) — 24/7 backend service setup with launchd and systemd
- [CLI.md](CLI.md) — full CLI command reference
- [DATABASE.md](DATABASE.md) — storage backends (file, SQLite, MySQL)
- [BACKUP.md](BACKUP.md) — backup and recovery procedures
