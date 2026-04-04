# Relay Pooling — Scalability Discussion

> Status: Proposal. Not implemented yet.

## The Problem

Every NWC connection opens **its own WebSocket per relay**. The math:

```
connections × relays = WebSockets

 5 connections × 2 relays =   10 WebSockets
20 connections × 2 relays =   40 WebSockets
100 connections × 2 relays = 200 WebSockets
```

Each WebSocket also runs a reconnection loop (polling every 5s). At scale, this is a lot of open connections and background timers for a single NUTbits instance.

## How It Works Today

```
nutbits.js — createNWCconnection() → startRelayLoop(pubkey)

For EACH connection:
  1. Opens a new WebSocket to every configured relay
  2. Subscribes with filter: { kinds: [23194], #p: [this_connection_pubkey] }
  3. Starts a reconnection loop (runs forever, checks every 5s)
  4. Publishes a kind-13194 info event

pools = {
  pubkey_1: [Relay(wss://relay-a), Relay(wss://relay-b)],
  pubkey_2: [Relay(wss://relay-a), Relay(wss://relay-b)],  ← separate WebSockets!
  pubkey_3: [Relay(wss://relay-a), Relay(wss://relay-b)],  ← separate WebSockets!
}
```

Each relay subscription filters by `#p: [pubkey]` — the connection's specific pubkey. Since every connection has a unique pubkey, we can't share subscriptions. So every connection = new WebSockets.

## Why This Matters

For personal use (3-5 connections), it's fine. For NUTbits Cloud or any multi-tenant scenario, it becomes a problem:

- **Memory**: each WebSocket holds buffers, event handlers, timers
- **Reconnection storms**: if a relay drops, all connections try to reconnect simultaneously
- **Relay-side limits**: some relays cap connections per IP
- **File descriptors**: OS-level limits (typically 1024 soft limit on macOS/Linux)

## The Fix: Shared Relay Pool

Nostr relay filters support arrays in `#p`. One subscription can listen for multiple pubkeys:

```
// Instead of N subscriptions on N WebSockets:
{ kinds: [23194], #p: [pubkey_1] }  ← WebSocket 1
{ kinds: [23194], #p: [pubkey_2] }  ← WebSocket 2
{ kinds: [23194], #p: [pubkey_3] }  ← WebSocket 3

// One subscription on one WebSocket:
{ kinds: [23194], #p: [pubkey_1, pubkey_2, pubkey_3] }  ← WebSocket 1
```

### Architecture

```
BEFORE (current):
  pools[pubkey] = [Relay, Relay, ...]     per connection

AFTER (proposed):
  sharedPool = {
    relayA: { ws: WebSocket, subscription: Filter },
    relayB: { ws: WebSocket, subscription: Filter },
  }
  
  When a connection is added:
    → update the subscription filter to include the new pubkey
    → no new WebSocket needed
  
  When a connection is revoked:
    → update the subscription filter to remove the pubkey
    → WebSocket stays open for other connections
```

### Scaling comparison

| Connections | Relays | Current (WebSockets) | Shared Pool (WebSockets) |
|-------------|--------|---------------------|--------------------------|
| 5 | 2 | 10 | 2 |
| 20 | 2 | 40 | 2 |
| 100 | 2 | 200 | 2 |
| 100 | 3 | 300 | 3 |

Goes from **O(connections × relays)** to **O(relays)**.

## What About Notifications?

NUTbits already implements NIP-47 notifications:
- `payment_received` (kind 23197) — push when an incoming invoice settles
- `payment_sent` (kind 23197) — push when an outgoing payment completes

These are **wallet → app** (we push TO the app). They use the same relay connections.

Notifications don't reduce the relay load because:
- We are the **wallet side** — we MUST listen for incoming requests (kind 23194)
- The app sends requests addressed to our pubkey — we have to be subscribed
- Notifications ride on the same connections, going the other direction

However, notifications reduce **app-side polling**. If the app supports notifications, it doesn't need to repeatedly call `get_balance` or `lookup_invoice` to check for updates. This means fewer incoming NWC events for us to process — less CPU, not fewer WebSockets.

### What if apps DON'T support notifications?

Then they poll. A polling app might send `get_balance` every 10 seconds. With 50 connections doing that = 300 NWC events/minute. NUTbits handles this fine (it's just JSON parsing + a balance lookup), but it's wasteful.

We already advertise notification support in `get_info`:
```json
{ "notifications": ["payment_received", "payment_sent"] }
```

Apps that read this can subscribe to notifications instead of polling. We can't force it — it's up to the app developer.

## Implementation Notes

If we decide to build the shared pool:

### What changes

- `connectRelay()` → becomes `ensureRelayConnected(url)` — opens WebSocket only if not already open
- `startRelayLoop()` → becomes `addToPool(pubkey)` — adds pubkey to the shared subscription filter
- `pools[pubkey]` → replaced by `sharedPool[relayUrl]` with a `Set` of active pubkeys
- Revoke → calls `removeFromPool(pubkey)` — updates filter, keeps WebSocket alive
- Reconnection → one loop per relay, not per connection
- `broadcastToConnection()` → uses the shared pool, publishes on all relays

### What stays the same

- Event handling (same `handleEvent` function, dispatches by pubkey)
- Notification publishing (same `sendNotification`, uses shared pool)
- NWC protocol logic (unchanged)
- Connection creation API (unchanged)
- All CLI/GUI/TUI (unchanged — they don't know about relay internals)

### Risk

Some relays may have limits on how many pubkeys you can filter in one subscription. If a relay rejects a filter with 500 pubkeys, we'd need to split into chunks. Test with the relays we recommend (relay.getalby.com, etc.) to find practical limits.

### Nostr relay filter spec (NIP-01)

> "A filter with multiple values in a tag filter is interpreted as an OR — the event must match any of the values."

This confirms the approach works per spec. The `#p` array is OR-matched.

## Decision

Options:

1. **Do nothing** — current approach works for personal use (< 20 connections)
2. **Shared pool** — refactor for NUTbits Cloud / multi-tenant readiness
3. **Hybrid** — shared pool with per-connection fallback for edge cases

Recommendation: **Option 2** before NUTbits Cloud. It's a clean refactor of `connectRelay` and `startRelayLoop` — the rest of the codebase doesn't need to change.
