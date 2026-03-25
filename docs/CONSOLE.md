<p align="center">
  <img src="../assets/headers/doc-console.svg" alt="Using the Console" width="100%">
</p>

## Two Ways to Interact

NUTbits gives you two tools. Same data, different experience:

| | TUI (dashboard) | CLI (commands) |
|---|---|---|
| **Launch** | `nutbits` | `nutbits <command>` |
| **What it is** | Full-screen interactive dashboard | Single command, one result |
| **Best for** | Monitoring, browsing, exploring | Doing things - pay, receive, connect |
| **Stays open** | Yes, auto-refreshes every 5s | No, runs and exits |

**The simple rule:** no arguments = visual dashboard. With arguments = do something specific.

## Your First Time

### 1. Start the service

```bash
npm start
```

This runs NUTbits in the foreground. Keep this terminal open.

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
Terminal 1:  npm start           ← service running
Terminal 2:  nutbits             ← dashboard open, watching
```

The dashboard auto-refreshes. When a payment comes in via NWC, you'll see the balance update and the transaction appear in history, without doing anything.

### Taking action (CLI in the same or another terminal)

```bash
nutbits pay lnbc12000n1pj...     # pay an invoice
nutbits receive 5000              # create an invoice for 5000 sats
nutbits connect                   # create a new NWC connection
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
nutbits export                    # download full history as CSV/JSON
```

Each prints the answer and returns to your prompt.

## Combining TUI and CLI

You can have both open at the same time:

```
Terminal 1:  npm start            ← service
Terminal 2:  nutbits              ← TUI dashboard (monitoring)
Terminal 3:  nutbits pay ...      ← CLI command (acting)
```

Or use one terminal and switch between them:

1. Open `nutbits` - browse the dashboard
2. Press `q` to quit the TUI
3. Run `nutbits pay lnbc...` - execute a payment
4. Run `nutbits` again - see the updated state

Both approaches work. The TUI and CLI talk to the same local API, so they always see the same data.

## Actions Inside the TUI

When you navigate to an action item (Pay, Receive, Connect, Revoke, Export History, Backup, Restore, Config) and press **Enter**, the TUI temporarily steps aside and runs the command interactively with the same prompts and flow as the CLI. When the command finishes, press Enter to return to the dashboard.

```
Dashboard → navigate to "Pay" → press Enter → interactive pay flow → "Press Enter to return" → Dashboard
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

## Related

- [CLI.md](CLI.md) - full command reference, flags, environment variables
- [INSTALL.md](INSTALL.md) - getting NUTbits up and running
- [HOW-IT-WORKS.md](HOW-IT-WORKS.md) - what NUTbits does and why
