<img src="../assets/headers/doc-database.svg" alt="Storage Backends" width="100%">

# Storage Backends

NUTbits supports three storage backends. Choose based on your use case.

## At a Glance

| | `file` | `sqlite` | `mysql` |
|---|---|---|---|
| **Best for** | Personal use, simple setups | LNbits, concurrent payments | Multi-server production |
| **Concurrent safety** | Write mutex (serialized) | Full ACID transactions | Full ACID transactions |
| **Dependencies** | None | `better-sqlite3` | `mysql2` |
| **Setup** | Zero config | Zero config | Requires MySQL server |
| **Portable** | Single `.enc` file | Single `.db` file | Remote database |
| **Encryption** | Whole-file AES-256-GCM | Per-column AES-256-GCM | Per-column AES-256-GCM |

## File Backend (default)

The original approach. Entire state is encrypted and written to a single `.enc` file.

```bash
# .env
NUTBITS_STATE_BACKEND=file
NUTBITS_STATE_FILE=./nutbits_state.enc
NUTBITS_STATE_PASSPHRASE=your-passphrase
```

**How it works:** All state lives in memory. On every mutation, the entire state is encrypted and written atomically (write to `.tmp`, then rename). A write mutex prevents concurrent writes from clobbering each other.

**Limitation:** Two concurrent payments can still read stale proof data between async `await` points. The mutex serializes writes but not reads. For single-user setups this rarely matters. For LNbits with concurrent users, use SQLite or MySQL.

> See [STATE.md](STATE.md) for encryption details and manual decryption.

## SQLite Backend (recommended)

Atomic per-proof operations via SQLite transactions. Best balance of simplicity and safety.

```bash
# Install driver
npm install better-sqlite3

# .env
NUTBITS_STATE_BACKEND=sqlite
NUTBITS_STATE_PASSPHRASE=your-passphrase
# Optional: custom path (default: nutbits_state.db)
# NUTBITS_SQLITE_PATH=./nutbits.db
```

**How it works:** Each proof, connection, and transaction is a row in the database. Sensitive fields (private keys, proof secrets, invoices) are encrypted per-column with AES-256-GCM. Proof operations use SQLite transactions for atomicity; two concurrent payments cannot select the same proofs.

**Schema:**

```
proofs        - one row per ecash proof (proof_id, mint_url, amount, proof_enc)
connections   - one row per NWC connection (app_pubkey, data_enc, balance)
              includes per-connection: permissions, spending limits, service fee rates
transactions  - one row per payment (payment_hash, app_pubkey, data_enc)
              includes: fees_paid (routing), service_fee (operator), settled_at
daily_spend   - per-connection daily spend tracking (spend_key, sats)
mints         - configured mints (url, last_healthy)
config        - key-value settings (active_mint_url, encryption_salt)
```

## MySQL Backend

For multi-server deployments with a shared database.

```bash
# Install driver
npm install mysql2

# .env
NUTBITS_STATE_BACKEND=mysql
NUTBITS_STATE_PASSPHRASE=your-passphrase
NUTBITS_MYSQL_URL=mysql://user:password@localhost:3306/nutbits
```

**How it works:** Same schema and encryption as SQLite, adapted for MySQL. Uses connection pooling and InnoDB transactions. Tables are auto-created on first run.

**Create the database first:**

```sql
CREATE DATABASE nutbits CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'nutbits'@'%' IDENTIFIED BY 'your-db-password';
GRANT ALL PRIVILEGES ON nutbits.* TO 'nutbits'@'%';
```

## Migration

### From file to SQLite/MySQL

Automatic. On first run with a new backend, NUTbits detects the existing `.enc` file and migrates all data:

1. Decrypts the `.enc` file
2. Inserts all proofs, connections, and transactions into the database
3. Renames the `.enc` file to `.enc.migrated` (backup)

```
[MIGRATION] Migrated .enc state to SQLite. Old file renamed to nutbits_state.enc.migrated
```

No manual steps needed. Just change `NUTBITS_STATE_BACKEND` and restart.

### From SQLite to MySQL (or vice versa)

Not automatic. Export/import manually:

1. Stop NUTbits
2. Use the old backend to read state
3. Use the new backend to write state
4. Update `.env` and restart

## Encryption Details

All backends encrypt sensitive data with the same algorithm:

- **Key derivation:** scrypt (passphrase + random salt = 32-byte AES key)
- **Encryption:** AES-256-GCM (authenticated encryption)
- **Per-value IV:** Each encrypted field gets a fresh 12-byte random IV
- **Format:** `[IV (12 bytes)][Auth Tag (16 bytes)][Ciphertext]`

The encryption salt is stored:
- **File backend:** Random per-save (embedded in the `.enc` file header)
- **SQLite/MySQL:** Generated once at database creation, stored in the `config` table

The `NUTBITS_STATE_PASSPHRASE` is the only secret. Without it, the data is unreadable.

## Which Backend Should I Use?

```
Personal use, single user          → file
LNbits funding source              → sqlite
Multiple NUTbits instances         → mysql
```
