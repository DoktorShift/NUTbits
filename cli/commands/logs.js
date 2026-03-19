import { c } from '../colors.js';
import { print, jsonOut } from '../render.js';

var LEVEL_COLORS = {
    error: c.red,
    warn: c.yellow,
    info: c.blue,
    debug: c.dim,
};

export async function run(client, args) {
    var level = args.level || 'info';
    var follow = args.follow !== false; // default: follow

    if (args?.json) {
        return jsonOut(await client.get('/api/v1/logs', { level, limit: '50' }));
    }

    var lastTs = 0;

    var fetch = async () => {
        var d = await client.get('/api/v1/logs', { level, limit: '50' });
        for (var entry of d.logs) {
            if (entry.ts <= lastTs) continue;
            lastTs = entry.ts;

            var time = new Date(entry.ts).toLocaleTimeString('en-US', { hour12: false });
            var lvl = entry.level.toUpperCase().padEnd(5);
            var color = LEVEL_COLORS[entry.level] || c.muted;
            var data = entry.data ? `  ${c.dim}${JSON.stringify(entry.data)}${c.reset}` : '';
            print(`  ${c.dim}${time}${c.reset} ${color}[${lvl}]${c.reset}  ${entry.msg}${data}`);
        }
    };

    await fetch().catch(e => { print(`  ${c.red}${e.message}${c.reset}`); });

    if (follow) {
        var running = true;
        var timeout;
        var loop = async () => {
            if (!running) return;
            try { await fetch(); } catch (e) { /* service may be restarting */ }
            if (running) timeout = setTimeout(loop, 1000);
        };
        timeout = setTimeout(loop, 1000);

        await new Promise(resolve => {
            process.once('SIGINT', () => {
                running = false;
                clearTimeout(timeout);
                resolve();
            });
        });
    }
}
