import { c } from '../colors.js';
import { table, heading, print, jsonOut } from '../render.js';

export async function run(client, args) {
    var d = await client.get('/api/v1/nuts');
    if (args?.json) return jsonOut(d);
    var mintUrls = Object.keys(d.mints);
    var nutNames = d.nuts;
    var nutIds = Object.keys(nutNames);

    if (mintUrls.length === 1) {
        // Single mint: two-column compact layout
        var url = mintUrls[0];
        var mintNuts = d.mints[url].nuts;
        var left = [];
        var right = [];
        var half = Math.ceil(nutIds.length / 2);

        for (var i = 0; i < nutIds.length; i++) {
            var n = nutIds[i];
            var supported = mintNuts[n];
            var icon = supported ? c.ok : c.fail;
            var entry = `${icon} ${c.muted}${n}${c.reset}  ${supported ? c.white : c.dim}${nutNames[n]}${c.reset}`;
            if (i < half) left.push(entry);
            else right.push(entry);
        }

        var mintName = url.split('/').pop() || url;
        print(heading(`NUT Support — ${mintName}`));
        print('');
        for (var i = 0; i < Math.max(left.length, right.length); i++) {
            var l = left[i] || '';
            var r = right[i] || '';
            var lPlain = l.replace(/\x1b\[[0-9;]*m/g, '');
            var pad = 40 - lPlain.length;
            print(`  ${l}${' '.repeat(Math.max(2, pad))}${r}`);
        }

        var supported = Object.values(mintNuts).filter(Boolean).length;
        print(`\n  ${c.muted}${supported}/${nutIds.length} NUTs supported${c.reset}\n`);
    } else {
        // Multi-mint: comparison table
        var headers = ['NUT', 'Name', ...mintUrls.map(u => {
            var short = u.replace(/^https?:\/\//, '').split('/')[0];
            return `${c.muted}${short}${c.reset}`;
        })];

        var rows = nutIds.map(n => {
            var row = [
                `${c.muted}${n}${c.reset}`,
                `${c.white}${nutNames[n]}${c.reset}`,
            ];
            for (var url of mintUrls) {
                var supported = d.mints[url].nuts[n];
                row.push(supported ? c.ok : c.fail);
            }
            return row;
        });

        print(heading('NUT Support'));
        print(table(headers, rows));

        var activeUrl = mintUrls.find(u => d.mints[u].active);
        if (activeUrl) {
            var activeNuts = d.mints[activeUrl].nuts;
            var count = Object.values(activeNuts).filter(Boolean).length;
            var short = activeUrl.replace(/^https?:\/\//, '').split('/')[0];
            print(`\n  ${c.muted}Active mint: ${short} — ${count}/${nutIds.length} NUTs supported${c.reset}\n`);
        }
    }
}
