// NUTbits CLI - API client
// Connects to the management API via Unix socket or HTTP
// Reads auth token from .api-token file

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

var REQUEST_TIMEOUT = 15000; // 15s

export function createClient({ socket, httpUrl } = {}) {
    // Default socket path matches server's default
    var defaultDir = process.env.XDG_RUNTIME_DIR || path.join(os.homedir(), '.nutbits');
    var socketPath = socket || process.env.NUTBITS_API_SOCKET || path.join(defaultDir, 'nutbits.sock');
    var baseUrl = httpUrl || process.env.NUTBITS_API_HTTP || null;
    var token = loadToken(socketPath);

    if (!token) {
        throw new Error('No API token found. Is NUTbits running? Check ' + socketPath + '.token');
    }

    // Parse base URL once (if HTTP mode)
    var parsedUrl = null;
    if (baseUrl) {
        try { parsedUrl = new URL(baseUrl); }
        catch (e) { throw new Error('Invalid HTTP URL: ' + baseUrl); }
    }

    var request = (method, reqPath, body = null) => new Promise((resolve, reject) => {
        var options = parsedUrl
            ? { method, path: reqPath, hostname: parsedUrl.hostname, port: parsedUrl.port }
            : { method, path: reqPath, socketPath };

        options.headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
        };
        options.timeout = REQUEST_TIMEOUT;

        var req = http.request(options, res => {
            var chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => {
                var raw = Buffer.concat(chunks).toString();
                try {
                    var parsed = JSON.parse(raw);
                    if (!parsed.ok) {
                        var err = new Error(parsed.error || 'API error');
                        err.statusCode = res.statusCode;
                        reject(err);
                    } else {
                        resolve(parsed.data);
                    }
                } catch (e) {
                    reject(new Error('Invalid response from NUTbits API'));
                }
            });
        });

        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timed out'));
        });

        req.on('error', e => {
            if (e.code === 'ECONNREFUSED' || e.code === 'ENOENT') {
                reject(new Error('Cannot connect to NUTbits. Is the service running?'));
            } else {
                reject(e);
            }
        });

        if (body) req.write(JSON.stringify(body));
        req.end();
    });

    return {
        get:  (reqPath, query = {}) => {
            var qs = new URLSearchParams(query).toString();
            return request('GET', qs ? `${reqPath}?${qs}` : reqPath);
        },
        post:   (reqPath, body) => request('POST', reqPath, body),
        delete: (reqPath) => request('DELETE', reqPath),
    };
}

function loadToken(socketPath) {
    // Try env var first
    if (process.env.NUTBITS_API_TOKEN) return process.env.NUTBITS_API_TOKEN;

    // Try token file next to socket
    var tokenFile = socketPath + '.token';
    try {
        var tok = fs.readFileSync(tokenFile, 'utf8').trim();
        if (tok) return tok;
    } catch (e) {
        // ignore
    }

    return null;
}
