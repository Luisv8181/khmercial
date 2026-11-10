// server.mjs
// Zero-dependency HTTP server for the Sokha Mart demo.
// Serves the chat page from public/ and a small JSON API:
//   POST /api/chat             { sessionId, text } -> bot reply
//   POST /api/handover/resume { sessionId }        -> resume a paused session
//   GET  /api/enquiries       -> the enquiries log
//   GET  /api/health          -> { ok: true }
//
// Enquiries are kept in memory and appended to data/enquiries.csv.
// Every request is logged to stdout as one JSON line.
//
// SECURITY POSTURE (see docs/security-review.md):
// - Local demo server only. It binds 127.0.0.1 by default (HOST env can
//   override) and has no authentication, so do NOT expose it to the
//   internet. The public deployment is the static build (see netlify.toml),
//   which has no server and no enquiry endpoint.
// - /api/enquiries returns names and phone numbers. It is loopback-only
//   by code (see isLoopback) and the server binds 127.0.0.1 by default,
//   so there is no public access to it. Never point this server at real
//   customer data.
// - POST routes reject cross-origin Origin headers (CSRF guard).
// - Wrong-method API calls get 405.
// - Responses carry security headers (CSP, X-Frame-Options, nosniff).
// - /api/* is rate limited per IP (60 requests per minute).
// - Chat text is capped at 2000 characters.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadData, csvEscape } from './src/data.js';
import { createBot } from './src/bot.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
// Default to loopback only. Set HOST=0.0.0.0 explicitly if you really
// need the demo reachable on a local network, and only then.
const HOST = process.env.HOST || '127.0.0.1';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const PUBLIC_DIR = path.join(__dirname, 'public');
const ENQUIRIES_FILE = path.join(DATA_DIR, 'enquiries.csv');
const ENQUIRIES_HEADER = 'timestamp,name,phone,product,message,language,status';

// Upper bound on one chat message. The bot is a keyword matcher; longer
// input adds nothing and only grows the (optional) AI prompt.
const MAX_MESSAGE_CHARS = 2000;

// Rate limit: requests per IP per window on /api/* routes.
const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

const data = loadData(DATA_DIR);
const bot = createBot({
  products: data.products,
  faqs: data.faqs,
  handover: data.handover,
  apiKey: process.env.GEMINI_API_KEY || null,
});

// In-memory enquiries log, seeded with the rows already on disk.
const enquiries = [...data.enquiries];

function appendEnquiryToDisk(enquiry) {
  try {
    if (!fs.existsSync(ENQUIRIES_FILE)) {
      fs.mkdirSync(path.dirname(ENQUIRIES_FILE), { recursive: true });
      fs.writeFileSync(ENQUIRIES_FILE, ENQUIRIES_HEADER + '\n', 'utf8');
    }
    const row = [
      new Date().toISOString(),
      enquiry.name || '',
      enquiry.phone || '',
      enquiry.product || '',
      enquiry.message || '',
      enquiry.language || '',
      'new',
    ]
      .map(csvEscape)
      .join(',');
    fs.appendFileSync(ENQUIRIES_FILE, row + '\n', 'utf8');
  } catch (err) {
    console.error(JSON.stringify({ level: 'error', where: 'enquiry-append', message: String(err) }));
  }
}

function logRequest({ method, path: reqPath, sessionId, language, source, handover }) {
  console.log(
    JSON.stringify({
      method,
      path: reqPath,
      sessionId: sessionId || null,
      language: language || null,
      source: source || null,
      handover: handover || false,
    }),
  );
}

// Security headers on every response. The page uses no inline script or
// style (see public/app.js and public/styles.css), so the CSP can be
// strict: same-origin everything, no framing, no plugins.
const SECURITY_HEADERS = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; '),
};

function setSecurityHeaders(res) {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    res.setHeader(name, value);
  }
}

// Fixed-window per-IP rate limiter. Returns true when the request may
// proceed, false when it must be rejected with 429.
const rateBuckets = new Map();
function allowRequest(req) {
  const ip = req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  let bucket = rateBuckets.get(ip);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
    rateBuckets.set(ip, bucket);
  }
  bucket.count += 1;
  return bucket.count <= RATE_LIMIT_MAX;
}

// Loopback-only: the enquiry log holds names and phone numbers, so it
// is served only to clients on this machine. The public deployment is
// the static build, which has no enquiry endpoint at all.
function isLoopback(req) {
  const remote = req.socket.remoteAddress || '';
  return remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1';
}

