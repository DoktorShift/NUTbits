/**
 * Deeplink connection page — self-contained HTML5 served by the API.
 * No Vue, no GUI dependency. Works in headless mode.
 *
 * Two-phase UX:
 *   Phase 1: Page loads instantly → "Connecting..." with bridge animation
 *   Phase 2: API call completes → "Connected" with metadata + auto-redirect
 *
 * The page makes a POST /connect call to create the connection,
 * so the user never sees a blank screen.
 */

var NUTBITS_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#0f0e0d"/>
  <rect x="226" y="72" width="28" height="28" rx="3" fill="#8a8078"/>
  <rect x="258" y="72" width="28" height="28" rx="3" fill="#8a8078"/>
  <rect x="194" y="104" width="28" height="28" rx="3" fill="#d97706"/>
  <rect x="226" y="104" width="28" height="28" rx="3" fill="#f59e0b"/>
  <rect x="258" y="104" width="28" height="28" rx="3" fill="#f59e0b"/>
  <rect x="290" y="104" width="28" height="28" rx="3" fill="#d97706"/>
  <rect x="162" y="136" width="28" height="28" rx="3" fill="#a99f96"/>
  <rect x="194" y="136" width="28" height="28" rx="3" fill="#1a1918"/>
  <rect x="226" y="136" width="28" height="28" rx="3" fill="#1a1918"/>
  <rect x="258" y="136" width="28" height="28" rx="3" fill="#1a1918"/>
  <rect x="290" y="136" width="28" height="28" rx="3" fill="#1a1918"/>
  <rect x="322" y="136" width="28" height="28" rx="3" fill="#a99f96"/>
  <rect x="130" y="168" width="28" height="28" rx="3" fill="#8a8078"/>
  <rect x="162" y="168" width="28" height="28" rx="3" fill="#1a1918"/>
  <rect x="194" y="168" width="28" height="28" rx="3" fill="#1a1918"/>
  <rect x="226" y="168" width="28" height="28" rx="3" fill="#1a1918"/>
  <rect x="258" y="168" width="28" height="28" rx="3" fill="#1a1918"/>
  <rect x="290" y="168" width="28" height="28" rx="3" fill="#1a1918"/>
  <rect x="322" y="168" width="28" height="28" rx="3" fill="#1a1918"/>
  <rect x="354" y="168" width="28" height="28" rx="3" fill="#8a8078"/>
  <rect x="114" y="200" width="28" height="28" rx="3" fill="#625a52"/>
  <rect x="146" y="200" width="28" height="28" rx="3" fill="#1a1918"/>
  <rect x="178" y="200" width="28" height="28" rx="3" fill="#1a1918"/>
  <rect x="210" y="200" width="28" height="28" rx="3" fill="#1a1918"/>
  <rect x="242" y="200" width="28" height="28" rx="3" fill="#f59e0b" opacity="0.1"/>
  <rect x="274" y="200" width="28" height="28" rx="3" fill="#1a1918"/>
  <rect x="306" y="200" width="28" height="28" rx="3" fill="#1a1918"/>
  <rect x="338" y="200" width="28" height="28" rx="3" fill="#1a1918"/>
  <rect x="370" y="200" width="28" height="28" rx="3" fill="#625a52"/>
  <rect x="114" y="232" width="28" height="28" rx="3" fill="#625a52"/>
  <rect x="146" y="232" width="28" height="28" rx="3" fill="#1a1918"/>
  <rect x="178" y="232" width="28" height="28" rx="3" fill="#1a1918"/>
  <rect x="210" y="232" width="28" height="28" rx="3" fill="#f59e0b" opacity="0.08"/>
  <rect x="242" y="232" width="28" height="28" rx="3" fill="#f59e0b" opacity="0.18"/>
  <rect x="274" y="232" width="28" height="28" rx="3" fill="#f59e0b" opacity="0.08"/>
  <rect x="306" y="232" width="28" height="28" rx="3" fill="#1a1918"/>
  <rect x="338" y="232" width="28" height="28" rx="3" fill="#1a1918"/>
  <rect x="370" y="232" width="28" height="28" rx="3" fill="#625a52"/>
  <rect x="114" y="264" width="28" height="28" rx="3" fill="#625a52"/>
  <rect x="146" y="264" width="28" height="28" rx="3" fill="#1a1918"/>
  <rect x="178" y="264" width="28" height="28" rx="3" fill="#1a1918"/>
  <rect x="210" y="264" width="28" height="28" rx="3" fill="#1a1918"/>
  <rect x="242" y="264" width="28" height="28" rx="3" fill="#f59e0b" opacity="0.1"/>
  <rect x="274" y="264" width="28" height="28" rx="3" fill="#1a1918"/>
  <rect x="306" y="264" width="28" height="28" rx="3" fill="#1a1918"/>
  <rect x="338" y="264" width="28" height="28" rx="3" fill="#1a1918"/>
  <rect x="370" y="264" width="28" height="28" rx="3" fill="#625a52"/>
  <rect x="130" y="296" width="28" height="28" rx="3" fill="#625a52"/>
  <rect x="162" y="296" width="28" height="28" rx="3" fill="#1a1918"/>
  <rect x="194" y="296" width="28" height="28" rx="3" fill="#1a1918"/>
  <rect x="226" y="296" width="28" height="28" rx="3" fill="#1a1918"/>
  <rect x="258" y="296" width="28" height="28" rx="3" fill="#1a1918"/>
  <rect x="290" y="296" width="28" height="28" rx="3" fill="#1a1918"/>
  <rect x="322" y="296" width="28" height="28" rx="3" fill="#1a1918"/>
  <rect x="354" y="296" width="28" height="28" rx="3" fill="#625a52"/>
  <rect x="146" y="328" width="28" height="28" rx="3" fill="#625a52"/>
  <rect x="178" y="328" width="28" height="28" rx="3" fill="#1a1918"/>
  <rect x="210" y="328" width="28" height="28" rx="3" fill="#1a1918"/>
  <rect x="242" y="328" width="28" height="28" rx="3" fill="#1a1918"/>
  <rect x="274" y="328" width="28" height="28" rx="3" fill="#1a1918"/>
  <rect x="306" y="328" width="28" height="28" rx="3" fill="#1a1918"/>
  <rect x="338" y="328" width="28" height="28" rx="3" fill="#625a52"/>
  <rect x="178" y="360" width="28" height="28" rx="3" fill="#625a52"/>
  <rect x="210" y="360" width="28" height="28" rx="3" fill="#1a1918"/>
  <rect x="242" y="360" width="28" height="28" rx="3" fill="#1a1918"/>
  <rect x="274" y="360" width="28" height="28" rx="3" fill="#1a1918"/>
  <rect x="306" y="360" width="28" height="28" rx="3" fill="#625a52"/>
  <rect x="210" y="392" width="28" height="28" rx="3" fill="#625a52"/>
  <rect x="242" y="392" width="28" height="28" rx="3" fill="#625a52"/>
  <rect x="274" y="392" width="28" height="28" rx="3" fill="#625a52"/>
