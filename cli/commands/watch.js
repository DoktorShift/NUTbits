import { c, stripAnsi } from '../colors.js';
import { kv, sats, uptime, relativeTime, print } from '../render.js';

export async function run(client, args) {
    var lastTxCount = 0;
    var liveFeed = [];
    var MAX_FEED = 15;

    var draw = async () => {
        // Fetch all data
        var [status, history] = await Promise.all([
            client.get('/api/v1/status'),
            client.get('/api/v1/history', { limit: '20', unpaid: 'true' }),
        ]);

        // Detect new transactions
        if (lastTxCount > 0 && history.total > lastTxCount) {
            var newTxs = history.transactions.slice(0, history.total - lastTxCount);
            for (var tx of newTxs.reverse()) {
                var arrow = tx.type === 'incoming' ? `${c.green}←${c.reset}` : `${c.red}→${c.reset}`;
                var time = new Date((tx.created_at || 0) * 1000).toLocaleTimeString('en-US', { hour12: false });
                var amt = Math.floor((tx.amount || 0) / 1000);
                var statusStr = tx.settled_at ? `${c.green}settled${c.reset}` : tx.err_msg ? `${c.red}failed${c.reset}` : `${c.yellow}pending${c.reset}`;
                liveFeed.push(`  ${c.dim}${time}${c.reset}   ${arrow} ${tx.type.padEnd(8)}  ${c.yellow}${c.bold}${amt.toLocaleString().padStart(8)}${c.reset} ${c.muted}sats${c.reset}   ${statusStr}   ${c.dim}${tx.connection_label || '—'}${c.reset}`);
            }
            if (liveFeed.length > MAX_FEED) liveFeed = liveFeed.slice(-MAX_FEED);
        }
        lastTxCount = history.total;

        // Clear screen and redraw
        process.stdout.write('\x1b[2J\x1b[H');

        var d = status;
        print(`  ${c.purple}${c.bold}NUTbits${c.reset} ${c.dim}v${d.version}${c.reset}                     ${d.mint.healthy ? c.dot.ok : c.dot.err} ${c.muted}running${c.reset}         ${c.dim}uptime: ${uptime(d.uptime_ms)}${c.reset}`);
        print(`  ${c.dim}${'─'.repeat(70)}${c.reset}`);
        print('');
        print(`  ${c.muted}Balance${c.reset}    ${sats(d.balance_sats)}              ${c.muted}Mint${c.reset}       ${d.mint.healthy ? c.dot.ok : c.dot.err} ${c.white}${d.mint.name}${c.reset}`);
        print(`  ${c.muted}Relays${c.reset}     ${d.relays.connected}/${d.relays.total}                     ${c.muted}Storage${c.reset}    ${d.storage}`);
        print(`  ${c.muted}Conns${c.reset}      ${d.connections_count} active               ${c.muted}Seed${c.reset}       ${d.seed_configured ? c.dot.ok : c.dot.err} ${d.seed_configured ? 'configured' : 'not set'}`);
        print('');
        print(`  ${c.dim}── Live ${'─'.repeat(62)}${c.reset}`);
        print('');

        if (liveFeed.length > 0) {
            for (var line of liveFeed) print(line);
        } else {
            // Show recent transactions as initial feed
            for (var tx of history.transactions.slice(0, MAX_FEED)) {
                var arrow = tx.type === 'incoming' ? `${c.green}←${c.reset}` : `${c.red}→${c.reset}`;
                var time = tx.created_at ? relativeTime(tx.created_at * 1000).padEnd(12) : '—'.padEnd(12);
                var amt = Math.floor((tx.amount || 0) / 1000);
                var statusStr = tx.settled_at ? `${c.green}settled${c.reset}` : tx.err_msg ? `${c.red}failed${c.reset}` : `${c.yellow}pending${c.reset}`;
                print(`  ${c.dim}${time}${c.reset} ${arrow} ${tx.type.padEnd(8)}  ${c.yellow}${c.bold}${amt.toLocaleString().padStart(8)}${c.reset} ${c.muted}sats${c.reset}   ${statusStr}   ${c.dim}${tx.connection_label || '—'}${c.reset}`);
            }
            if (history.transactions.length === 0) {
                print(`  ${c.dim}No transactions yet. Waiting...${c.reset}`);
            }
        }

        print(`\n  ${c.dim}Ctrl+C to exit${c.reset}`);
    };

    // Initial draw + self-rescheduling loop (safe on errors)
    await draw().catch(() => {});
    var running = true;
    var timeout;
    var loop = async () => {
        if (!running) return;
        try { await draw(); } catch (e) { /* service may be restarting */ }
        if (running) timeout = setTimeout(loop, 2000);
    };
    timeout = setTimeout(loop, 2000);

    // Wait for Ctrl+C
    await new Promise((resolve) => {
        var onSigint = () => {
            running = false;
            clearTimeout(timeout);
            process.stdout.write('\x1b[2J\x1b[H');
            resolve();
        };
        process.once('SIGINT', onSigint);
    });
}
