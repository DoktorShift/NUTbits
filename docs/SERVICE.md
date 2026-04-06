<img src="../assets/headers/doc-state.svg" alt="Service Setup" width="100%">

# Service Setup

This page covers the simplest 24/7 backend service options for NUTbits:

- `launchd` on macOS
- `systemd --user` on Linux

On Linux, the service installer now creates two user services:
- `nutbits-backend.service`
- `nutbits-gui.service`

On macOS, the packaged service install is still backend-only. If you want the browser GUI there, run it separately with:

```bash
npm run gui
```

Or use the local NUTbits scripts when you do not need your operating system to manage the service:

```bash
npm run nutbits
npm run nutbits:stop
```

## Before You Start

Run these commands from the repository root:

```bash
npm install
cp .env.example .env
```

Then edit `.env` and set at least:

```bash
NUTBITS_MINT_URL=https://your-mint.example.com
NUTBITS_STATE_PASSPHRASE=your-strong-passphrase
```

## macOS: launchd

Install and start the backend service:

```bash
npm run service:mac
```

Useful commands:

```bash
launchctl print gui/$(id -u)/dev.doktorshift.nutbits
tail -f logs/nutbits.launchd.out.log
tail -f logs/nutbits.launchd.err.log
```

Remove the service:

```bash
npm run service:mac:remove
```

What it does:

- writes a LaunchAgent plist into `~/Library/LaunchAgents/`
- runs `node /absolute/path/to/nutbits.js`
- starts on login
- restarts automatically if the backend exits

## Linux: systemd

Install and start the backend and GUI services:

```bash
npm run service:linux
```

Useful commands:

```bash
systemctl --user status nutbits-backend
systemctl --user status nutbits-gui
journalctl --user -u nutbits-backend -f
journalctl --user -u nutbits-gui -f
```

Remove the service:

```bash
npm run service:linux:remove
```

What it does:

- writes user units to `~/.config/systemd/user/nutbits-backend.service` and `~/.config/systemd/user/nutbits-gui.service`
- builds the GUI before enabling the services
- enables and starts both immediately
- restarts both automatically on failure

To keep user services running after logout on Linux, you may also need:

```bash
loginctl enable-linger "$USER"
```

That is a Linux setting on your machine, not something specific to NUTbits.

## Which Option Should You Use?

- Use `launchd` on macOS for the simplest native 24/7 setup.
- Use `systemd --user` on Linux for the simplest native 24/7 setup with both API and GUI.
- Use `npm run nutbits` only when you want a simple local background mode, not a real OS-managed service.

## Day-to-Day

Once the backend service is installed, you can still use:

```bash
nutbits
nutbits status
nutbits balance
```

The CLI and TUI connect to the same local API as before.
