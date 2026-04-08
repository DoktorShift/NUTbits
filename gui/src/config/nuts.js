/**
 * Shared NUT (Cashu protocol) constants and amount presets.
 *
 * Single source of truth — used by Dashboard, Mints, Nuts, Pay, Receive.
 */

export const NUT_LABELS = {
  '00': 'Cryptography',
  '01': 'Mint Public Keys',
  '02': 'Keysets',
  '03': 'Swap',
  '04': 'Mint (BOLT11)',
  '05': 'Melt (BOLT11)',
  '06': 'Mint Info',
  '07': 'Proof State Check',
  '08': 'Fee Return',
  '09': 'Signature Restore',
  '12': 'DLEQ Proofs',
  '13': 'Deterministic Secrets',
  '15': 'Partial Multi-Path',
  '17': 'WebSocket Subscriptions',
  '20': 'Signature on Mint',
}

export const NUT_IDS = Object.keys(NUT_LABELS)

export const AMOUNT_PRESETS = [100, 500, 1000, 5000, 10000, 50000]
