// build-static.mjs
// Builds the public static demo into static/ for Netlify deployment.
// Zero dependencies. Run: node scripts/build-static.mjs
//
// The public build is customer-chat-only:
//   - No staff view, no enquiry storage of any kind (no localStorage,
//     no sessionStorage, no /api/* calls), no server. The enquiry flow
//     still runs in the chat (the bot asks for name and phone and shows
//     the confirmation) and that is the end of it: nothing is stored.
//   - The bot runs in the browser, bundled from src/bot.js with data
//     generated from data/*.csv. With no API key, src/ai.js returns
//     null and the bot behaves identically to the Node version.
//   - The full app with the staff view stays in the local Node version
//     (server.mjs + public/). This script only reads those files.
//
// Output (static/):
//   index.html  public/index.html minus the staff view, plus a line
//               stating the public demo stores nothing
//   app.js      public/app.js with the transport layer replaced by
//               direct in-browser bot calls (ES module)
//   bot.js      verbatim copy of src/bot.js
//   ai.js       verbatim copy of src/ai.js (no key; aiAssist returns null)
//   data.js     GENERATED from data/products.csv, data/faqs.csv and
//               data/handover.csv (src/data.js uses Node fs and cannot
//               run in a browser; enquiries data is never included)
//   styles.css  verbatim copy of public/styles.css
// No source maps are emitted. No API key is written to the output.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsv } from '../src/data.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'static');

const STORES_NOTHING =
  'This public demo stores nothing: your messages stay in this browser session and are never sent anywhere.';

// Replace `old` in `text`, failing loudly if it is not found exactly
// once. A silent no-op here would ship a broken or server-coupled
// static build, so every transform asserts.
function replaceOnce(text, old, replacement, label) {
  const count = text.split(old).length - 1;
  if (count !== 1) {
    throw new Error(`build-static: expected exactly 1 occurrence of ${label}, found ${count}`);
  }
  return text.replace(old, replacement);
}

function replaceRegexOnce(text, re, replacement, label) {
  const matches = text.match(re);
  if (!matches || matches.length !== 1) {
    throw new Error(`build-static: expected exactly 1 match for ${label}, found ${matches ? matches.length : 0}`);
  }
  return text.replace(re, replacement);
}

function buildIndex() {
  let html = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');

  // Staff view section (comment + <section id="staffView"> ... </section>).
  html = replaceRegexOnce(
    html,
    /[ ]*<!-- Staff view -->\n[ ]*<section id="staffView"[\s\S]*?<\/section>\n/,
    '',
    'staff view section',
  );

  // Staff-view toggle button in the banner (no staff view to toggle to).
  html = replaceOnce(
    html,
    '      <button type="button" class="btn" id="viewToggle" data-i18n="staffView">Staff view</button>\n',
    '',
    'viewToggle button',
  );

  // The error box referenced a local demo server; there is none in the
  // static build, so say so plainly instead of telling the visitor to
  // start one.
  html = replaceOnce(
    html,
    'Demo server not running. Start it with: npm start',
    'Something went wrong. Please reload the page and try again.',
    'error-box text',
  );

  // State the no-storage guarantee next to the existing demo-only note.
  html = replaceOnce(
    html,
    '    <p class="note">Demo only: please use sample details, not your real name or phone number.</p>',
    '    <p class="note">Demo only: please use sample details, not your real name or phone number.</p>\n' +
      `    <p class="note">${STORES_NOTHING}</p>`,
    'demo-only note',
  );

  // Load the chat code as an ES module (it imports the bundled bot).
  html = replaceOnce(
    html,
    '<script src="/app.js"></script>',
    '<script type="module" src="/app.js"></script>',
    'app.js script tag',
  );

  return html;
}

