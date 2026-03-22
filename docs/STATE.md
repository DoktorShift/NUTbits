<img src="assets/headers/doc-state.svg" alt="Encrypted State File" width="100%">

# Encrypted State File (`.enc`)

> This document covers the **file backend** specifically. For SQLite and MySQL, see [DATABASE.md](DATABASE.md).
> For backup procedures across all backends, see [BACKUP.md](BACKUP.md).

The `.enc` file is the default storage backend (`NUTBITS_STATE_BACKEND=file`). It holds your entire wallet (ecash proofs, NWC keys, transaction history) in a single AES-256-GCM encrypted file.

## What's Inside

When decrypted, the state is a JSON object:

```json
{
  "proofs": [],
  "mints": {
    "https://your-mint.com": {
      "proofs": [{ "id": "...", "amount": 1, "secret": "...", "C": "..." }],
      "lastHealthy": 1710000000
    }
  },
  "activeMintUrl": "https://your-mint.com",
  "counters": {
    "keyset_id_hex": 42
  },
  "dailySpend": {
    "app_pubkey:2026-03-19": 1500
  },
  "nostr_state": {
    "nwc_info": {
      "app_pubkey_hex": {
        "permissions": ["pay_invoice", "get_balance", "make_invoice", "..."],
        "mymint": "https://your-mint.com",
        "nwc_string": "nostr+walletconnect://...?relay=...&secret=...",
        "app_privkey": "hex...",
        "app_pubkey": "hex...",
        "user_pubkey": "hex...",
        "balance": 50000,
        "max_daily_sats": 10000,
        "max_payment_sats": 1000,
        "service_fee_ppm": 10000,
        "service_fee_base": 1,
        "tx_history": {}
      }
    }
  }
}
```

### What each field means

| Field | What it is | If you lose it |
|-------|-----------|----------------|
| `mints.*.proofs` | Your ecash tokens (the actual sats) | With seed: recoverable. Without seed: gone. |
| `counters` | NUT-13 deterministic secret counters per keyset | Restored automatically from mint via NUT-09 |
| `nwc_info.*.app_privkey` | NWC service signing key | NWC connection string stops working |
| `nwc_info.*.nwc_string` | The connection string you gave to LNbits | Need to generate a new one |
| `nwc_info.*.tx_history` | Payment records (incl. service_fee per tx) | History lost, but funds are safe |
| `nwc_info.*.service_fee_ppm` | Per-connection service fee rate | Falls back to global config |
| `nwc_info.*.max_daily_sats` | Per-connection daily spending limit | Falls back to global config |
| `dailySpend` | Per-connection daily spend counters | Resets naturally at midnight |
| `activeMintUrl` | Which mint is currently active | Defaults to first configured mint |

## Encryption Format

```
[ 16 bytes: salt ][ 12 bytes: IV ][ 16 bytes: GCM auth tag ][ ciphertext ]
```

1. A random **salt** is generated per save
2. `NUTBITS_STATE_PASSPHRASE` + salt run through **scrypt** to derive a 32-byte AES key
3. JSON encrypted with **AES-256-GCM** (authenticated; detects tampering)
4. Written to `.enc.tmp` first, then renamed to `.enc` (atomic; crash-safe)
5. File permissions set to `0600` (owner read/write only)

A **write mutex** serializes all writes; concurrent operations cannot corrupt the file.

## Decrypt Manually

For debugging or recovery:

```js
// decrypt_state.js - run with: node decrypt_state.js "your-passphrase"
import crypto from 'crypto';
import fs from 'fs';

var passphrase = process.argv[2];
if (!passphrase) { console.error('Usage: node decrypt_state.js <passphrase>'); process.exit(1); }

var blob = fs.readFileSync('./nutbits_state.enc');
var salt = blob.subarray(0, 16);
var iv = blob.subarray(16, 28);
var tag = blob.subarray(28, 44);
var enc = blob.subarray(44);
var key = crypto.scryptSync(passphrase, salt, 32);
var d = crypto.createDecipheriv('aes-256-gcm', key, iv);
d.setAuthTag(tag);
console.log(JSON.stringify(JSON.parse(d.update(enc, null, 'utf8') + d.final('utf8')), null, 2));
```

## When It Gets Written

- On every incoming/outgoing payment (proof changes)
- On every transaction state update (settled, failed)
- Every 60 seconds (periodic flush)
- On graceful shutdown (SIGINT/SIGTERM)

## Important Notes

- **The `.enc` file IS your money** (unless you have a seed configured, in which case funds are recoverable)
- **Never run two NUTbits instances** with the same state file; double-spend risk
- **The `.tmp` file** is a write-in-progress artifact. If it exists after a crash, `.enc` is still valid. Delete `.tmp` safely.
- **Changing your passphrase:** stop NUTbits, update `NUTBITS_STATE_PASSPHRASE` in `.env`, restart. The file is re-encrypted on next save.

## When to Use File vs SQLite/MySQL

| Use case | Recommendation |
|----------|---------------|
| Personal use, single user | `file` - simple, portable, no dependencies |
| LNbits with concurrent payments | `sqlite` - atomic proof operations |
| Multi-server production | `mysql` - shared remote database |

See [DATABASE.md](DATABASE.md) for setup and migration instructions.