</svg>`;

export function renderDeeplinkPage({ appName, appIcon, callbackUri, isKnownApp, connectEndpoint }) {

  var appIconHtml = appIcon
    ? `<img src="${esc(appIcon)}" alt="${esc(appName)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" /><span class="icon-letter" style="display:none">${esc(appName.charAt(0))}</span>`
    : `<span class="icon-letter">${esc(appName.charAt(0))}</span>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Connect to NUTbits</title>
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg: #0f0e0d;
  --surface: #1a1918;
  --border: #2a2827;
  --border2: #252321;
  --text: #e8e0d8;
  --muted: #8a8078;
  --dim: #625a52;
  --amber: #f59e0b;
  --green: #34d399;
  --green2: #10b981;
  --red: #ef4444;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  background: var(--bg);
  background-image: radial-gradient(ellipse at 50% 15%, rgba(245,158,11,0.04) 0%, transparent 70%);
  color: var(--text);
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  -webkit-font-smoothing: antialiased;
}

.container {
  max-width: 440px;
  width: 100%;
  padding: 2.5rem 1.5rem 3rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  animation: fade-in .5s ease;
}

@keyframes fade-in { from { opacity: 0; transform: translateY(10px); } }

/* ━━ Bridge SVG ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

.bridge { width: 100%; max-width: 400px; margin-bottom: 2rem; }
.bridge svg { width: 100%; height: auto; display: block; }

.bridge-track { stroke: var(--border); stroke-width: 2; fill: none; stroke-linecap: round; }

.bridge-path {
  stroke-width: 2.5; fill: none; stroke-linecap: round;
  stroke-dasharray: 240; stroke-dashoffset: 240;
}

/* Phase: connecting — amber path draws in, pulsing */
.phase-connecting .bridge-path {
  stroke: var(--amber);
  animation: path-draw 1.6s cubic-bezier(.4,0,.2,1) forwards,
             path-pulse 2s ease-in-out 1.6s infinite;
}
@keyframes path-draw { to { stroke-dashoffset: 0; } }
@keyframes path-pulse { 0%,100% { opacity: 1; } 50% { opacity: .5; } }

