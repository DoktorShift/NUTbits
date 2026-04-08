<img src="../assets/headers/doc-state.svg" alt="Service Setup" width="100%">

# Service Setup

By default, NUTbits runs in your terminal — close the window and the bridge stops. A **service** registers NUTbits with your operating system's process manager so it starts on boot, restarts on crashes, and keeps running after you log out. If you plan to run NUTbits 24/7 (especially on a VPS), this is what you want.

NUTbits ships one-command installers for both platforms:

| Platform | Manager | Command | What it creates |
|----------|---------|---------|-----------------|
| macOS | `launchd` | `npm run service:mac` | Backend + GUI services |
| Linux | `systemd --user` | `npm run service:linux` | Backend + GUI services |

If you **don't** need your OS to manage the process — for example, during development or quick testing — use `npm run nutbits` instead (see [INSTALL.md](INSTALL.md)).

## Prerequisites

You should have already completed the basic install from [INSTALL.md](INSTALL.md). At minimum:

```bash
npm install
npm run setup            # or: cp .env.example .env && edit manually
```

## macOS: launchd

Install and start both services:

```bash
npm run service:mac
```

This installs deps, builds the GUI, and creates two LaunchAgent services.

### Manage

```bash
launchctl print gui/$(id -u)/dev.doktorshift.nutbits       # backend status
launchctl print gui/$(id -u)/dev.doktorshift.nutbits-gui   # GUI status
tail -f logs/nutbits.launchd.out.log                       # backend log
tail -f logs/nutbits-gui.launchd.out.log                   # GUI log
```

### Remove

```bash
npm run service:mac:remove
```

### What it does

- Installs backend dependencies if needed
- Installs GUI dependencies if needed
- Builds the GUI
- Writes two LaunchAgent plists into `~/Library/LaunchAgents/`
- Starts both on login
- Restarts automatically if either exits

## Linux: systemd

Install and start both services:

```bash
npm run service:linux
loginctl enable-linger "$USER"   # keep services running after logout
```

> `loginctl enable-linger` is a Linux setting, not NUTbits-specific. Without it, your user services stop when you log out.

### Manage

```bash
systemctl --user status  nutbits-backend nutbits-gui          # status
systemctl --user restart nutbits-backend nutbits-gui          # restart
systemctl --user stop    nutbits-backend nutbits-gui          # stop
journalctl --user -u nutbits-backend -f                      # backend logs
journalctl --user -u nutbits-gui -f                          # GUI logs
```

### Auto-start on boot

Already enabled by `npm run service:linux`. To toggle:

```bash
systemctl --user disable nutbits-backend nutbits-gui              # off
systemctl --user enable --now nutbits-backend nutbits-gui          # on
```

### Remove

```bash
npm run service:linux:remove
systemctl --user daemon-reload
```

### What it does

- Writes user units to `~/.config/systemd/user/nutbits-backend.service` and `~/.config/systemd/user/nutbits-gui.service`
- Builds the GUI before enabling the services
- Enables and starts both immediately
- Restarts both automatically on failure

## Day-to-Day

Once the service is running, you can still manage NUTbits from the terminal. The CLI and TUI connect to the same local API — the service just keeps everything alive.

```bash
nutbits                # interactive TUI dashboard
nutbits status         # quick health check
nutbits balance        # check balance
```

> Requires `npm link` — see [INSTALL.md](INSTALL.md#management-console). Or use `npm run cli` / `node bin/nutbits.js` instead.

---

## Related

- [INSTALL.md](INSTALL.md) — local setup (bare metal, Docker)
- [DEPLOY.md](DEPLOY.md) — VPS deployment with HTTPS (Caddy)
- [LAZYDEPLOY.md](LAZYDEPLOY.md) — quick deploy with setup wizard
- [CLI.md](CLI.md) — full CLI command reference
- [CONSOLE.md](CONSOLE.md) — day-to-day workflows and TUI usage
