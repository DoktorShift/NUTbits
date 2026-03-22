// NUTbits TUI - Session datastore
// Ring buffer collecting metrics every refresh cycle for charts
// Data lives in memory only; resets on TUI restart

// ── Ring Buffer ──────────────────────────────────────────────────────────
// Fixed-size array that overwrites oldest entries

function createRing(maxSize) {
    var data = [];
    return {
        push: (entry) => {
            data.push(entry);
            if (data.length > maxSize) data.shift();
        },
        get: () => data,
        last: () => data[data.length - 1] || null,
        size: () => data.length,
        clear: () => { data = []; },
        values: (key) => data.map(d => d[key]).filter(v => v !== undefined),
    };
}

// ── Session Datastore ────────────────────────────────────────────────────
// Collects balance, tx count, relay health, mint response time, fees

var MAX_POINTS = 360; // 30 minutes at 5-second intervals

export function createDatastore() {
    var metrics = createRing(MAX_POINTS);
    var mintResponseTimes = {}; // mintUrl -> Ring
    var startedAt = Date.now();

    return {
        // Record a snapshot from the API status + other endpoints
        record: (status, extras) => {
            var point = {
                ts: Date.now(),
                balance: status?.balance_sats || 0,
                relaysConnected: status?.relays?.connected || 0,
                relaysTotal: status?.relays?.total || 0,
                connections: status?.connections_count || 0,
                mintHealthy: status?.mint?.healthy !== false,
            };
            if (extras?.txCount !== undefined) point.txCount = extras.txCount;
            if (extras?.feeTotal !== undefined) point.feeTotal = extras.feeTotal;
            metrics.push(point);
        },

        // Record mint response time (measured client-side per API call)
        recordMintResponse: (mintUrl, responseMs) => {
            if (!mintResponseTimes[mintUrl]) {
                mintResponseTimes[mintUrl] = createRing(MAX_POINTS);
            }
            mintResponseTimes[mintUrl].push({ ts: Date.now(), ms: responseMs });
        },

        // Get all collected data points
        getMetrics: () => metrics.get(),

        // Get values for a specific metric as a flat array (for sparkline)
        getValues: (key) => metrics.values(key),

        // Get balance history
        getBalanceHistory: () => metrics.values('balance'),

        // Get tx count history as deltas (new txs per interval, not cumulative)
        getTxCountHistory: () => {
            var raw = metrics.values('txCount');
            if (raw.length < 2) return raw;
            var deltas = [];
            for (var i = 1; i < raw.length; i++) {
                deltas.push(Math.max(0, raw[i] - raw[i - 1]));
            }
            return deltas;
        },

        // Get fee total history as deltas (new fees per interval)
        getFeeHistory: () => {
            var raw = metrics.values('feeTotal');
            if (raw.length < 2) return raw;
            var deltas = [];
            for (var i = 1; i < raw.length; i++) {
                deltas.push(Math.max(0, raw[i] - raw[i - 1]));
            }
            return deltas;
        },

        // Get mint response times
        getMintResponseTimes: (mintUrl) => {
            var ring = mintResponseTimes[mintUrl];
            return ring ? ring.get().map(d => d.ms) : [];
        },

        // Get relay connectivity over time (ratio of connected/total)
        getRelayHealth: () => {
            return metrics.get().map(d => d.relaysTotal > 0 ? d.relaysConnected / d.relaysTotal : 0);
        },

        // Stats
        pointCount: () => metrics.size(),
        sessionAge: () => Date.now() - startedAt,
        startedAt: () => startedAt,
    };
}
