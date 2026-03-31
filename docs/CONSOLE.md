<p align="center">
  <img src="../assets/headers/doc-console.svg" alt="Using the Console" width="100%">
</p>

## Three Ways to Interact

NUTbits gives you three ways to use it. Same data, different style:

| | TUI (dashboard) | CLI (commands) | GUI (browser) |
|---|---|---|---|
| **Launch** | `nutbits` | `nutbits <command>` | `http://127.0.0.1:8080` |
| **What it is** | Full-screen interactive dashboard | Single command, one result | Browser dashboard and forms |
| **Best for** | Watching and browsing | Doing things fast or scripting | Managing from a browser |
| **Stays open** | Yes, auto-refreshes every 5s | No, runs and exits | Yes |

**The simple rule:** `nutbits` with no arguments opens the dashboard. `nutbits <command>` performs one action. The GUI gives you the same backend through a browser.

## Your First Time

### 1. Start the service

```bash
npm start
```

This runs NUTbits in your terminal. Keep this terminal open.

If you also want the GUI served locally, use:

```bash
npm run nutbits:interactive
```

If you want the simplest background stack instead, use:

```bash
npm run nutbits
```

### 2. Open the dashboard

In a **second terminal**:

```bash
nutbits
```

The splash screen appears for a few seconds while it connects to your running instance. Then the dashboard opens with a menu on the left and live data on the right.

### 3. Browse around

- **Arrow keys** move through the menu
- **Page Up/Down** scrolls long content
- **?** opens a help overlay with all keyboard shortcuts
- **q** or **Escape** exits the dashboard

That's it. You're monitoring your NUTbits instance.

## Typical Workflow

### Monitoring (TUI stays open)

```
Terminal 1:  npm start           <- service running
Terminal 2:  nutbits             <- dashboard open, watching
```

The dashboard auto-refreshes. When a payment comes in via NWC, you'll see the balance update and the transaction appear in history, without doing anything.

### Taking action (CLI in the same or another terminal)

```bash
nutbits pay lnbc12000n1pj...     # pay an invoice
nutbits receive 5000              # create an invoice for 5000 sats
nutbits connect                   # create a new NWC connection
nutbits connect --lud16 user@example.com  # with Lightning Address
nutbits revoke 2                  # revoke connection #2
```

If you had the TUI open in another terminal, it picks up the change on the next refresh (within 5 seconds).

### Quick check (CLI one-liners)

Don't need the full dashboard? Just ask:

```bash
nutbits balance                   # how much do I have?
nutbits connections               # what's connected?
nutbits history                   # what happened recently?
nutbits fees                      # how much have I earned?
nutbits mints                     # which mints are healthy?
nutbits relays                    # which relays are connected?
nutbits logs                      # recent log output
nutbits config                    # current runtime configuration
nutbits export                    # download full history as CSV/JSON
```

Each prints the answer and returns to your prompt.

## Combining TUI, CLI, and GUI

You can have all three open at the same time:

```
Terminal 1:  npm start            <- service
Terminal 2:  nutbits              <- TUI dashboard (monitoring)
Terminal 3:  nutbits pay ...      <- CLI command (acting)
Browser:     127.0.0.1:8080       <- GUI (overview/config)
```

Or use one terminal and switch between them:

1. Open `nutbits` - browse the dashboard
2. Press `q` to quit the TUI
3. Run `nutbits pay lnbc...` - execute a payment
4. Run `nutbits` again - see the updated state

All approaches work. The TUI, CLI, and GUI talk to the same local API, so they always see the same data.

## Actions Inside the TUI

When you navigate to an action item (Pay, Receive, Connect, Revoke, Export History, Backup, Restore, Config) and press **Enter**, the TUI temporarily steps aside and runs the command interactively with the same prompts and flow as the CLI. When the command finishes, press Enter to return to the dashboard.

```
Dashboard -> navigate to "Pay" -> press Enter -> interactive pay flow -> "Press Enter to return" -> Dashboard
```

You never need to leave the TUI to do things. The dashboard shows you the current state, you navigate to what you want, press Enter, do it, come back.

For data panels (Balance, History, Connections, etc.), Enter refreshes the data.

## Scripting

Every CLI command supports `--json` for machine-readable output:

```bash
nutbits balance --json | jq '.total_sats'
nutbits connections --json | jq '.connections[].label'
nutbits history --json --limit 5
```

Use this in scripts, cron jobs, or monitoring dashboards. The `--json` flag skips all formatting and returns raw API data.

## Docker

If you're running NUTbits in Docker, exec into the container:

```bash
docker compose exec nutbits nutbits              # TUI
docker compose exec nutbits nutbits balance       # CLI
```

Add an alias for convenience:

```bash
alias nutbits="docker compose exec nutbits nutbits"
```

Then use it normally from your host.

## GUI

The web GUI is useful when you want a browser-based operator view instead of a terminal. It is especially handy for connection management, settings changes, exports, and general dashboard use.

For local development or self-hosting outside Docker, the stack scripts serve it for you:

```bash
npm run nutbits
```

Default local URLs:

- GUI: `http://127.0.0.1:8080`
- API: `http://127.0.0.1:3338`

Useful local commands:

- `npm run nutbits` starts backend + GUI in background mode
- `npm run nutbits:interactive` starts the GUI but keeps the backend in your current terminal
- `npm run nutbits:stop` stops both

Run these from the repository root, not from inside the `scripts/` directory.

### GUI Pages

| Page | What you can do |
|------|----------------|
| **Dashboard** | Live overview of balance, connections, relay status, uptime, mint health, and recent transactions split by NWC and Mint channels. Most elements are clickable and link to their detail pages. |
| **Connections** | Create, view, and revoke NWC connections. Switch between card view (detailed) and list view (compact table). Show NWC string with QR code. Edit Lightning Addresses. Filter by mint. Export connection data. |
| **History** | Transaction history with interactive volume chart (7D/30D). Filter by type (in/out), connection, and limit. Click any row for full details. Export as CSV or JSON. |
| **Pay** | Pay a Lightning invoice or resolve a Lightning Address / LNURL from the browser. |
| **Receive** | Create a Lightning invoice with a scannable QR code. |
| **Mints** | Active mint details with NUT capability matrix. Add/remove/reorder mints for multi-mint failover. Switch active mint live. |
| **Relays** | View Nostr relay connection status. Add or remove relays from your configuration. |
| **NUTs** | Detailed NUT protocol support breakdown for each configured mint. |
| **Fees** | Service fee earnings dashboard with 7-day bar chart, per-connection breakdown, and current fee policy. |
| **Settings** | All NUTbits configuration organized in tabs: Wallet, Network, Limits, Fees, API, Advanced. Includes backup/restore and GUI connection settings. |
| **Logs** | Live log viewer with level filtering (error/warn/info/debug), text search, auto-refresh, and expandable JSON payloads. |

For true 24/7 backend operation, prefer the OS service setup in **[SERVICE.md](SERVICE.md)** over the convenience stack scripts.

## Related

- [CLI.md](CLI.md) - full command reference, flags, environment variables
- [INSTALL.md](INSTALL.md) - getting NUTbits up and running
- [SERVICE.md](SERVICE.md) - 24/7 backend service setup with launchd and systemd
- [HOW-IT-WORKS.md](HOW-IT-WORKS.md) - what NUTbits does and why
