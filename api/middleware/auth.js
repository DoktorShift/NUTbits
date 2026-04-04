// NUTbits Management API - Authentication middleware
// Validates Bearer token using timing-safe comparison

import crypto from 'crypto';

export function createAuth(token) {
    if (!token || token.length === 0) {
        throw new Error('API token must not be empty');
    }
    // Hash the token so comparison is always fixed-length (32 bytes)
    // This prevents leaking the token length via timing side-channel
    var tokenHash = crypto.createHash('sha256').update(token).digest();

    return (req) => {
        var authHeader = req.headers.authorization || '';
        if (!authHeader.startsWith('Bearer ')) return false;

        var provided = authHeader.slice(7);
        if (provided.length === 0) return false;

        var providedHash = crypto.createHash('sha256').update(provided).digest();
        return crypto.timingSafeEqual(providedHash, tokenHash);
    };
}