/* Phase: connected — green path, no pulse */
.phase-connected .bridge-path,
.phase-redirecting .bridge-path {
  stroke: var(--green);
  stroke-dashoffset: 0;
  animation: none;
  transition: stroke .4s ease;
}

/* Phase: error — red, partial */
.phase-error .bridge-path {
  stroke: var(--red);
  stroke-dashoffset: 120;
  animation: path-draw-partial .6s ease forwards;
}
@keyframes path-draw-partial { to { stroke-dashoffset: 120; } }

/* Signal dot — only visible when connected */
.signal { opacity: 0; transition: opacity .3s ease; }
.phase-connected .signal,
.phase-redirecting .signal { opacity: .9; }

/* Nodes */
.node-bg { fill: var(--surface); stroke: var(--border); stroke-width: 1.5; }

.node-ring { fill: none; stroke: var(--border); stroke-width: 1; transition: all .6s ease; }
.phase-connecting .node-ring-left { stroke: var(--amber); stroke-width: 1.5; }
.phase-connecting .node-ring-right { stroke: var(--amber); stroke-width: 1.5; }
.phase-connected .node-ring,
.phase-redirecting .node-ring { stroke: var(--green); stroke-width: 2; }
.phase-error .node-ring { stroke: var(--border); opacity: .5; }

.node-icon {
  width: 44px; height: 44px; border-radius: 50%;
  overflow: hidden; display: flex; align-items: center; justify-content: center;
}
.node-icon img { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; }
.node-icon svg { width: 100%; height: 100%; border-radius: 50%; }
.icon-letter { font-size: 1.1rem; font-weight: 700; color: var(--muted); display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; }

