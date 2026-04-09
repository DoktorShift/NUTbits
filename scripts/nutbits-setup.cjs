#!/usr/bin/env node

/**
 * NUTbits interactive setup wizard.
 *
 * Walks the user through creating a valid .env file.
 * Validates every input, prevents common mistakes,
 * and optionally generates a Caddyfile for VPS deployments.
 *
 * Usage:  npm run setup
 */

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const readline = require('readline')
const { execSync } = require('child_process')
const net = require('net')

const ROOT = path.resolve(__dirname, '..')
const ENV_PATH = path.join(ROOT, '.env')

// ── ANSI helpers ───────────────────────────────────────────────

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
}

const icons = {
  ok: `${c.green}✓${c.reset}`,
  fail: `${c.red}✗${c.reset}`,
  warn: `${c.yellow}!${c.reset}`,
  arrow: `${c.cyan}→${c.reset}`,
  bullet: `${c.dim}·${c.reset}`,
}

// ── Readline setup ─────────────────────────────────────────────

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })

// Graceful exit on Ctrl+C
rl.on('close', () => {
  console.log(`\n  ${c.dim}Setup completed.${c.reset}\n`)
  process.exit(0)
})

// ── Input helpers ──────────────────────────────────────────────

function ask(question, defaultValue) {
  const hint = defaultValue != null && defaultValue !== ''
    ? ` ${c.dim}[${defaultValue}]${c.reset}`
    : ''
  return new Promise(resolve => {
    rl.question(`  ${question}${hint}${c.dim}:${c.reset} `, answer => {
      resolve(answer.trim() || (defaultValue != null ? String(defaultValue) : ''))
    })
  })
}

function askSecret(question) {
  return new Promise(resolve => {
    process.stdout.write(`  ${question}${c.dim}:${c.reset} `)
    const wasRaw = process.stdin.isRaw
    if (process.stdin.isTTY) process.stdin.setRawMode(true)

    let buf = ''
    const onData = (ch) => {
      const s = ch.toString()
      if (s === '\n' || s === '\r') {
        if (process.stdin.isTTY) process.stdin.setRawMode(wasRaw || false)
        process.stdin.removeListener('data', onData)
        process.stdout.write('\n')
        resolve(buf)
      } else if (s === '\u007F' || s === '\b') {
        if (buf.length > 0) {
          buf = buf.slice(0, -1)
          process.stdout.write('\b \b')
        }
      } else if (s === '\u0003') {
        console.log()
        rl.close()
      } else {
        buf += s
        process.stdout.write('*')
      }
    }
    process.stdin.on('data', onData)
  })
}

async function confirm(question, defaultYes = true) {
  const hint = defaultYes ? 'Y/n' : 'y/N'
  const answer = await ask(`${question} ${c.dim}(${hint})${c.reset}`)
  if (!answer) return defaultYes
  return answer.toLowerCase().startsWith('y')
}

async function choose(question, options) {
  console.log()
  for (let i = 0; i < options.length; i++) {
    const opt = options[i]
    console.log(`  ${c.bold}${i + 1})${c.reset} ${opt.label}${opt.hint ? `  ${c.dim}${opt.hint}${c.reset}` : ''}`)
  }
  console.log()
  while (true) {
    const answer = await ask(question, '1')
    const idx = parseInt(answer, 10) - 1
    if (idx >= 0 && idx < options.length) return options[idx].value
    err(`Enter a number between 1 and ${options.length}`)
  }
}

// ── Output helpers ─────────────────────────────────────────────

function heading(text) {
  const w = Math.min(process.stdout.columns || 60, 60)
  console.log()
  console.log(`  ${c.yellow}${c.bold}${text}${c.reset}`)
  console.log(`  ${c.dim}${'─'.repeat(w - 4)}${c.reset}`)
}

function ok(text) { console.log(`  ${icons.ok} ${text}`) }
function err(text) { console.log(`  ${icons.fail} ${text}`) }
function warn(text) { console.log(`  ${icons.warn} ${text}`) }
function info(text) { console.log(`  ${icons.arrow} ${text}`) }

function randomToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString('base64url')
}

// ── Validators ─────────────────────────────────────────────────

function isValidUrl(str, protocols = ['https:']) {
  try {
    const u = new URL(str)
    return protocols.includes(u.protocol)
  } catch {
    return false
  }
}

function isValidRelayUrl(str) {
  try {
    const u = new URL(str)
    return u.protocol === 'wss:' || u.protocol === 'ws:'
  } catch {
    return false
  }
}

function isValidPort(str) {
  const n = parseInt(str, 10)
  return !isNaN(n) && n >= 1 && n <= 65535
}

function portInUse(port) {
  return new Promise(resolve => {
    const server = net.createServer()
    server.once('error', () => resolve(true))
    server.once('listening', () => { server.close(); resolve(false) })
    server.listen(port, '127.0.0.1')
  })
}

function cleanDomain(input) {
  let d = input.trim()
  d = d.replace(/^https?:\/\//, '')
  d = d.replace(/\/+$/, '')
  d = d.replace(/:\d+$/, '')
  return d
}

// Known NWC-friendly relays (for suggestions)
const GOOD_RELAYS = [
  'wss://relay.getalby.com/v1',
  'wss://relay.8333.space',
]

// Social relays that don't work well for NWC
const BAD_RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.nostr.band',
  'wss://nostr.wine',
  'wss://eden.nostr.land',
  'wss://relay.snort.social',
]

// ── Pre-flight checks ──────────────────────────────────────────

function preflight() {
  const problems = []

  // Node version
  const nodeVersion = parseInt(process.version.slice(1), 10)
  if (nodeVersion < 18) {
    problems.push(`Node.js ${process.version} is too old. NUTbits requires Node 18+.`)
  }

  // Are we in the right directory?
  if (!fs.existsSync(path.join(ROOT, 'nutbits.js'))) {
    problems.push('Cannot find nutbits.js. Run this from the NUTbits directory.')
  }

  // npm install done?
  if (!fs.existsSync(path.join(ROOT, 'node_modules'))) {
    problems.push('node_modules/ not found. Run: npm install')
  }

  // Running as root?
  if (process.getuid && process.getuid() === 0) {
    problems.push('Running as root. systemd --user services will not work. Use a regular user.')
  }

  return problems
}

// ── Guided input sections ──────────────────────────────────────

function fixMintUrl(raw) {
  let url = raw.trim().replace(/\/+$/, '')
  // Add https:// if no protocol
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url
  }
  return url
}

async function askMintUrl() {
  const defaultMint = 'https://mint.minibits.cash/Bitcoin'
  while (true) {
    const raw = await ask('Cashu mint URL', defaultMint)
    const url = fixMintUrl(raw)

    if (!isValidUrl(url, ['https:', 'http:'])) {
      err('Not a valid URL. Example: https://mint.minibits.cash/Bitcoin')
      continue
    }

    if (url !== raw.trim()) {
      info(`Fixed to: ${url}`)
    }

    if (url.startsWith('http://') && !url.includes('localhost') && !url.includes('127.0.0.1')) {
      warn('Using HTTP for a remote mint. HTTPS is strongly recommended.')
      const proceed = await confirm('Continue anyway?', false)
      if (!proceed) continue
    }

    return url
  }
}

async function askPassphrase() {
  while (true) {
    const pass = await askSecret('Encryption passphrase (min 8 characters)')
    if (pass.length < 8) {
      err('Too short. Use at least 8 characters.')
      continue
    }
    if (pass.startsWith(' ') || pass.endsWith(' ')) {
      warn('Passphrase has leading/trailing spaces — this is usually a mistake.')
      const keep = await confirm('Keep spaces?', false)
      if (!keep) continue
    }

    const confirm2 = await askSecret('Confirm passphrase')
    if (confirm2 !== pass) {
      err('Passphrases do not match. Try again.')
      continue
    }

    return pass
  }
}

