// NUTbits Management API - Local server
// Unix socket (primary) + optional HTTP on 127.0.0.1
// Zero dependencies - built on node:http

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Router } from './router.js';
import { createAuth } from './middleware/auth.js';
import { registerHandlers, createDeeplinkConnection } from './handlers/index.js';
import { renderDeeplinkPage } from './deeplink-page.js';
import { findDeeplinkApp, validateCallback } from './deeplink-apps.js';

// ── Rate limiter for unauthenticated /connect endpoint ──────────────
var connectRateMap = new Map();
var CONNECT_RATE_LIMIT = 5;      // max connections per window
var CONNECT_RATE_WINDOW_MS = 60000; // 1 minute

/**
 * Get the real client IP behind a reverse proxy.
 * Trusts X-Forwarded-For only from loopback (proxy is on same machine).
 * Falls back to socket address for direct connections.
 */
function getClientIp(req) {
    var socketIp = req.socket.remoteAddress || '127.0.0.1';
    // Only trust forwarded headers from loopback (Caddy/nginx on same host)
    if (isLoopbackAddress(socketIp)) {
        var xff = req.headers['x-forwarded-for'];
        if (xff) return xff.split(',')[0].trim();
        var xri = req.headers['x-real-ip'];
        if (xri) return xri.trim();
    }
    return socketIp;
}

function checkConnectRate(ip) {
    var now = Date.now();
    var entry = connectRateMap.get(ip);
    if (!entry || now - entry.start > CONNECT_RATE_WINDOW_MS) {
        connectRateMap.set(ip, { start: now, count: 1 });
        return true;
    }
    entry.count++;
    if (entry.count > CONNECT_RATE_LIMIT) return false;
    return true;
}

// Cleanup stale entries every 5 minutes
setInterval(() => {
    var cutoff = Date.now() - CONNECT_RATE_WINDOW_MS * 2;
    for (var [ip, entry] of connectRateMap) {
        if (entry.start < cutoff) connectRateMap.delete(ip);
    }
}, 300000);

var MAX_BODY_BYTES = 1024 * 1024; // 1 MB