function buildApp() {
  let js = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');

  // ES module imports + the in-browser bot instance, above the IIFE.
  // The bot gets no apiKey, so the optional AI rerank stays off and the
  // bot behaves identically to the Node version.
  const header =
    "import { createBot } from './bot.js';\n" +
    "import { products, faqs, handover } from './data.js';\n" +
    '\n' +
    '// Static build: the bot runs in this browser, not on a server.\n' +
    '// No API key is configured, so the optional AI rerank stays off.\n' +
    'const bot = createBot({ products, faqs, handover });\n' +
    '\n';
  if (!js.startsWith('(function () {')) {
    throw new Error('build-static: public/app.js no longer starts with the expected IIFE');
  }
  js = header + js;

  // The staff-view elements are gone from the static page, so the
  // session-state pill no longer exists. Guard the updater and drop
  // the removed session-id label instead of touching a null element.
  js = replaceOnce(
    js,
    '  var sessionIdLabel = document.getElementById("sessionIdLabel");\n',
    '',
    'sessionIdLabel lookup',
  );
  js = replaceOnce(
    js,
    '  sessionIdLabel.textContent = sessionId;\n',
    '',
    'sessionIdLabel assignment',
  );
  js = replaceOnce(
    js,
    '  function updateSessionState() {\n    var s = STRINGS[lang];',
    '  function updateSessionState() {\n    if (!sessionStateEl) { return; }\n    var s = STRINGS[lang];',
    'updateSessionState guard',
  );

  // Transport layer: replace the fetch-based API calls with direct
  // in-browser bot calls. apiChat resolves to the same reply object
  // the server used to return; apiResume mirrors the server's
  // { ok, resumed } shape.
  const serverTransport = `  // Transport layer. Server mode talks to the Node API below.
  // STATIC-BUILD: the static build replaces apiChat, apiResume,
  // apiEnquiries, and recordEnquiry with in-browser equivalents (the
  // bot runs locally; the public build keeps no enquiry store at all).
  // Responses are checked for res.ok first: a 400/429/500 from the
  // server used to render as an empty bot bubble.
  function checkOk(res) {
    if (!res.ok) {
      var err = new Error("request failed: " + res.status);
      err.status = res.status;
      throw err;
    }
    return res.json();
  }
  function apiChat(sessionId, text) {
    return fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: sessionId, text: text })
    }).then(checkOk);
  }
  function apiResume(sessionId) {
    return fetch("/api/handover/resume", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: sessionId })
    }).then(checkOk);
  }
  function apiEnquiries() {
    return fetch("/api/enquiries").then(checkOk);
  }`;
  const staticTransport = `  // Transport layer (static build). There is no server and no API:
  // the bot bundled above answers directly, in this browser.
  function apiChat(sessionId, text) {
    return bot.handleMessage({ sessionId: sessionId, text: text });
  }
  function apiResume(sessionId) {
    return Promise.resolve({ ok: true, resumed: bot.resumeSession(sessionId) });
  }`;
  js = replaceOnce(js, serverTransport, staticTransport, 'server transport block');

  // Enquiry recording: a no-op. The public build stores nothing: the
  // enquiry flow still shows its confirmation in the chat, and the
  // name/phone the visitor typed live only in that page session and
  // are never saved or sent anywhere.
  js = replaceOnce(
    js,
    `  // Server mode: the server already stored the enquiry, so this is a
  // no-op. The static build overrides it (and in the public build the
  // enquiry is not stored anywhere).
  function recordEnquiry(enquiry) { return; }`,
    `  // Static build: the public demo stores nothing, so recording an
  // enquiry is a deliberate no-op. The confirmation the visitor sees
  // in the chat is the end of it: no enquiry is saved, in this
  // browser or anywhere else.
  function recordEnquiry(enquiry) { return; }`,
    'recordEnquiry',
  );

  // Staff wiring: the staff resume button, the view toggle, and the
  // enquiries table are all gone with the staff view.
  js = replaceOnce(
    js,
    '  document.getElementById("resumeBtnStaff").addEventListener("click", resumeBot);\n',
    '',
    'staff resume button wiring',
  );
  const viewToggleBlock = `  // View toggle: customer chat <-> staff view.
  var customerView = document.getElementById("customerView");
  var staffView = document.getElementById("staffView");
  var viewToggle = document.getElementById("viewToggle");
  var staffOpen = false;

  function setStaffOpen(open) {
    staffOpen = open;
    customerView.hidden = open;
    staffView.hidden = !open;
    viewToggle.textContent = open ? STRINGS[lang].customerView : STRINGS[lang].staffView;
    if (open) { loadEnquiries(); }
  }

  viewToggle.addEventListener("click", function () {
    setStaffOpen(!staffOpen);
  });
`;
  js = replaceOnce(js, viewToggleBlock, '', 'view toggle block');
  const staffEnquiriesBlock = `  // Staff enquiries.
  var enquiriesTable = document.getElementById("enquiriesTable");
  var enquiriesBody = document.getElementById("enquiriesBody");
  var enquiriesEmpty = document.getElementById("enquiriesEmpty");
  var staffError = document.getElementById("staffError");

  function loadEnquiries() {
    staffError.hidden = true;
    apiEnquiries()
      .then(function (data) {
        var list = (data && data.enquiries) || [];
        enquiriesBody.innerHTML = "";
        if (!list.length) {
          enquiriesTable.hidden = true;
          enquiriesEmpty.hidden = false;
          return;
        }
        enquiriesEmpty.hidden = true;
        enquiriesTable.hidden = false;
        list.forEach(function (row) {
          var tr = document.createElement("tr");
          var cells = [
            row.timestamp || "",
            row.name || "",
            row.phone || "",
            row.product || "",
            row.message || "",
            row.language || "",
            row.status || ""
          ];
          cells.forEach(function (value) {
            var td = document.createElement("td");
            td.textContent = value;
            tr.appendChild(td);
          });
          enquiriesBody.appendChild(tr);
        });
      })
      .catch(function (err) {
        console.error("enquiries error", err && err.message ? err.message : err);
        staffError.hidden = false;
      });
  }

  document.getElementById("refreshBtn").addEventListener("click", loadEnquiries);
`;
  js = replaceOnce(js, staffEnquiriesBlock, '', 'staff enquiries block');

  // Staff-only chrome strings in the i18n dictionary (labels for the
  // removed staff view). They are dead strings once the view is gone;
  // strip them so no staff-view text ships in the public build.
  const staffStringKeys = [
    'staffView', 'customerView', 'staffTitle', 'sessionState',
    'sessionLabel', 'resumeBot', 'refresh', 'enquiriesTitle',
    'noEnquiries', 'colTime', 'colName', 'colPhone', 'colProduct',
    'colMessage', 'colLang', 'colStatus',
  ];
  const staffStringsRe = new RegExp(
    `^      (${staffStringKeys.join('|')}): .*,\\n`, 'gm',
  );
  const staffStringMatches = js.match(staffStringsRe) || [];
  if (staffStringMatches.length !== staffStringKeys.length * 2) {
    throw new Error(`build-static: expected ${staffStringKeys.length * 2} staff-only strings, found ${staffStringMatches.length}`);
  }
  js = js.replace(staffStringsRe, '');

  // Safety net: the static chat code must not retain any server or
  // storage coupling. (ai.js still contains a fetch to Gemini, but it
  // is only called when a key is configured, which never happens here;
  // this check covers app.js only.)
  const forbidden = ['fetch(', 'localStorage', 'sessionStorage', '/api/', 'apiEnquiries', 'loadEnquiries', 'setStaffOpen', 'viewToggle', 'staffView', 'resumeBtnStaff', 'refreshBtn', 'enquiriesTable'];
  for (const needle of forbidden) {
    if (js.includes(needle)) {
      throw new Error(`build-static: generated app.js still contains ${needle}`);
    }
  }

  return js;
}