// CSRF guard for state-changing routes: the demo sets no cookies, so
// there is nothing to steal, but a cross-origin page could still fire
// POSTs at the API. Reject a POST whose Origin header names another
// origin. Requests with no Origin header (curl, same-origin fetch)
// are allowed.
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  const host = req.headers.host || '';
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function serveStatic(req, res, reqPath) {
  const rel = reqPath === '/' ? 'index.html' : reqPath.replace(/^\//, '');
  const full = path.normalize(path.join(PUBLIC_DIR, rel));
  // Path traversal guard: the resolved file must stay inside public/.
  // path.relative is the safe boundary check: a bare startsWith on
  // PUBLIC_DIR would also match a sibling directory sharing the
  // prefix (for example public-evil). Note new URL() also normalises
  // dot segments in the path before we get here, so "/../server.mjs"
  // never reaches this check as "..".
  const relative = path.relative(PUBLIC_DIR, full);
  if (
    relative.startsWith('..' + path.sep) ||
    relative === '..' ||
    path.isAbsolute(relative) ||
    !fs.existsSync(full) ||
    !fs.statSync(full).isFile()
  ) {
    setSecurityHeaders(res);
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
    return;
  }
  const ext = path.extname(full).toLowerCase();
  setSecurityHeaders(res);
  res.writeHead(200, { 'Content-Type': CONTENT_TYPES[ext] || 'application/octet-stream' });
  fs.createReadStream(full).pipe(res);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 100 * 1024) {
        req.destroy();
        reject(new Error('body too large'));
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, obj) {
  setSecurityHeaders(res);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const reqPath = url.pathname;

  try {
    // Rate limit every /api/* route.
    if (reqPath.startsWith('/api/') && !allowRequest(req)) {
      logRequest({ method: req.method, path: reqPath });
      return sendJson(res, 429, { error: 'too many requests' });
    }

    // Known API routes with the wrong method get 405, not 404.
    const API_ROUTES = {
      '/api/health': ['GET'],
      '/api/enquiries': ['GET'],
      '/api/chat': ['POST'],
      '/api/handover/resume': ['POST'],
    };
    if (API_ROUTES[reqPath] && !API_ROUTES[reqPath].includes(req.method)) {
      logRequest({ method: req.method, path: reqPath });
      return sendJson(res, 405, { error: 'method not allowed' });
    }

    if (req.method === 'GET' && reqPath === '/api/health') {
      logRequest({ method: req.method, path: reqPath });
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === 'GET' && reqPath === '/api/enquiries') {
      logRequest({ method: req.method, path: reqPath });
      // Loopback-only by construction, not just by documentation: a
      // request from any other interface gets a 404, as if the route
      // did not exist.
      if (!isLoopback(req)) {
        return sendJson(res, 404, { error: 'not found' });
      }
      return sendJson(res, 200, { enquiries });
    }

    if (req.method === 'POST' && reqPath === '/api/chat') {
      if (!sameOrigin(req)) {
        logRequest({ method: req.method, path: reqPath });
        return sendJson(res, 403, { error: 'forbidden' });
      }
      const body = await readJsonBody(req);
      const sessionId = String(body.sessionId || 'default');
      const text = String(body.text || '');
      if (text.length > MAX_MESSAGE_CHARS) {
        logRequest({ method: req.method, path: reqPath, sessionId });
        return sendJson(res, 400, { error: 'message too long' });
      }
      const result = await bot.handleMessage({ sessionId, text });
      if (result.enquiry) {
        enquiries.push({
          timestamp: new Date().toISOString(),
          name: result.enquiry.name,
          phone: result.enquiry.phone,
          product: result.enquiry.product || '',
          message: result.enquiry.message,
          language: result.enquiry.language,
          status: 'new',
        });
        appendEnquiryToDisk(result.enquiry);
        // Bound the in-memory log; the CSV on disk is the full record.
        if (enquiries.length > 500) enquiries.shift();
      }
      logRequest({
        method: req.method,
        path: reqPath,
        sessionId,
        language: result.language,
        source: result.source,
        handover: result.handover,
      });
      return sendJson(res, 200, result);
    }

    if (req.method === 'POST' && reqPath === '/api/handover/resume') {
      if (!sameOrigin(req)) {
        logRequest({ method: req.method, path: reqPath });
        return sendJson(res, 403, { error: 'forbidden' });
      }
      const body = await readJsonBody(req);
      const sessionId = String(body.sessionId || 'default');
      const resumed = bot.resumeSession(sessionId);
      logRequest({ method: req.method, path: reqPath, sessionId });
      return sendJson(res, 200, { ok: true, resumed });
    }

    if (req.method === 'GET') {
      logRequest({ method: req.method, path: reqPath });
      return serveStatic(req, res, reqPath);
    }

    logRequest({ method: req.method, path: reqPath });
    return sendJson(res, 404, { error: 'not found' });
  } catch (err) {
    logRequest({ method: req.method, path: reqPath });
    // Body errors (invalid JSON, body too large) are the caller's fault:
    // 400 with the message. Anything else is ours: 500 with a generic
    // message so internal details never leak to the client.
    if (err && (err.message === 'invalid JSON' || err.message === 'body too large')) {
      return sendJson(res, 400, { error: err.message });
    }
    console.error(JSON.stringify({ level: 'error', where: 'request', path: reqPath, message: String(err) }));
    return sendJson(res, 500, { error: 'internal error' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(
    JSON.stringify({
      level: 'info',
      message: `Sokha Mart demo listening on http://${HOST}:${PORT}`,
      products: data.products.length,
      faqs: data.faqs.length,
      handoverRules: data.handover.length,
      enquiries: enquiries.length,
    }),
  );
});
