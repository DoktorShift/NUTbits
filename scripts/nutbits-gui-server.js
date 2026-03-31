import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const distDir = path.join(rootDir, 'gui', 'dist')
const guiPort = Number(process.env.NUTBITS_GUI_PORT || 8080)
const guiHost = process.env.NUTBITS_GUI_HOST || '127.0.0.1'
const apiPort = Number(process.env.NUTBITS_API_PORT || 3338)
const apiHost = process.env.NUTBITS_API_HOST || '127.0.0.1'

const MIME_TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'application/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'],
  ['.ico', 'image/x-icon'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
])

if (!fs.existsSync(path.join(distDir, 'index.html'))) {
  console.error(`GUI build not found at ${distDir}. Run "npm run build:gui" first.`)
  process.exit(1)
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)

    if (url.pathname === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ ok: true }))
      return
    }

    if (url.pathname.startsWith('/api/')) {
      proxyApi(req, res, url)
      return
    }

    serveStatic(res, url.pathname)
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ ok: false, error: err.message }))
  }
})

server.listen(guiPort, guiHost, () => {
  console.log(`GUI: listening on http://${guiHost}:${guiPort}`)
})

function serveStatic(res, pathname) {
  const cleanPath = pathname === '/' ? '/index.html' : pathname
  const candidate = path.normalize(path.join(distDir, cleanPath))
  const isInsideDist = candidate === distDir || candidate.startsWith(distDir + path.sep)
  const filePath = isInsideDist && fs.existsSync(candidate) && fs.statSync(candidate).isFile()
    ? candidate
    : path.join(distDir, 'index.html')

  const ext = path.extname(filePath)
  const contentType = MIME_TYPES.get(ext) || 'application/octet-stream'
  const body = fs.readFileSync(filePath)

  res.writeHead(200, {
    'Content-Type': contentType,
    'Cache-Control': filePath.endsWith('index.html') ? 'no-store' : 'public, max-age=31536000, immutable',
  })
  res.end(body)
}

function proxyApi(req, res, url) {
  const proxyReq = http.request({
    host: apiHost,
    port: apiPort,
    method: req.method,
    path: `${url.pathname}${url.search}`,
    headers: req.headers,
  }, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 502, proxyRes.headers)
    proxyRes.pipe(res)
  })

  proxyReq.on('error', (err) => {
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' })
    }
    res.end(JSON.stringify({ ok: false, error: `API proxy error: ${err.message}` }))
  })

  req.pipe(proxyReq)
}
