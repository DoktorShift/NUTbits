<img src="../assets/headers/doc-install.svg" alt="Installation Guide" width="100%">

# Installation

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

Edit `.env` with your settings:

```bash
# Required
NUTBITS_MINT_URL=https://your-mint.example.com
NUTBITS_STATE_PASSPHRASE=your-strong-passphrase-here

# Optional: use SQLite for concurrent access (recommended for LNbits)
# NUTBITS_STATE_BACKEND=sqlite

# Optional: charge a service fee on outgoing payments (disabled by default)
# NUTBITS_SERVICE_FEE_PPM=10000    # 1% (parts per million)
# NUTBITS_SERVICE_FEE_BASE=1       # +1 sat per payment
```

> Need SQLite or MySQL? Install the driver: `npm install better-sqlite3` or `npm install mysql2`

### Start

```bash
npm start
```

This keeps NUTbits attached to your terminal and shows the normal startup and log view.

On first run, NUTbits prints your NWC connection string:

```
=== YOUR NWC CONNECTION STRING (copy this, it won't be shown again) ===
nostr+walletconnect://abc123...?relay=wss://nostrue.com&secret=xyz789...
======================================================================
```

Copy this string. You'll need it to connect LNbits or any NWC client.

### Stack Scripts

NUTbits also ships with operational scripts in `scripts/`:

Run these from the repository root.

#### Most common

```bash
npm start                         # backend only, in your terminal
npm run nutbits                  # backend + GUI, in the background
npm run service:mac              # macOS 24/7 backend service
npm run service:linux            # Linux 24/7 backend service
```

Use one of those depending on how you want to run NUTbits.

```bash
npm run nutbits                  # backend + GUI in the background
npm run nutbits:interactive      # GUI in background, backend in your terminal
npm run nutbits:stop             # stop backend + GUI
npm run nutbits:restart          # restart background NUTbits mode
npm run nutbits:update           # git pull, install deps, rebuild GUI, restart
```

Use `nutbits` when you want NUTbits and the GUI running in the background. Use `nutbits:interactive` when you want the GUI too, but still want to watch the backend in your terminal.

If you want the backend to survive logout, reboot, and crashes, use an OS service manager instead:

- macOS: `launchd`
- Linux: `systemd --user`

See **[SERVICE.md](SERVICE.md)** for the simple 24/7 setup.

### Management Console (optional)

Make the `nutbits` command available:

```bash
npm link
```

Then open a second terminal (while the service is running):

```bash
nutbits              # interactive TUI dashboard
nutbits balance      # check balance
nutbits connections  # list NWC connections
```

No extra configuration needed. The CLI finds the running service and authenticates automatically.

> Don't want to `npm link`? Use `npm run cli` or `node bin/nutbits.js` instead.

See **[CLI.md](CLI.md)** for the full setup and command reference.

### Web GUI (optional)

The repository also includes a browser GUI in `gui/`.

If you used the scripts above, it is served automatically on:

```bash
http://127.0.0.1:8080
```

By default the GUI talks to the local backend on `http://127.0.0.1:3338` and can bootstrap the API token automatically for local use.

## Docker

```bash
git clone https://github.com/DoktorShift/nutbits.git
cd nutbits
cp .env.example .env
# Edit .env
docker compose up -d
```

View logs:

```bash
docker compose logs -f
```

The NWC connection string appears in the logs on first run.

### Using the CLI with Docker

The CLI is inside the container. Just exec into it:

```bash
docker compose exec nutbits nutbits              # interactive TUI
docker compose exec nutbits nutbits balance       # single command
docker compose exec nutbits nutbits connections    # list connections
docker compose exec nutbits nutbits connect        # create new connection
```

For quick access, add an alias to your shell:

```bash
alias nutbits="docker compose exec nutbits nutbits"
```

Then use it like normal:

```bash
nutbits balance
nutbits fees
nutbits history
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

Or, if you use the stack scripts:

```bash
npm run nutbits:update
```

Your state file is preserved across upgrades. If upgrading to a new storage backend, see [DATABASE.md](DATABASE.md) for migration instructions.