async function askRelays() {
  console.log()
  for (const r of GOOD_RELAYS) {
    console.log(`  ${icons.bullet} ${r}`)
  }
  console.log()

  const useDefaults = await confirm('Use these relays?')
  if (useDefaults) return GOOD_RELAYS.join(',')

  // Custom relay entry
  while (true) {
    const input = await ask('Your relays (comma-separated)')
    let relays = input.split(',').map(r => r.trim()).filter(Boolean)

    if (relays.length === 0) {
      err('At least one relay is required.')
      continue
    }

    // Auto-fix missing wss:// prefix
    let fixed = false
    relays = relays.map(r => {
      if (!r.startsWith('wss://') && !r.startsWith('ws://')) {
        fixed = true
        return 'wss://' + r
      }
      return r
    })

    if (fixed) {
      info(`Fixed to: ${relays.join(', ')}`)
    }

    let hasError = false
    for (const r of relays) {
      if (!isValidRelayUrl(r)) {
        err(`Invalid relay URL: ${r}`)
        hasError = true
      }
    }
    if (hasError) continue

    // Warn about known bad relays
    const bad = relays.filter(r => BAD_RELAYS.some(b => r.startsWith(b)))
    if (bad.length > 0) {
      warn(`Social relays don't work well for NWC: ${bad.join(', ')}`)
      warn('Use NWC-friendly relays like relay.getalby.com/v1 or relay.8333.space')
      const keep = await confirm('Keep these relays anyway?', false)
      if (!keep) continue
    }

    return relays.join(',')
  }
}

async function askStorage() {
  const storage = await choose('Storage backend', [
    { value: 'sqlite', label: 'SQLite', hint: '(recommended)' },
    { value: 'file', label: 'File', hint: '(simple, single-process only)' },
    { value: 'mysql', label: 'MySQL', hint: '(advanced)' },
  ])

  let sqlitePath = ''
  let mysqlUrl = ''

  if (storage === 'sqlite') {
    sqlitePath = await ask('SQLite file path', './nutbits_state.db')
  } else if (storage === 'mysql') {
    while (true) {
      mysqlUrl = await ask('MySQL URL', 'mysql://user:pass@localhost:3306/nutbits')
      if (!mysqlUrl.startsWith('mysql://')) {
        err('Must start with mysql://')
        continue
      }
      break
    }
  }

  return { storage, sqlitePath, mysqlUrl }
}

async function askApiToken(isVps) {
  if (isVps) {
    const generated = randomToken()
    console.log()
    console.log(`  ${c.dim}A random token was generated for you:${c.reset}`)
    console.log(`  ${c.bold}${generated}${c.reset}`)
    console.log()
    const useIt = await confirm('Use this token?')
    if (useIt) return generated

    while (true) {
      const custom = await ask('Custom API token')
      if (custom.length < 8) {
        err('Token must be at least 8 characters for security.')
        continue
      }
      return custom
    }
  } else {
    const want = await confirm('Set a static API token?')
    if (!want) return ''
    return randomToken()
  }
}

async function askPort(label, defaultPort) {
  while (true) {
    const input = await ask(`${label} port`, String(defaultPort))
    if (!input) return ''

    if (!isValidPort(input)) {
      err('Must be a number between 1 and 65535.')
      continue
    }

    const port = parseInt(input, 10)
    const used = await portInUse(port)
    if (used) {
      warn(`Port ${port} is already in use.`)
      const keep = await confirm('Use it anyway?', false)
      if (!keep) continue
    }

    return String(port)
  }
}

async function askDomain() {
  while (true) {
    const raw = await ask('Your domain', 'nutbits.example.com')
    const domain = cleanDomain(raw)

    if (!domain || domain.includes(' ')) {
      err('Enter a valid domain name.')
      continue
    }

    // Check for IP addresses
    if (/^\d+\.\d+\.\d+\.\d+$/.test(domain)) {
      warn('Caddy auto-TLS requires a domain name, not an IP address.')
      const keep = await confirm('Continue with IP?', false)
      if (!keep) continue
    }

    if (domain === 'nutbits.example.com') {
      err('Replace with your actual domain.')
      continue
    }

    if (raw !== domain) {
      info(`Cleaned to: ${domain}`)
    }

    return domain
  }
}