/* Center icon */
.center-spinner { transform-origin: center; transform-box: fill-box; animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.center-check {
  stroke-dasharray: 24; stroke-dashoffset: 24; opacity: 0;
  transition: opacity .2s ease;
}
.phase-connected .center-check,
.phase-redirecting .center-check {
  opacity: 1; animation: draw-check .5s ease-out .15s forwards;
}
@keyframes draw-check { to { stroke-dashoffset: 0; } }

.center-spinner-g { transition: opacity .2s ease; }
.phase-connected .center-spinner-g,
.phase-redirecting .center-spinner-g,
.phase-error .center-spinner-g { opacity: 0; }

.center-error { opacity: 0; transition: opacity .2s ease; }
.phase-error .center-error { opacity: 1; }

/* ━━ Typography ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

.title {
  font-size: 1.35rem; font-weight: 700; text-align: center;
  margin-bottom: .35rem; transition: color .3s ease;
}
.phase-connecting .title { color: var(--amber); }
.phase-connected .title,
.phase-redirecting .title { color: var(--green); }
.phase-error .title { color: var(--red); }

.subtitle {
  font-size: .85rem; color: var(--muted); text-align: center;
  margin-bottom: 1.5rem; line-height: 1.5;
  min-height: 2.6em;
  transition: opacity .2s ease;
}

.verified-badge {
  display: inline-block; padding: .25rem .65rem;
  font-size: .7rem; font-weight: 500;
  color: var(--green); background: rgba(52,211,153,.08);
  border: 1px solid rgba(52,211,153,.15); border-radius: 1rem;
  margin-bottom: 1rem; opacity: 0;
  transition: opacity .3s ease;
}
.phase-connected .verified-badge,
.phase-redirecting .verified-badge { opacity: 1; }

/* ━━ Result panel (hidden until connected) ━━━━━━━━━━━━━━━━━━━━ */

.result-panel {
  width: 100%;
  max-height: 0; overflow: hidden; opacity: 0;
  transition: max-height .5s cubic-bezier(.4,0,.2,1),
              opacity .4s ease .1s;
}
.phase-connected .result-panel,
.phase-redirecting .result-panel {
  max-height: 500px; opacity: 1;
}

.meta-card {
  width: 100%; border: 1px solid var(--border);
  border-radius: .5rem; overflow: hidden; margin-bottom: 1rem;
}
.meta-row {
  display: flex; justify-content: space-between; align-items: center;
  padding: .5rem .75rem; background: var(--surface); font-size: .78rem;
}
.meta-row + .meta-row { border-top: 1px solid var(--border2); }
.meta-key { color: var(--dim); }
.meta-val { color: var(--text); text-align: right; }
.meta-mono { font-family: 'SF Mono', Consolas, monospace; font-size: .72rem; }
.meta-hint { color: var(--dim); font-size: .7rem; }

.nwc-box {
  width: 100%; display: flex; align-items: center; gap: .5rem;
  padding: .6rem .75rem; background: var(--surface);
  border: 1px solid var(--border); border-radius: .5rem; margin-bottom: .5rem;
}
.nwc-box code {
  flex: 1; font-family: 'SF Mono', Consolas, monospace; font-size: .7rem;
  color: var(--muted); overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap; cursor: pointer;
}
.btn-copy {
  padding: .3rem .6rem; font-size: .75rem; font-weight: 500;
  color: var(--amber); background: rgba(245,158,11,.08);
  border: 1px solid rgba(245,158,11,.15); border-radius: .35rem;
  cursor: pointer; flex-shrink: 0; transition: background .15s ease;
}
.btn-copy:hover { background: rgba(245,158,11,.14); }

/* ━━ Error panel ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

.error-panel {
  width: 100%; max-height: 0; overflow: hidden; opacity: 0;
  transition: max-height .4s ease, opacity .3s ease .1s;
}
.phase-error .error-panel { max-height: 200px; opacity: 1; }

.error-msg {
  padding: .6rem .75rem; background: rgba(239,68,68,.06);
  border: 1px solid rgba(239,68,68,.2); border-radius: .4rem;
  font-size: .78rem; color: #f87171; text-align: center;
}

.btn-retry {
  display: block; margin: .75rem auto 0; padding: .5rem 1.5rem;
  font-size: .85rem; font-weight: 600; color: var(--text);
  background: var(--surface); border: 1px solid var(--border);
  border-radius: .5rem; cursor: pointer; transition: border-color .15s ease;
}
.btn-retry:hover { border-color: var(--muted); }

/* ━━ Responsive ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
@media (max-width: 480px) {
  .container { padding: 2rem 1rem 2.5rem; }
  .title { font-size: 1.2rem; }
}
</style>
</head>
<body>
<div id="app" class="container phase-connecting">

  <!-- Bridge SVG -->
  <div class="bridge">
    <svg viewBox="0 0 400 160" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="g-amber" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#f59e0b"/><stop offset="100%" stop-color="#d97706"/>
        </linearGradient>
        <linearGradient id="g-green" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#34d399"/><stop offset="100%" stop-color="#10b981"/>
        </linearGradient>
      </defs>

      <path class="bridge-track" d="M 80 80 C 160 80,160 80,200 80 C 240 80,240 80,320 80"/>
      <path class="bridge-path" d="M 80 80 C 160 80,160 80,200 80 C 240 80,240 80,320 80"/>

      <g class="signal">
        <circle r="4" fill="#34d399">
          <animateMotion dur="1.6s" repeatCount="indefinite" path="M 80 80 C 160 80,160 80,200 80 C 240 80,240 80,320 80"/>
        </circle>
      </g>

      <!-- Left node: app -->
      <circle cx="80" cy="80" r="28" class="node-bg"/>
      <circle cx="80" cy="80" r="28" class="node-ring node-ring-left"/>
      <foreignObject x="58" y="58" width="44" height="44">
        <div class="node-icon" xmlns="http://www.w3.org/1999/xhtml">${appIconHtml}</div>
      </foreignObject>

      <!-- Right node: NUTbits -->
      <circle cx="320" cy="80" r="28" class="node-bg"/>
      <circle cx="320" cy="80" r="28" class="node-ring node-ring-right"/>
      <foreignObject x="298" y="58" width="44" height="44">
        <div class="node-icon" xmlns="http://www.w3.org/1999/xhtml">${NUTBITS_LOGO_SVG}</div>
      </foreignObject>

      <text x="80" y="122" text-anchor="middle" fill="#625a52" font-size="11">${esc(appName.length > 14 ? appName.slice(0, 14) + '...' : appName)}</text>
      <text x="320" y="122" text-anchor="middle" fill="#625a52" font-size="11">NUTbits</text>

      <!-- Center: spinner (connecting) / check (connected) / ! (error) -->
      <g class="center-spinner-g" transform="translate(200,80)">
        <circle class="center-spinner" r="10" fill="none" stroke="#f59e0b" stroke-width="1.5" stroke-dasharray="16 48" stroke-linecap="round"/>
      </g>
      <path class="center-check" d="M 194 81 L 198 85 L 206 76" stroke="#34d399" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
      <text class="center-error" x="200" y="85" text-anchor="middle" fill="#ef4444" font-size="18" font-weight="700">!</text>
    </svg>
  </div>

  <h1 class="title" id="title">Connecting</h1>
  ${isKnownApp ? '<span class="verified-badge">Verified app</span>' : ''}
  <p class="subtitle" id="subtitle">Establishing dedicated NWC channel with <strong>${esc(appName)}</strong>...</p>

  <!-- Success panel (slides in) -->
  <div class="result-panel" id="result-panel">
    <div class="meta-card" id="meta-card"></div>
    <div id="nwc-area"></div>
  </div>

  <!-- Error panel (slides in) -->
  <div class="error-panel">
    <p class="error-msg" id="error-msg"></p>
    <button class="btn-retry" onclick="doConnect()">Try again</button>
  </div>

</div>

<script>
var APP_NAME = ${JSON.stringify(appName)};
var CALLBACK = ${JSON.stringify(callbackUri || '')};
var CONNECT_URL = ${JSON.stringify(connectEndpoint)};
var nwcFull = null;

function setPhase(p) {
  var el = document.getElementById('app');
  el.className = 'container phase-' + p;
}

function doConnect() {
  setPhase('connecting');
  document.getElementById('title').textContent = 'Connecting';
  document.getElementById('subtitle').innerHTML = 'Establishing dedicated NWC channel with <strong>' + escHtml(APP_NAME) + '</strong>...';

  fetch(CONNECT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  })
  .then(function(r) { return r.json(); })
  .then(function(data) {
    if (!data.ok) throw new Error(data.error || 'Connection failed');
    var d = data.data;
    nwcFull = d.nwc_string;

    // Build metadata
    var rows = '';
    rows += metaRow('Label', escHtml(d.label));
    if (d.app_pubkey) rows += metaRow('Pubkey', '<span class="meta-mono">' + d.app_pubkey.slice(0,12) + '...' + d.app_pubkey.slice(-8) + '</span>');
    rows += metaRow('Permissions', d.permissions.length + ' granted');
    if (d.mint) rows += metaRow('Mint', '<span class="meta-mono">' + escHtml(d.mint.replace(/^https?:\\/\\//, '').replace(/\\/+$/, '')) + '</span>');
    rows += metaRow('Balance', '0 sats <span class="meta-hint">(fund via NUTbits)</span>');
    document.getElementById('meta-card').innerHTML = rows;

    // NWC string area (no callback = show for copy)
    if (!CALLBACK && nwcFull) {
      var short = nwcFull.slice(0, 44) + '...' + nwcFull.slice(-10);
      document.getElementById('nwc-area').innerHTML =
        '<div class="nwc-box"><code onclick="copyNwc()">' + escHtml(short) + '</code>' +
        '<button class="btn-copy" onclick="copyNwc()">Copy</button></div>';
    }

    // Transition to connected
    setPhase('connected');
    document.getElementById('title').textContent = 'Connected';
    document.getElementById('subtitle').innerHTML = 'Dedicated NWC channel established. Fund it through NUTbits to start spending.';

    // Auto-redirect
    if (CALLBACK) {
      setTimeout(function() {
        setPhase('redirecting');
        document.getElementById('title').textContent = 'Redirecting';
        document.getElementById('subtitle').innerHTML = 'Returning to <strong>' + escHtml(APP_NAME) + '</strong>...';
        setTimeout(function() {
          var sep = CALLBACK.indexOf('?') !== -1 ? '&' : '?';
          window.location.href = CALLBACK + sep + 'value=' + encodeURIComponent(nwcFull);
        }, 600);
      }, 2000);
    }
  })
  .catch(function(err) {
    setPhase('error');
    document.getElementById('title').textContent = 'Connection Failed';
    document.getElementById('subtitle').textContent = '';
    document.getElementById('error-msg').textContent = err.message || 'Unknown error. Try again or connect manually.';
  });
}

function metaRow(key, val) {
  return '<div class="meta-row"><span class="meta-key">' + key + '</span><span class="meta-val">' + val + '</span></div>';
}

function copyNwc() {
  if (!nwcFull) return;
  navigator.clipboard.writeText(nwcFull).then(function() {
    var btn = document.querySelector('.btn-copy');
    if (btn) { btn.textContent = 'Copied!'; setTimeout(function() { btn.textContent = 'Copy'; }, 1500); }
  });
}

function escHtml(s) {
  var d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// Start immediately
doConnect();
</script>
</body>
</html>`;
}

function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