export async function startApiServer(ctx) {
    // Use XDG_RUNTIME_DIR or ~/.nutbits/ - never /tmp (shared, insecure)
    var defaultDir = process.env.XDG_RUNTIME_DIR || path.join(os.homedir(), '.nutbits');
    if (!fs.existsSync(defaultDir)) fs.mkdirSync(defaultDir, { mode: 0o700, recursive: true });
    // Always enforce directory permissions (may already exist with wrong perms)
    try { fs.chmodSync(defaultDir, 0o700); } catch (e) { /* ignore if not owner */ }

    var socketPath = ctx.config.apiSocket || path.join(defaultDir, 'nutbits.sock');
    var httpPort = ctx.config.apiPort || null;
    var token = ctx.config.apiToken || null;

    // Auto-generate token if not set
    if (!token) {
        var crypto = await import('node:crypto');
        token = crypto.randomBytes(24).toString('hex');
        ctx.config.apiToken = token;
    }

    // Write token to file for CLI to read (atomic rename to prevent TOCTOU)
    var tokenFile = socketPath + '.token';
    try {
        var crypto2 = await import('node:crypto');
        var tmpToken = path.join(path.dirname(tokenFile), '.token-' + crypto2.randomBytes(8).toString('hex'));
        fs.writeFileSync(tmpToken, token, { mode: 0o600 });
        fs.renameSync(tmpToken, tokenFile);
    } catch (e) {
        ctx.log?.warn?.('API: could not write token file', { error: e.message });
    }

    var auth = createAuth(token);
    var router = new Router();
    registerHandlers(router, ctx);

    // ── Request Handler ──────────────────────────────────────────────

    var handler = async (req, res) => {
        var startTime = Date.now();
        var urlPath = (req.url || '/').split('?')[0];
        var origin = req.headers.origin || '';

        res.setHeader('Content-Type', 'application/json');
        setLocalCorsHeaders(req, res);

        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }

        if (urlPath === '/api/v1/bootstrap' && req.method === 'GET') {
            if (!isLocalBootstrapRequest(req)) {
                ctx.log?.warn?.('API: bootstrap denied', { origin, host: req.headers.host || '', remote: req.socket.remoteAddress || '' });
                res.writeHead(403);
                res.end(JSON.stringify({ ok: false, error: 'forbidden' }));
                return;
            }

            res.setHeader('Cache-Control', 'no-store');
            res.writeHead(200);
            res.end(JSON.stringify({
                ok: true,
                data: {
                    token,
                    api_url: httpPort ? `http://127.0.0.1:${httpPort}` : null,
                },
            }));
            return;
        }

        // ── Static: app icons for deeplink page ────────────────────
        if (urlPath.startsWith('/app-icons/') && req.method === 'GET') {
            var iconsBase = path.resolve(process.cwd(), 'gui', 'public', 'app-icons');
            var iconFile = path.resolve(iconsBase, path.basename(urlPath));
            // Block path traversal — resolved path must stay inside the icons directory
            if (!iconFile.startsWith(iconsBase + path.sep) && iconFile !== iconsBase) {
                res.writeHead(403);
                res.end('');
                return;
            }
            try {
                if (fs.existsSync(iconFile) && fs.statSync(iconFile).isFile()) {
                    var data = fs.readFileSync(iconFile);
                    var ext = path.extname(iconFile).toLowerCase();
                    res.setHeader('Content-Type', ext === '.svg' ? 'image/svg+xml' : 'image/png');
                    res.setHeader('Cache-Control', 'public, max-age=86400');
                    res.writeHead(200);
                    res.end(data);
                    return;
                }
            } catch (e) { /* fall through to 404 */ }
            res.writeHead(404);
            res.end('');
            return;
        }

        // ── Deeplink: /connect ──────────────────────────────────────
        // Public endpoints — no auth required.
        //   GET  /connect → serves HTML page instantly (connecting animation)
        //   POST /connect → creates the dedicated connection (called by the page via fetch)
        if (urlPath === '/connect') {
            var qp = new URL(req.url, 'http://localhost').searchParams;

            // Parse deep link params (shared by GET and POST)
            var appName, appIcon, callbackUri;
            if (qp.get('deeplink')) {
                try {
                    var decoded = decodeURIComponent(qp.get('deeplink'));
                    var queryPart = decoded.includes('?') ? decoded.split('?').slice(1).join('?') : '';
                    var dlParams = new URLSearchParams(queryPart);
                    appName = dlParams.get('appname') || dlParams.get('appName') || 'Unknown App';
                    appIcon = dlParams.get('appicon') || dlParams.get('appIcon') || '';
                    callbackUri = dlParams.get('callback') || '';
                } catch (e) {
                    appName = 'Unknown App'; appIcon = ''; callbackUri = '';
                }
            } else {
                appName = qp.get('appname') || qp.get('appName') || 'Unknown App';
                appIcon = qp.get('appicon') || qp.get('appIcon') || '';
                callbackUri = qp.get('callback') || '';
            }

            // Match against deeplink app registry
            var dlMatch = findDeeplinkApp(appName);
            var isKnownApp = !!dlMatch;
            if (dlMatch && !appIcon) appIcon = `/app-icons/${dlMatch.id}.png`;

            // Validate callback URI — block open redirects
            var cbCheck = validateCallback(callbackUri, dlMatch);
            if (!cbCheck.valid) {
                ctx.log?.warn?.('Deeplink: callback rejected', { callback: callbackUri, reason: cbCheck.reason });
                callbackUri = ''; // strip invalid callback — show NWC string on screen instead
            }

            // GET: serve the page instantly (no waiting)
            if (req.method === 'GET') {
                // The page will POST back to create the connection
                var connectEndpoint = `/connect?${qp.toString()}`;
                var html = renderDeeplinkPage({ appName, appIcon, callbackUri, isKnownApp, connectEndpoint });

                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                res.setHeader('Cache-Control', 'no-store');
                res.setHeader('X-Frame-Options', 'DENY');
                res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' https:; connect-src 'self'");
                res.writeHead(200);
                res.end(html);
                return;
            }

            // POST: create the connection, return JSON
            if (req.method === 'POST') {
                res.setHeader('Content-Type', 'application/json');

                // Rate limit — prevent connection creation DoS
                var clientIp = getClientIp(req);
                if (!checkConnectRate(clientIp)) {
                    ctx.log?.warn?.('Deeplink: rate limited', { ip: clientIp, app: appName });
                    res.writeHead(429);
                    res.end(JSON.stringify({ ok: false, error: 'Too many connection requests. Try again later.' }));
                    return;
                }

                // Unknown apps get minimal permissions — known apps get their curated set
                var defaultPerms = isKnownApp ? dlMatch.permissions : ['get_balance', 'get_info'];

                try {
                    var result = await createDeeplinkConnection(ctx, {
                        appName,
                        permissions: defaultPerms,
                        maxPaymentSats: dlMatch?.budget?.maxPaymentSats || 0,
                        maxDailySats: dlMatch?.budget?.maxDailySats || 0,
                    });
                    ctx.log?.info?.('Deeplink: connection created', { app: appName, pubkey: result.app_pubkey });
                    res.writeHead(200);
                    res.end(JSON.stringify({ ok: true, data: result }));
                } catch (e) {
                    ctx.log?.error?.('Deeplink: failed', { error: e.message, stack: e.stack });
                    res.writeHead(200);
                    res.end(JSON.stringify({ ok: false, error: 'Connection failed' }));
                }
                return;
            }
        }

        // Auth - reject empty tokens
        if (!auth(req)) {
            ctx.log?.warn?.('API: unauthorized request', { method: req.method, path: urlPath });
            res.writeHead(401);
            res.end(JSON.stringify({ ok: false, error: 'unauthorized' }));
            return;
        }

        // Route
        var match = router.match(req.method, req.url);
        if (!match) {
            ctx.log?.debug?.('API: route not found', { method: req.method, path: urlPath });
            res.writeHead(404);
            res.end(JSON.stringify({ ok: false, error: 'not found' }));
            return;
        }

        // Parse body for POST/PATCH.
        // Enforce Content-Type: application/json to prevent CSRF via text/plain
        // (HTML forms can only submit GET/POST, so DELETE is not at risk).
        // DELETE handlers use only URL params — no body needed.
        var body = null;
        if (req.method === 'POST' || req.method === 'PATCH') {
            var ct = req.headers['content-type'] || '';
            if (!ct.includes('application/json')) {
                res.writeHead(415);
                res.end(JSON.stringify({ ok: false, error: 'Content-Type must be application/json' }));
                return;
            }
            try {
                body = await readBody(req);
            } catch (e) {
                var code = e.statusCode || 400;
                res.writeHead(code);
                res.end(JSON.stringify({ ok: false, error: e.message }));
                return;
            }
        }

        // Execute handler - namespace params to prevent override
        try {
            var result = await match.handler({ params: match.params, query: match.query, body });
            var duration = Date.now() - startTime;
            ctx.log?.debug?.('API: request', { method: req.method, path: urlPath, status: 200, ms: duration });
            res.writeHead(200);
            res.end(JSON.stringify({ ok: true, data: result }));
        } catch (e) {
            var status = e.statusCode || 500;
            var duration = Date.now() - startTime;
            // Don't leak internal errors - only show message for known API errors
            var message = e.statusCode ? e.message : 'internal error';
            ctx.log?.warn?.('API: request failed', { method: req.method, path: urlPath, status, error: message, ms: duration });
            res.writeHead(status);
            res.end(JSON.stringify({ ok: false, error: message }));
            if (!e.statusCode) ctx.log?.error?.('API handler error', { error: e.message, stack: e.stack });
        }
    };

    var server = http.createServer(handler);
    server.requestTimeout = 30000;  // 30s max per request
    server.headersTimeout = 10000;  // 10s for headers

    // ── Unix Socket ──────────────────────────────────────────────────

    // Clean up stale socket
    if (fs.existsSync(socketPath)) {
        try { fs.unlinkSync(socketPath); }
        catch (e) { /* ignore */ }
    }

    // Set restrictive umask before listen to avoid chmod race window
    var prevUmask = process.umask(0o177);
    server.listen(socketPath, () => {
        process.umask(prevUmask);
        ctx.log?.info?.('API: listening on socket', { path: socketPath });
    });

    // ── Optional HTTP ────────────────────────────────────────────────

    if (httpPort) {
        var httpServer = http.createServer(handler);
        httpServer.listen(Number(httpPort), '127.0.0.1', () => {
            ctx.log?.info?.('API: listening on HTTP', { port: httpPort, host: '127.0.0.1' });
        });
        ctx._httpServer = httpServer;
    }

    // ── Cleanup on shutdown ──────────────────────────────────────────

    ctx._apiServer = server;
    ctx._apiSocketPath = socketPath;
    ctx._apiTokenFile = tokenFile;

    var cleanup = () => {
        try { server.close(); } catch (e) { /* ignore */ }
        try { fs.unlinkSync(socketPath); } catch (e) { /* ignore */ }
        try { fs.unlinkSync(tokenFile); } catch (e) { /* ignore */ }
    };

    process.on('exit', cleanup);
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
}

