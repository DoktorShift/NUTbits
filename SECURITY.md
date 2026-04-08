<img src="assets/headers/doc-security.svg" alt="Security Policy" width="100%">

# Security Policy

## Disclaimer

NUTbits is provided **as-is, without warranty of any kind**. This software handles ecash tokens (real money). By using NUTbits, you acknowledge:

- **Ecash is custodial.** The mint holds the funds. The mint can be compromised, shut down, or act maliciously.
- **NUTbits is a bridge, not a bank.** It translates between Cashu and NWC. It does not custody funds independently; the mint does.
- **You are responsible for your own setup.** Passphrase strength, seed backup, mint selection, server security - all yours.
- **No guarantee of funds safety.** Software bugs, network failures, or mint issues can lead to loss of funds. Only use amounts you can afford to lose.

The authors and contributors of NUTbits accept **no liability** for lost funds, security breaches, or damages of any kind arising from the use of this software.

## Reporting Vulnerabilities

If you discover a security vulnerability, **please report it responsibly**.

- **Do not** open a public GitHub issue for security vulnerabilities
- **Email:** [Me - DrShift](mailto:keleeweb@tutanota.com)
- **Nostr:** DM [DoktorShift](https://njump.me/npub17c2szua46mc8ndp4grvy4z5465x0qxjge8tqx7vyu0vkqr24y2hssuuy6f)

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact

We will acknowledge your report and work on a fix. Once resolved, we will credit you (unless you prefer anonymity).

## Security Measures in NUTbits

- **AES-256-GCM encryption** for all stored data (proofs, private keys)
- **scrypt key derivation** from your passphrase
- **NUT-12 DLEQ verification** to detect counterfeit tokens
- **NUT-13 deterministic secrets** for seed-based proof recovery
- **Per-payment mutex** to prevent concurrent proof corruption
- **Atomic file writes** (write to `.tmp`, rename) to prevent corruption on crash
- **Event deduplication** to prevent replay attacks / double-payments
- **NWC secrets masked** in all log output

## Best Practices

- Use a strong, unique `NUTBITS_STATE_PASSPHRASE`
- Back up your `NUTBITS_SEED` (auto-saved to `.env`) in a password manager
- Use SQLite or MySQL backend for concurrent access (LNbits)
- Only use mints you trust
- Keep your server updated and access-controlled
- Don't expose NUTbits to the public internet - it communicates via Nostr relays only
