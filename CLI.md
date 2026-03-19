<p align="center">
  <img src="assets/headers/doc-cli.svg" alt="NUTbits Management Console" width="100%">
</p>

## What Is This?

NUTbits runs as a background service — it manages your ecash and handles NWC commands automatically. The management console gives you a window into what's happening and lets you control it.

Two ways to use it:

- **`nutbits`** — launch the interactive TUI (split-screen, navigable menu)
- **`nutbits <command>`** — run a single command and get the result

Both talk to the same local API. Same data, your choice of interface.

<p align="center">
  <img src="assets/inline_explaining/inline_cli-overview.svg" alt="Architecture: Service → API → TUI / CLI" width="100%">
</p>

## Setup

### 1. Make the command available

After cloning and installing NUTbits, you have three options:

```bash
# Option A: link globally (recommended — works from anywhere)
npm link

# Option B: use the npm script
npm run cli

# Option C: run directly
node bin/nutbits.js
```

With `npm link`, the `nutbits` command is available system-wide. With options B and C, you need to be in the NUTbits directory.

### 2. Start the service

The CLI talks to a running NUTbits instance. Start the service first:

```bash
npm start
```

The service automatically starts the management API on a local Unix socket (`~/.nutbits/nutbits.sock`). An auth token is generated and saved next to the socket. The CLI reads this token automatically — no extra configuration needed.

### 3. Open the console

In a second terminal:

```bash
nutbits
```

That's it. You'll see the interactive dashboard with a menu on the left and live data on the right. Navigate with arrow keys, press Enter to select.

For single commands:

```bash
nutbits balance
nutbits history
nutbits connections
```

### If it doesn't connect

- **"Cannot connect to NUTbits"** — the service isn't running. Start it with `npm start`.
- **"No API token found"** — the service is running but the API might be disabled. Check that `NUTBITS_API_ENABLED` is not set to `false` in your `.env`.
- **Custom socket path** — if you changed `NUTBITS_API_SOCKET` in `.env`, pass it to the CLI: `nutbits --socket /your/path/nutbits.sock`

## Commands

### See what's happening

| Command | What it does |
|---------|-------------|
| `nutbits` | Interactive TUI dashboard |
| `nutbits status` | Quick status overview |
| `nutbits balance` | Per-mint balance breakdown |
| `nutbits history` | Recent transactions |
| `nutbits connections` | List NWC connections |
| `nutbits fees` | Service fee revenue |
| `nutbits mints` | Mint info and health |
| `nutbits nuts` | NUT support matrix |
| `nutbits relays` | Relay connection status |
| `nutbits logs` | Stream service logs |
| `nutbits watch` | Live-updating dashboard |

### Do things

| Command | What it does |
|---------|-------------|
| `nutbits pay` | Pay a Lightning invoice |
| `nutbits receive` | Create an invoice and wait for payment |
| `nutbits connect` | Create a new NWC connection |
| `nutbits revoke` | Disconnect an NWC connection |
| `nutbits config` | View or change settings |
| `nutbits backup` | Export encrypted backup |
| `nutbits verify` | Check a backup file |
| `nutbits restore` | Recover proofs from seed |

## Connections — The Powerful Part

One NUTbits instance, many NWC connections. Each with its own permissions and spending limits.

<p align="center">
  <img src="assets/inline_explaining/inline_cli-connections.svg" alt="Multiple connections with scoped permissions" width="100%">
</p>

### Create a connection

Just run `nutbits connect` — the guided menu walks you through it:

1. Give it a name
2. Choose permissions (pay, receive, balance, history, info)
3. Set a daily spending limit (optional)
4. Set a per-payment limit (optional)
5. Pick a mint (if you have multiple)
6. Confirm — get your NWC string

For scripting:

```bash
nutbits connect --label "lnbits-main" --permissions pay,receive,balance
nutbits connect --label "pos" --permissions pay,balance --max-daily 5000 --max-payment 1000
nutbits connect --label "donations" --permissions receive,balance
nutbits connect --label "public-api" --permissions pay,receive,balance --fee-ppm 15000
```

### Revoke a connection

```bash
nutbits revoke        # interactive — pick from a list
nutbits revoke 2      # revoke connection #2 directly
```

Revocation is immediate. The NWC string stops working. Transaction history is kept.

### Permission names

| Short name | NWC method | What it allows |
|------------|-----------|----------------|
| `pay` | `pay_invoice` | Send sats over Lightning |
| `receive` | `make_invoice` | Create invoices to receive sats |
| `balance` | `get_balance` | Read the current balance |
| `history` | `list_transactions` | View past transactions |
| `info` | `get_info` | Read wallet metadata |

