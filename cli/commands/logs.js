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
    var cols = process.stdout.columns || 120;

    var fetch = async () => {
        var d = await client.get('/api/v1/logs', { level, limit: '50' });
        for (var entry of d.logs) {
            if (entry.ts <= lastTs) continue;
            lastTs = entry.ts;

            var time = new Date(entry.ts).toLocaleTimeString('en-US', { hour12: false });
            var lvl = entry.level.toUpperCase().padEnd(5);
            var color = LEVEL_COLORS[entry.level] || c.muted;
            var dataStr = entry.data ? JSON.stringify(entry.data) : '';
            if (dataStr.length > cols - 40) dataStr = dataStr.slice(0, cols - 43) + '...';
            var data = dataStr ? `  ${c.dim}${dataStr}${c.reset}` : '';
            print(`  ${c.dim}${time}${c.reset} ${color}[${lvl}]${c.reset}  ${entry.msg}${data}`);
        }
    };

    if (follow) {
        print(`  ${c.muted}Streaming ${level}+ logs. ${c.white}Ctrl+C${c.muted} to stop.${c.reset}`);
        print('');
    }

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
