// Shared encryption utilities for all storage backends
// AES-256-GCM with scrypt key derivation

import crypto from 'crypto';

// Derive a 32-byte AES key from passphrase + salt using scrypt
// N=2^16 (65536), r=8, p=1 - 4x stronger than Node defaults (N=16384)
export function deriveKey(passphrase, salt) {
    return crypto.scryptSync(passphrase, salt, 32, { N: 2 ** 16, r: 8, p: 1, maxmem: 128 * 1024 * 1024 });
}

// Legacy key derivation (Node defaults: N=16384) - only used for migration
export function deriveKeyLegacy(passphrase, salt) {
    return crypto.scryptSync(passphrase, salt, 32);
}

// Encrypt a single value → Buffer [iv(12) + tag(16) + ciphertext]
export function encryptValue(key, plaintext) {
    var iv = crypto.randomBytes(12);
    var cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    var encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    var tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, encrypted]);
}

// Decrypt a single value → plaintext string
export function decryptValue(key, blob) {
    if (!Buffer.isBuffer(blob)) blob = Buffer.from(blob);
    var iv = blob.subarray(0, 12);
    var tag = blob.subarray(12, 28);
    var encrypted = blob.subarray(28);
    var decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(encrypted, null, 'utf8') + decipher.final('utf8');
}

// Encrypt full state JSON → Buffer [salt(16) + iv(12) + tag(16) + ciphertext]
// Used by FileStore for the whole-file .enc format
export function encryptState(passphrase, jsonString) {
    var salt = crypto.randomBytes(16);
    var key = deriveKey(passphrase, salt);
    var iv = crypto.randomBytes(12);
    var cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    var encrypted = Buffer.concat([cipher.update(jsonString, 'utf8'), cipher.final()]);
    var tag = cipher.getAuthTag();
    return Buffer.concat([salt, iv, tag, encrypted]);
}

// Decrypt full state → JSON string
// Tries strong params first, falls back to legacy for existing .enc files
export function decryptState(passphrase, blob) {
    var salt = blob.subarray(0, 16);
    var iv = blob.subarray(16, 28);
    var tag = blob.subarray(28, 44);
    var encrypted = blob.subarray(44);

    // Try strong params first
    try {
        var key = deriveKey(passphrase, salt);
        var decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(tag);
        return decipher.update(encrypted, null, 'utf8') + decipher.final('utf8');
    } catch (e) {
        // Fall back to legacy params (existing .enc files)
        var legacyKey = deriveKeyLegacy(passphrase, salt);
        var decipher2 = crypto.createDecipheriv('aes-256-gcm', legacyKey, iv);
        decipher2.setAuthTag(tag);
        return decipher2.update(encrypted, null, 'utf8') + decipher2.final('utf8');
    }
}

// Generate a deterministic, non-sensitive ID for a proof
export function proofId(proof) {
    if (!proof?.secret) throw new Error('Proof missing secret field');
    return crypto.createHash('sha256').update(proof.secret).digest('hex');
}
