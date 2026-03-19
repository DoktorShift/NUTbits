// NUTbits Management API — Authentication middleware
// Validates Bearer token using timing-safe comparison

import crypto from 'crypto';

export function createAuth(token) {
    if (!token || token.length === 0) {
        throw new Error('API token must not be empty');
    }
    var tokenBuf = Buffer.from(token);

    return (req) => {
        var authHeader = req.headers.authorization || '';
        if (!authHeader.startsWith('Bearer ')) return false;

        var provided = Buffer.from(authHeader.slice(7));
        if (provided.length === 0) return false;
        if (provided.length !== tokenBuf.length) return false;

        return crypto.timingSafeEqual(provided, tokenBuf);
    };
}