Use `all` to grant everything.

## Payments

### Pay an invoice

```bash
nutbits pay lnbc12000n1pj...     # pay directly
nutbits pay                       # interactive — paste the invoice
```

### Receive sats

```bash
nutbits receive 5000              # create a 5000 sat invoice
nutbits receive                   # interactive — enter amount
```

By default, `receive` waits for the payment to arrive. Use `--no-wait` to just print the invoice and exit.

## Configuration

View the running config:

```bash
nutbits config
```

Change settings on the fly (no restart needed):

```bash
nutbits config set max-payment 1000
nutbits config set daily-limit 50000
nutbits config set log-level debug
nutbits config set fee-reserve 2
```

These take effect immediately. Mint URLs, relays, and storage require a restart.

## Backup & Recovery

```bash
nutbits backup                    # export encrypted state to file
nutbits verify ./backup.enc       # check a backup file
nutbits restore                   # recover proofs from seed (NUT-09)
```

Backups are encrypted with your state passphrase. The seed recovers your ecash proofs deterministically — as long as the mint supports NUT-09.

## Scripting with --json

Every command supports `--json` for machine-readable output:

```bash
nutbits balance --json
nutbits connections --json
nutbits history --json --limit 5 --type incoming
```

Useful for monitoring, automation, or piping into other tools:

```bash
# Check balance in a script
BALANCE=$(nutbits balance --json | jq '.total_sats')

# List connection labels
nutbits connections --json | jq '.connections[].label'
```

## Service Fees

NUTbits can optionally take a cut on outgoing payments. Disabled by default — zero fees unless you turn it on.

**Receiving is always free.** Only outgoing payments (pay_invoice) can have a fee.

### Enable fees

```env
NUTBITS_SERVICE_FEE_PPM=10000     # 1% (10,000 parts per million)
NUTBITS_SERVICE_FEE_BASE=1        # +1 sat flat fee per payment
```

Or hot-reload without restart:

```bash
nutbits config set service_fee_ppm 10000
nutbits config set service_fee_base 1
```

### How it works

A 1,000 sat payment with 1% + 1 sat fee:
- Invoice amount: 1,000 sats
- Service fee: 11 sats (10 ppm + 1 base)
- Total deducted: 1,011 sats
- 1,000 goes to the invoice, 11 stays as ecash in your balance

### Per-connection fees

Different connections can have different fee rates:

```bash
nutbits connect --label "public-api" --fee-ppm 15000       # 1.5%
nutbits connect --label "friend" --fee-ppm 0               # no fee
```

If not set per-connection, the global rate applies.

### Track revenue

```bash
nutbits fees              # see today's and total earned
nutbits fees --json       # machine-readable for dashboards
```

## Security

The management API communicates over a local Unix socket at `~/.nutbits/nutbits.sock`. It never touches the network.

- **Authentication** — every request requires a bearer token (auto-generated, stored at `~/.nutbits/nutbits.sock.token`)
- **Permissions** — socket file is mode 0600, directory is mode 0700
- **Kill switch** — set `NUTBITS_API_ENABLED=false` in your `.env` to disable the entire management API

On shared servers, the API is only accessible to the user running NUTbits. No other user can read the socket or token file.

### Disabling the CLI

If you don't need the management console at all — maybe you're running NUTbits headless in production and want zero attack surface beyond NWC:

```env
NUTBITS_API_ENABLED=false
```

The service runs normally. The socket is never created. No token file, no API, no CLI access.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NUTBITS_API_ENABLED` | `true` | Set to `false` to disable the management API entirely |
| `NUTBITS_API_SOCKET` | `~/.nutbits/nutbits.sock` | Unix socket path |
| `NUTBITS_API_PORT` | _(disabled)_ | Optional HTTP port on 127.0.0.1 |
| `NUTBITS_API_TOKEN` | _(auto-generated)_ | Bearer token for authentication |
| `NUTBITS_SERVICE_FEE_PPM` | `0` | Service fee in parts per million (outgoing only) |
| `NUTBITS_SERVICE_FEE_BASE` | `0` | Flat base fee in sats per outgoing payment |

## Global Flags

```
--socket <path>   Custom Unix socket path
--http <url>      Connect via HTTP instead of socket
--json            Raw JSON output (for scripting)
--no-color        Disable terminal colors
--help            Show help
--version         Show version
```
