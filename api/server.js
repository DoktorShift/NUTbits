// NUTbits Management API — Local server
// Unix socket (primary) + optional HTTP on 127.0.0.1
// Zero dependencies — built on node:http

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Router } from './router.js';
import { createAuth } from './middleware/auth.js';
import { registerHandlers } from './handlers/index.js';

var MAX_BODY_BYTES = 1024 * 1024; // 1 MB

export async function startApiServer(ctx) {
    // Use XDG_RUNTIME_DIR or ~/.nutbits/ — never /tmp (shared, insecure)
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

        res.setHeader('Content-Type', 'application/json');
        // No CORS headers — CLI uses socket/direct HTTP, not browser
        // CORS will be added when the web dashboard is built

        // Auth — reject empty tokens
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

        // Parse body for POST/DELETE
        var body = null;
        if (req.method === 'POST' || req.method === 'DELETE') {
            // Enforce Content-Type to prevent CSRF via text/plain
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

        // Execute handler — namespace params to prevent override
        try {
            var result = await match.handler({ params: match.params, query: match.query, body });
            var duration = Date.now() - startTime;
            ctx.log?.debug?.('API: request', { method: req.method, path: urlPath, status: 200, ms: duration });
            res.writeHead(200);
            res.end(JSON.stringify({ ok: true, data: result }));
        } catch (e) {
            var status = e.statusCode || 500;
            var duration = Date.now() - startTime;
            // Don't leak internal errors — only show message for known API errors
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

    server.listen(socketPath, () => {
        try { fs.chmodSync(socketPath, 0o600); } catch (e) { /* ignore */ }
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
