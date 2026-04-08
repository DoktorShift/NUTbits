<img src="../assets/headers/doc-backup.svg" alt="Backup & Recovery" width="100%">

# Backup & Recovery

**[What to Back Up](#what-to-back-up) · [Quick Backup](#quick-backup) · [Automated](#automated-backups) · [Recovery](#recovery) · [Seed Recovery](#seed-recovery-nut-09--nut-13) · [Failure Scenarios](#failure-scenarios) · [Rules](#important-rules)**

Your NUTbits state contains **ecash proofs (real money)** and **NWC private keys**. Losing this data means losing funds and wallet access.

## What to Back Up

| Backend | Files to back up | Notes |
|---------|-----------------|-------|
| `file` | `nutbits_state.enc` | The entire wallet in one file |
| `sqlite` | `nutbits_state.db` | Single database file |
| `mysql` | Database dump | Use `mysqldump` |

**Always back up your `.env` file too** - it contains `NUTBITS_STATE_PASSPHRASE` (required to decrypt everything), your seed, and service fee configuration.

> Store the passphrase and the data separately. One without the other is useless.

## Quick Backup

### Using the CLI (recommended)

```bash
nutbits backup                           # auto-named with timestamp
nutbits backup --out ./my-backup.enc     # custom path
nutbits verify ./my-backup.enc           # check a backup
```

### File backend (manual)

```bash
cp nutbits_state.enc "backups/nutbits_$(date +%Y%m%d_%H%M%S).enc"
```

### SQLite backend

```bash
cp nutbits_state.db "backups/nutbits_$(date +%Y%m%d_%H%M%S).db"
```

### MySQL backend

```bash
mysqldump -u nutbits -p nutbits > "backups/nutbits_$(date +%Y%m%d_%H%M%S).sql"
```

## Automated Backups

Add to crontab (`crontab -e`):

```bash
# Daily backup at 2 AM
0 2 * * * cp /path/to/nutbits_state.enc /path/to/backups/nutbits_$(date +\%Y\%m\%d).enc
```

## Recovery

### Restore from backup

1. Stop NUTbits
2. Copy your backup file to the configured path
3. Ensure `.env` has the correct `NUTBITS_STATE_PASSPHRASE`
4. Start NUTbits

```bash
# Example: restore file backend
cp backups/nutbits_20260318.enc nutbits_state.enc
npm start
```

### Stale backup warning

Ecash proofs are **single-use**. If you restore an old backup, proofs that were spent since the backup will be rejected by the mint. Unspent proofs still work. You won't lose more than what was spent between the backup and now.

## Seed Recovery (NUT-09 + NUT-13)

This is your **last resort** when you have no backup but still have your seed. It recovers ecash proofs directly from the mint.

### Using the CLI

```bash
nutbits restore                  # recover from all configured mints
nutbits restore --mint <url>     # recover from a specific mint
```

### How it works

NUTbits generates ecash proofs using your seed and a counter (NUT-13). The mint remembers every proof it ever signed. NUT-09 lets you ask the mint: "did you sign any of these?" and rebuild your proofs from the answers.

```
seed + counter 0  →  ask mint  →  "yes, I signed that"  →  proof recovered
seed + counter 1  →  ask mint  →  "yes, I signed that"  →  proof recovered
seed + counter 2  →  ask mint  →  "never seen this"     →  done
```

### When does it run?

**Automatically on startup** - if NUTbits has a seed configured but no proofs stored for a mint, it attempts recovery. You don't need to do anything.

### Manual recovery after data loss

1. You lost your state file / database
2. You still have your seed (`NUTBITS_SEED` from `.env` or your password manager)

```bash
# Make sure your .env has the seed
NUTBITS_SEED=your-seed-here

# Delete the old state (if corrupted) and start fresh
rm nutbits_state.enc
npm start
```

NUTbits will:
- Start with an empty state
- Detect that the seed is configured but no proofs exist
- Contact each mint and recover all proofs it ever signed for your seed
- Log: `NUT-09: restored proofs from seed`

### What you can and can't recover

| | Recoverable | Not recoverable |
|---|---|---|
| Ecash proofs (your sats) | With seed | Without seed |
| NWC connection string | No - a new one is generated | Save it separately |
| Transaction history | No - stored locally only | Gone |
| NWC private keys | No - regenerated | Clients need to reconnect |

### Requirements

- Your mint must support NUT-09 (most modern mints do; NUTbits checks this at startup)
- You must have used a seed (`NUTBITS_SEED`) **before** the proofs were created
- Proofs created with random secrets (no seed) **cannot** be recovered this way

> NUTbits generates a seed on first run and **auto-saves it to your `.env` file**. Back up your `.env` or copy the seed to a password manager.

## Failure Scenarios

| Scenario | Impact | Recovery |
|----------|--------|----------|
| Deleted state file | Wallet gone, NWC string invalid | Restore from backup, or seed recovery |
| Lost passphrase | Data permanently locked | Seed recovery (proofs only) |
| Corrupted file | State load fails, starts fresh | Seed recovery runs automatically |
| Restored old backup | Spent proofs rejected, unspent proofs work | Acceptable partial recovery |
| Copied to new machine | Works - same file + passphrase = same wallet | Don't run two copies at once |
| Lost state + have seed | Proofs recovered, NWC string regenerated | Clients need new NWC string |
| Lost state + no seed | **Funds permanently lost** | None |

## Inspect State (File Backend)

To view decrypted state without starting NUTbits:

```js
// decrypt_state.js
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

```bash
node decrypt_state.js "your-passphrase"
```

## Important Rules

- **Never run two NUTbits instances** with the same state; double-spend attempts will burn proofs
- **Back up after funding** - the state changes on every payment
- **The `.tmp` file** is a write-in-progress artifact; the main file is always the valid one
- **File permissions** are set to `0600` (owner-only) automatically

---

## Related

- [STATE.md](STATE.md) — encrypted state file format and manual decryption
- [DATABASE.md](DATABASE.md) — storage backends (file, SQLite, MySQL)
- [INSTALL.md](INSTALL.md) — getting NUTbits up and running