function setLocalCorsHeaders(req, res) {
    var origin = req.headers.origin || '';
    if (!isLoopbackOrigin(origin)) return;
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Max-Age', '600');
    res.setHeader('Vary', 'Origin');
}

function isLocalBootstrapRequest(req) {
    var origin = req.headers.origin || '';
    if (origin && isLoopbackOrigin(origin)) return true;
    var host = req.headers.host || '';
    var remote = req.socket.remoteAddress || '';
    return isLoopbackHost(host.split(':')[0]) && isLoopbackAddress(remote);
}

function isLoopbackOrigin(origin) {
    try {
        var url = new URL(origin);
        return isLoopbackHost(url.hostname);
    } catch (e) {
        return false;
    }
}

function isLoopbackHost(hostname) {
    return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1' || hostname === '[::1]';
}

function isLoopbackAddress(address) {
    return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

// ── Body Parser (with size limit) ────────────────────────────────────────

function readBody(req) {
    return new Promise((resolve, reject) => {
        var chunks = [];
        var totalBytes = 0;
        req.on('data', chunk => {
            totalBytes += chunk.length;
            if (totalBytes > MAX_BODY_BYTES) {
                req.destroy();
                var err = new Error('request body too large');
                err.statusCode = 413;
                reject(err);
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => {
            var raw = Buffer.concat(chunks).toString();
            if (!raw || !raw.trim()) { resolve(null); return; }
            try { resolve(JSON.parse(raw)); }
            catch (e) { reject(e); }
        });
        req.on('error', reject);
    });
}
