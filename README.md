# khmercial

Working demo of a Khmer/English AI customer service chatbot for a fictional Cambodian shop, Sokha Mart in Phnom Penh. Built to show a client what the real system would look and feel like before any contract is signed.

## What it is

A customer writes in English, Khmer script, or romanized Khmer. The bot answers from a small editable knowledge base (products, FAQs, handover rules), logs enquiries, and hands over to a human when it should. Prices and stock come from the data file verbatim, or the bot hands over. It never guesses.

This is a demonstration. The shop is fictional, all data is synthetic, and the Khmer sample text is labeled as a sample pending native-speaker review.

## Quick start

```bash
npm start
```

Open http://localhost:3000. No API key needed. The demo runs fully on its own deterministic logic. The server binds localhost by default; set `HOST=0.0.0.0` only on a trusted local network, and only for the demo.

Run the tests:

```bash
npm test
```

## Static build (Netlify)

The public deployment is a static site, customer chat only: no staff view, no server, no enquiry storage of any kind (no localStorage, no sessionStorage, no `/api/*` calls). The enquiry flow still runs in the chat: the bot asks for name and phone and shows the confirmation, and that is the end of it in the public build. Nothing is stored; the page says so. The full app with the staff view stays in the local Node version above.

Build it locally:

```bash
node scripts/build-static.mjs
```

That emits a self-contained site into `static/` (not committed; it is in `.gitignore` and built by Netlify on deploy):

- `index.html` — `public/index.html` minus the staff view, plus a line stating the public demo stores nothing.
- `app.js` — `public/app.js` as an ES module, with the transport layer replaced by direct calls to the bundled bot (`bot.handleMessage`, `bot.resumeSession`); enquiry recording is a no-op.
- `bot.js`, `ai.js` — verbatim copies of `src/bot.js` and `src/ai.js`. With no key, `aiAssist` returns null, so the bot behaves identically.
- `data.js` — generated from `data/products.csv`, `data/faqs.csv`, and `data/handover.csv`. `src/data.js` is not copied (it uses Node `fs` and cannot run in a browser). No enquiries data is included.
- `styles.css` — verbatim copy of `public/styles.css`.

No source maps, no API key in the output. Serve the output locally to check it:

```bash
cd static && python3 -m http.server 8000
```

`netlify.toml` sets the build command (`node scripts/build-static.mjs`) and the publish directory (`static`), plus the same security headers the Node server sends. Suggested site name: `sokha-mart-demo`.

## Security

The Node server is a local demo server only: it binds `127.0.0.1` by default, and `GET /api/enquiries` is loopback-only by code. Do not expose it to the internet. The public deployment is the static build (Netlify): customer chat only, no server, no enquiry endpoint, nothing stored. Full review, including the independent ChatGPT review and the reconciliation: `docs/security-review.md`.

## How it works

- `server.mjs` is a zero-dependency Node server. It serves the chat UI and the API.
- `src/bot.js` holds the conversation logic: language detection, product and FAQ matching, handover rules, the staged enquiry flow (ask for name, then phone), and session pause/resume.
- `src/data.js` loads the CSV files in `data/`. In production these four files are the four Google Sheets tabs (Products, FAQs, Handover rules, Enquiries log). See `docs/sheets-and-manychat.md`.
- `src/ai.js` is the optional AI layer. With no key it returns null and the demo behaves identically. With a `GEMINI_API_KEY` in `.env` it only reranks candidate answers. It never writes reply text and never sees prices.
- `public/index.html` is the chat UI with a staff view (enquiries table, pause/resume).
- `tests/cases.json` is the 94-case test set (30 English, 30 Khmer, 10 ambiguous, 10 missing-info, 10 escalation, 4 adversarial). `tests/run.js` runs it. `tests/server-smoke.mjs` is the HTTP security suite (headers, traversal, rate limiting, XSS, input caps) and runs as part of `npm test`.

## API

- `POST /api/chat` with `{sessionId, text}` returns `{reply, language, confidence, handover, handoverReason, enquiry, source, matchedId}`.
- `POST /api/handover/resume` with `{sessionId}` resumes a paused session.
- `GET /api/enquiries` returns the enquiry log.
- `GET /api/health` returns `{ok:true}`.

## Optional AI key

Copy `.env.example` to `.env` and add a free Gemini key from Google AI Studio. Never commit `.env`. The demo does not need it.

## Honesty notes

- AI-assisted development, personally reviewed and tested. No deployed chatbot is claimed. No team of human developers is claimed.
- Khmer text in the demo is a sample. The client validates Khmer with a native speaker in the real job.
- TikTok messaging is not built here. For a Cambodia-registered business account it is likely unavailable, and that is stated in the proposal, not hidden.

## Docs

- `docs/architecture.md` - how the pieces fit
- `docs/sheets-and-manychat.md` - wiring real Google Sheets and ManyChat
- `docs/loom-shot-list.md` - the 90-second walkthrough script
- `docs/upwork-draft-message.md` - draft message to the client
- `docs/antigravity-brief.md` - brief to paste into Antigravity for the final local check