// ── Main ───────────────────────────────────────────────────────

async function main() {
  const w = Math.min(process.stdout.columns || 60, 60)
  console.log()
  console.log(`  ${c.yellow}${c.bold}NUTbits Setup Wizard${c.reset}`)
  console.log(`  ${c.dim}${'═'.repeat(w - 4)}${c.reset}`)
  console.log()
  console.log(`  ${c.dim}Creates your .env file step by step.`)
  console.log(`  Press Enter to accept defaults in [brackets].`)
  console.log(`  Press Ctrl+C at any time to cancel.${c.reset}`)

  // ── Pre-flight ─────────────────────────────────────────────

  heading('Pre-flight checks')

  const problems = preflight()
  if (problems.length > 0) {
    for (const p of problems) err(p)
    console.log()
    err('Fix the issues above before running setup.')
    rl.close()
    process.exit(1)
  }

  ok(`Node ${process.version}`)
  ok('NUTbits directory found')
  ok('Dependencies installed')
  if (process.getuid && process.getuid() !== 0) ok('Running as non-root user')

  // ── Existing .env ──────────────────────────────────────────

  if (fs.existsSync(ENV_PATH)) {
    console.log()
    warn('.env already exists.')

    const existingContent = fs.readFileSync(ENV_PATH, 'utf-8')
    const hasPassphrase = /^NUTBITS_STATE_PASSPHRASE=.+/m.test(existingContent)
    const hasMint = /^NUTBITS_MINT_URL=.+/m.test(existingContent)

    if (hasPassphrase && hasMint) {
      info('It looks complete (has mint URL and passphrase).')
    } else {
      warn('It looks incomplete — missing required values.')
    }

    const action = await choose('What do you want to do?', [
      { value: 'overwrite', label: 'Start fresh', hint: '(new .env from scratch)' },
      { value: 'exit', label: 'Keep it', hint: '(exit wizard)' },
    ])

    if (action === 'exit') {
      info('Keeping existing .env. Run `npm start` to test it.')
      rl.close()
      return
    }

    // Backup the old one
    const backupPath = ENV_PATH + '.bak'
    fs.copyFileSync(ENV_PATH, backupPath)
    ok(`Backed up old .env to .env.bak`)
  }

  // ── Deploy mode ────────────────────────────────────────────

  heading('Deploy mode')

  const isVps = await choose('Where will NUTbits run?', [
    { value: false, label: 'Local', hint: '(your own machine, dev, testing)' },
    { value: true, label: 'VPS', hint: '(public server with domain + HTTPS)' },
  ])

  // ── Mint ───────────────────────────────────────────────────

  heading('Cashu Mint')
  console.log(`  ${c.dim}This is the mint NUTbits will connect to.`)
  console.log(`  Find mints at: https://bitcoinmints.com${c.reset}`)

  const mintUrl = await askMintUrl()
  ok(mintUrl)

  // ── Passphrase ─────────────────────────────────────────────

  heading('Encryption Passphrase')
  console.log(`  ${c.dim}Encrypts your ecash proofs at rest.`)
  console.log(`  Choose something strong. You'll need it for backups.${c.reset}`)

  const passphrase = await askPassphrase()
  ok('Passphrase set and confirmed')

  // ── Relays ─────────────────────────────────────────────────

  heading('Nostr Relays')
  console.log(`  ${c.dim}NWC messages travel through these relays.`)
  console.log(`  Use NWC-friendly relays, not general social relays.${c.reset}`)

  const relays = await askRelays()
  ok(`${relays.split(',').length} relay(s) configured`)

  // ── Storage ────────────────────────────────────────────────

  heading('Storage')
  console.log(`  ${c.dim}How NUTbits stores wallet state.${c.reset}`)

  const { storage, sqlitePath, mysqlUrl } = await askStorage()
  ok(`Using ${storage}`)

  // ── API ────────────────────────────────────────────────────

  heading('Management API')

  if (isVps) {
    console.log(`  ${c.dim}The API token is your password for the browser GUI.`)
    console.log(`  It must be set explicitly for VPS deployments.${c.reset}`)
  }

  const apiToken = await askApiToken(isVps)
  if (apiToken) ok('API token set')

  const defaultApiPort = isVps ? '3338' : ''
  const apiPort = isVps
    ? await askPort('API', 3338)
    : await askPort('API (empty = socket only)', '')

  let guiHost = ''
  let guiPort = ''
  if (isVps || apiPort) {
    guiHost = '127.0.0.1'
    guiPort = await askPort('GUI', 8080)
  }

  // ── Caddy (VPS only) ──────────────────────────────────────

  let domain = ''
  let caddyContent = ''

  if (isVps) {
    heading('Caddy reverse proxy')
    console.log(`  ${c.dim}Caddy provides HTTPS and proxies traffic to NUTbits.${c.reset}`)

    const wantCaddy = await confirm('Generate a Caddyfile?')
    if (wantCaddy) {
      domain = await askDomain()

      caddyContent = [
        `${domain} {`,
        '    encode gzip zstd',
        '',
        `    @api path /api/* /connect /app-icons/*`,
        `    reverse_proxy @api 127.0.0.1:${apiPort || '3338'}`,
        '',
        `    reverse_proxy 127.0.0.1:${guiPort || '8080'}`,
        '}',
        '',
      ].join('\n')
    }
  }

  // ── Summary ────────────────────────────────────────────────

  heading('Review')

  const summary = [
    ['Mode', isVps ? 'VPS' : 'Local'],
    ['Mint', mintUrl],
    ['Passphrase', '***'],
    ['Relays', relays.split(',').length + ' relay(s)'],
    ['Storage', storage + (sqlitePath ? ` (${sqlitePath})` : '')],
    ['API port', apiPort || 'socket only'],
    ['API token', apiToken ? apiToken.slice(0, 8) + '...' : 'auto-generated'],
    ['GUI', guiPort ? `${guiHost}:${guiPort}` : 'not configured'],
  ]

  if (domain) summary.push(['Domain', domain])

  const maxLabel = Math.max(...summary.map(([l]) => l.length))
  for (const [label, value] of summary) {
    console.log(`  ${c.dim}${label.padEnd(maxLabel)}${c.reset}  ${value}`)
  }

  console.log()
  const proceed = await confirm('Write .env with these settings?')
  if (!proceed) {
    info('Cancelled. No files written.')
    rl.close()
    return
  }

  // ── Write .env ─────────────────────────────────────────────

  heading('Writing files')

  const lines = [
    '# ── NUTbits (generated by setup wizard) ─────────────────────',
    `# Created: ${new Date().toISOString().slice(0, 10)}`,
    '',
    `NUTBITS_MINT_URL=${mintUrl}`,
    `NUTBITS_STATE_PASSPHRASE=${passphrase}`,
    '',
    `NUTBITS_RELAYS=${relays}`,
    '',
    `NUTBITS_STATE_BACKEND=${storage}`,
  ]

  if (sqlitePath) lines.push(`NUTBITS_SQLITE_PATH=${sqlitePath}`)
  if (mysqlUrl) lines.push(`NUTBITS_MYSQL_URL=${mysqlUrl}`)

  lines.push('')
  lines.push('NUTBITS_API_ENABLED=true')
  if (apiPort) lines.push(`NUTBITS_API_PORT=${apiPort}`)
  if (apiToken) lines.push(`NUTBITS_API_TOKEN=${apiToken}`)

  if (guiHost) {
    lines.push('')
    lines.push(`NUTBITS_GUI_HOST=${guiHost}`)
  }
  if (guiPort) lines.push(`NUTBITS_GUI_PORT=${guiPort}`)

  lines.push('')

  fs.writeFileSync(ENV_PATH, lines.join('\n') + '\n', 'utf-8')
  fs.chmodSync(ENV_PATH, 0o600)
  ok(`.env written (permissions: 600)`)

  // Write Caddyfile
  if (caddyContent) {
    const caddyPath = path.join(ROOT, 'Caddyfile')
    fs.writeFileSync(caddyPath, caddyContent, 'utf-8')
    ok('Caddyfile written')
  }

  // ── Install SQLite driver ──────────────────────────────────

  if (storage === 'sqlite') {
    const bsqlitePath = path.join(ROOT, 'node_modules', 'better-sqlite3')
    if (!fs.existsSync(bsqlitePath)) {
      info('Installing better-sqlite3...')
      try {
        execSync('npm install better-sqlite3', { cwd: ROOT, stdio: 'pipe' })
        ok('better-sqlite3 installed')
      } catch (e) {
        err('Failed to install better-sqlite3.')
        warn('You may need build tools: sudo apt install -y build-essential python3')
        warn('Then run: npm install better-sqlite3')
      }
    } else {
      ok('better-sqlite3 already installed')
    }
  }

  // ── MySQL driver ───────────────────────────────────────────

  if (storage === 'mysql') {
    const mysql2Path = path.join(ROOT, 'node_modules', 'mysql2')
    if (!fs.existsSync(mysql2Path)) {
      info('Installing mysql2...')
      try {
        execSync('npm install mysql2', { cwd: ROOT, stdio: 'pipe' })
        ok('mysql2 installed')
      } catch {
        err('Failed to install mysql2. Run: npm install mysql2')
      }
    } else {
      ok('mysql2 already installed')
    }
  }

  // ── Next steps ─────────────────────────────────────────────

  heading('Done — next steps')
  console.log()

  if (isVps) {
    console.log(`  ${c.bold}1.${c.reset} Install and start services:`)
    console.log(`     ${c.cyan}npm run service:linux${c.reset}`)
    console.log(`     ${c.cyan}loginctl enable-linger "$USER"${c.reset}`)

    if (domain) {
      console.log()
      console.log(`  ${c.bold}2.${c.reset} Set up Caddy:`)
      console.log(`     ${c.cyan}sudo cp Caddyfile /etc/caddy/Caddyfile${c.reset}`)
      console.log(`     ${c.cyan}sudo caddy validate --config /etc/caddy/Caddyfile${c.reset}`)
      console.log(`     ${c.cyan}sudo systemctl enable caddy${c.reset}`)
      console.log(`     ${c.cyan}sudo systemctl reload caddy${c.reset}`)
      console.log()
      console.log(`  ${c.bold}3.${c.reset} Open ${c.bold}https://${domain}${c.reset} and log in.`)
    } else {
      console.log()
      console.log(`  ${c.bold}2.${c.reset} Verify it works:`)
      console.log(`     ${c.cyan}curl -H "Authorization: Bearer ${(apiToken || 'YOUR_TOKEN').slice(0, 12)}..." http://127.0.0.1:${apiPort || '3338'}/api/v1/status${c.reset}`)
    }

    if (apiToken) {
      console.log()
      console.log(`  ${c.yellow}${c.bold}Your API token (save this):${c.reset}`)
      console.log(`  ${c.bold}${apiToken}${c.reset}`)
      console.log(`  ${c.dim}Use this to log into the browser GUI.${c.reset}`)
    }
  } else {
    console.log(`  ${c.bold}1.${c.reset} Start NUTbits:`)
    console.log(`     ${c.cyan}npm start${c.reset}`)
    console.log()
    console.log(`  ${c.bold}2.${c.reset} Copy the NWC connection string from the first-run output.`)
    console.log()
    console.log(`  ${c.bold}3.${c.reset} Paste it into LNbits or any NWC-compatible app.`)

    if (apiToken) {
      console.log()
      console.log(`  ${c.dim}API token: ${apiToken.slice(0, 8)}...${c.reset}`)
    }
  }

  console.log()
  console.log(`  ${c.dim}Run ${c.reset}npm run setup${c.dim} again at any time to reconfigure.${c.reset}`)
  console.log()

  rl.close()
}

main().catch(e => {
  console.error(`\n  ${c.red}Setup failed:${c.reset} ${e.message}\n`)
  process.exit(1)
})
