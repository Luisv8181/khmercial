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

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadData, csvEscape } from './src/data.js';
import { createBot } from './src/bot.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const PUBLIC_DIR = path.join(__dirname, 'public');
const ENQUIRIES_FILE = path.join(DATA_DIR, 'enquiries.csv');
const ENQUIRIES_HEADER = 'timestamp,name,phone,product,message,language,status';

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
  if (!full.startsWith(PUBLIC_DIR) || !fs.existsSync(full) || !fs.statSync(full).isFile()) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
    return;
  }
  const ext = path.extname(full).toLowerCase();
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
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const reqPath = url.pathname;

  try {
    if (req.method === 'GET' && reqPath === '/api/health') {
      logRequest({ method: req.method, path: reqPath });
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === 'GET' && reqPath === '/api/enquiries') {
      logRequest({ method: req.method, path: reqPath });
      return sendJson(res, 200, { enquiries });
    }

    if (req.method === 'POST' && reqPath === '/api/chat') {
      const body = await readJsonBody(req);
      const sessionId = String(body.sessionId || 'default');
      const text = String(body.text || '');
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
    return sendJson(res, 400, { error: String(err && err.message ? err.message : err) });
  }
});

server.listen(PORT, () => {
  console.log(
    JSON.stringify({
      level: 'info',
      message: `Sokha Mart demo listening on port ${PORT}`,
      products: data.products.length,
      faqs: data.faqs.length,
      handoverRules: data.handover.length,
      enquiries: enquiries.length,
    }),
  );
});