function buildData() {
  const dataDir = path.join(ROOT, 'data');
  const products = parseCsv(fs.readFileSync(path.join(dataDir, 'products.csv'), 'utf8'));
  const faqs = parseCsv(fs.readFileSync(path.join(dataDir, 'faqs.csv'), 'utf8'));
  const handover = parseCsv(fs.readFileSync(path.join(dataDir, 'handover.csv'), 'utf8'));
  if (products.length === 0 || faqs.length === 0 || handover.length === 0) {
    throw new Error('build-static: one of products.csv, faqs.csv, handover.csv loaded empty');
  }
  const json = (value) => JSON.stringify(value, null, 2);
  return (
    '// Generated by scripts/build-static.mjs from data/*.csv. Do not edit by hand.\n' +
    '// Customer-chat data only: products, FAQs, handover rules.\n' +
    '// No enquiries data is included: the public build stores nothing.\n' +
    `export const products = ${json(products)};\n\n` +
    `export const faqs = ${json(faqs)};\n\n` +
    `export const handover = ${json(handover)};\n`
  );
}

function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  const files = {
    'index.html': buildIndex(),
    'app.js': buildApp(),
    'bot.js': fs.readFileSync(path.join(ROOT, 'src', 'bot.js'), 'utf8'),
    'ai.js': fs.readFileSync(path.join(ROOT, 'src', 'ai.js'), 'utf8'),
    'data.js': buildData(),
    'styles.css': fs.readFileSync(path.join(ROOT, 'public', 'styles.css'), 'utf8'),
  };

  for (const [name, content] of Object.entries(files)) {
    const full = path.join(OUT, name);
    fs.writeFileSync(full, content);
    console.log(`wrote static/${name} (${Buffer.byteLength(content, 'utf8')} bytes)`);
  }

  // No API key may reach the output. The build never reads .env, but
  // check anyway: a key-shaped value in the emitted files is a hard fail.
  const emitted = Object.values(files).join('\n');
  if (/GEMINI_API_KEY|AIza[0-9A-Za-z_-]{10,}/.test(emitted)) {
    throw new Error('build-static: possible API key found in generated output');
  }
  console.log('static build complete: no API key in output.');
}

main();
