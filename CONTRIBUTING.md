<img src="assets/headers/doc-contributing.svg" alt="Contributing" width="100%">

# Contributing to NUTbits

Welcome! NUTbits is an open-source project and contributions are appreciated.

## Standing on the Shoulders of Giants

NUTbits wouldn't exist without the incredible work of:

- **[Calle](https://github.com/callebtc)** and the **[Cashu](https://cashu.space)** team — for creating the ecash protocol and the [cashu-ts](https://github.com/cashubtc/cashu-ts) library that powers NUTbits
- **[supertestnet](https://github.com/supertestnet)** — whose [bankify](https://github.com/supertestnet/bankify) project was the original inspiration for this bridge
- **[LNbits](https://github.com/lnbits/lnbits)** team — for building the Lightning accounts system that NUTbits was designed to power
- **[nostr-core](https://www.npmjs.com/package/nostr-core)** by [Pratik227](https://github.com/Pratik227) — for the Nostr protocol library

If you contribute to NUTbits, you're building on all of their work. Thank you to everyone in the Bitcoin, Lightning, Cashu, and Nostr ecosystems.

## How to Contribute

### Report Bugs

Found something broken? [Open an issue](https://github.com/DoktorShift/nutbits/issues/new). Include:
- What happened
- What you expected
- Your NUTbits version (`package.json`) and Node.js version
- Relevant logs (mask any secrets!)

### Suggest Features

Have an idea? Open an issue and describe it. We especially welcome ideas around:
- New NUT support (NUT-15 multi-path payments is on the backlog!)
- Better error messages and UX
- New storage backends
- Testing and reliability improvements

### Submit Code

1. Fork the repo
2. Create a branch (`git checkout -b my-feature`)
3. Make your changes
4. Test locally (`npm start` — check it works end-to-end)
5. Open a pull request

### Code Style

- Plain JavaScript (ES modules, no TypeScript, no build step)
- `var` for declarations (project convention)
- Keep it simple — NUTbits is one main file + store modules
- Follow existing patterns
- Comment the *why*, not the *what*

## Open Backlog

These are things we'd love help with:

- **NUT-15**: Multi-path payments — split a payment across multiple mints
- **Tests**: Unit tests for store backends, integration tests for payment flows
- **BOLT12**: Support for BOLT12 offers (NUT-25)
- **Monitoring**: Health check endpoint, metrics

## Questions?

Open an issue or reach out to [DoktorShift](https://github.com/DoktorShift) on GitHub or via [Nostr](https://njump.me/npub17c2szua46mc8ndp4grvy4z5465x0qxjge8tqx7vyu0vkqr24y2hssuuy6f).

Thanks for considering contributing!
