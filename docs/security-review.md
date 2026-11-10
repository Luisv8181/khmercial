# Security review — khmercial demo

- Date: November 10, 2026
- Repo: https://github.com/Luisv8181/khmercial (branch main)
- Scope: `server.mjs`, `src/bot.js`, `src/data.js`, `src/ai.js`, `public/index.html` (now split into `index.html` + `app.js` + `styles.css`), `data/*.csv`, `package.json`
- Reviewers: independent pass by the hub (this document) + static code review by ChatGPT ([chat](https://chatgpt.com/c/6af38a34-1f48-83ea-873e-e21ab5b3ff97), saved verbatim at `~/workspace/optimust-council/khmercial-security-2026-11-10/chatgpt-security-review-2026-11-10.md`)
- Method: code reading plus live tests run by the hub (`npm test`: 94-case bot set + 27-check HTTP smoke suite). ChatGPT could not run the tests (no GitHub network access in its environment), so its review is static code reading only. Nothing in this document is a penetration-test certificate, and no trust score is given: scores would be invented. Facts and test evidence only.

## Verdict

ChatGPT's verdict on the pre-fix code was **not approved for deployment**, and it was right: the unauthenticated `GET /api/enquiries` endpoint exposed the full enquiry log, and the deployment architecture was undecided.

After the fixes in this pass, the verdict is:

- **The public static build is approved for deployment as a demo**, once the static build is built and verified. It is customer-chat-only, has no server, no enquiry endpoint, and stores nothing.
- **The Node server is approved for local use only** (loopback bind, loopback-only enquiries endpoint). It must not be exposed to the internet.
- The live hosting configuration, DNS, and TLS still need verification after deploy.

## Architecture decision (resolves ChatGPT Priority 2)

Two versions of the demo exist, deliberately:

1. **Public version: static build** (Netlify). The bot (`src/bot.js`) and the data are bundled into the browser, so the demo runs with no server at all. No `/api/*` routes exist, no enquiry endpoint exists, nothing is persisted anywhere. The Gemini rerank stays server-only and is simply unavailable in the static build; the bot behaves identically without it.
2. **Local version: Node server** (`npm start`). The full app, including the staff view and the CSV enquiry log. It binds `127.0.0.1` by default and its enquiries endpoint is loopback-only by code (see below).

This deliberately differs from ChatGPT's suggested Option B (deploy the Node server on a Node host). Reasons: a static build has no server to secure or operate, no shared state between visitors, and the bot is deterministic and needs no key for its core behavior. A Node host would keep the enquiry endpoint and the session state on a shared server, which is exactly the exposure ChatGPT flagged.

## The staff-view decision (explicit)

ChatGPT recommended the public demo be customer-chat-only, with no staff enquiry interface and no persistent collection of names or phone numbers, keeping the full app as a local dev version.

**Decision: follow ChatGPT for the public build.**

- The public static build has no staff view and no enquiry storage of any kind (no localStorage, no sessionStorage, no endpoint). The enquiry flow still runs in the chat: the bot asks for name and phone and shows the confirmation, which demonstrates the flow. The confirmation is the end of it in the public build; nothing is stored.
- The full app (staff view + CSV log) stays in the local Node version, which is what the Loom video records. Loom shot 4 is unchanged, with a note added to the shot list that the staff-view portion is the local dev version.
- Why this and not a localStorage staff view: a per-browser store would only ever show the visitor's own input on their own machine, so it is not the same flaw as the shared server endpoint. But the cleaner public demo collects and stores nothing at all, the enquiry-logging feature is already demonstrated in the video and in the repo, and the trust story is simple: the public link cannot leak anyone's details because it never receives or stores any.
- The draft Upwork message was updated to say the public link is the customer chat and the video shows the staff view where orders land.

## Checklist A — 20 common vibe-coded vulnerabilities

| # | Item | Verdict | Reason / fix |
|---|------|---------|--------------|
| 1 | Next.js header | DOES NOT APPLY | Plain Node `http` server, no Next.js, no framework headers. |
| 2 | .git folder exposed | DOES NOT APPLY | `serveStatic` serves only files under `public/`; `/data`, `/src`, `/.git` all return 404 (verified live in the smoke suite). GitHub repo visibility is intentional. |
| 3 | Supabase storage | DOES NOT APPLY | No Supabase, no external storage, no database. |
| 4 | Price from the browser | DOES NOT APPLY | Node version: prices come from server-side CSVs; the browser never sends prices. Note for the static build: prices are inlined into the browser bundle because there is no server. They are display-only sample data, no checkout, no money moves. A production build must keep prices server-side (ManyChat/Sheets). |
| 5 | Credential stuffing | DOES NOT APPLY | No accounts, logins, or passwords. |
| 6 | Open database | DOES NOT APPLY | No database. The related real issue was the unauthenticated enquiries endpoint; fixed (loopback-only in the dev server, absent from the static build). |
| 7 | Polyfill.io | DOES NOT APPLY | No external scripts; the page is self-contained (verified: no external `<script>` or stylesheet). |
| 8 | SMS pumping | DOES NOT APPLY | No SMS provider or outbound messaging. |
| 9 | Prompt injection | APPLIES (bounded, fixed as far as it goes) | The AI only picks a candidate id from an allowlist (`ids.includes(picked)`), so it cannot generate reply text or prices. Fixed further: the prompt now delimits the user message as untrusted data, PII is redacted before the call, and 4 adversarial tests (ADV-01..04) pass. Residual: a successful injection could pick the wrong existing candidate (wrong product/FAQ). Low impact, no data leak. |
| 10 | Weak JWT secret | DOES NOT APPLY | No JWTs, no auth tokens. Session ids are now `crypto.randomUUID()` (was `Math.random()` + timestamp). |
| 11 | Race condition | APPLIES (fixed) | Two messages for one session could interleave while one awaited the AI rerank. Fixed with a per-session promise chain in `src/bot.js`. File appends are synchronous (`appendFileSync`), so no interleaved CSV rows. No multi-instance deployment, so no shared-state race. |
| 12 | Account pre-hijacking | DOES NOT APPLY | No accounts. |
| 13 | Subdomain takeover | DOES NOT APPLY | No custom domain configured. Deploy note: when a custom domain is added, verify DNS points at the live site, and remove the DNS record if the site is ever deleted. |
| 14 | SSRF | DOES NOT APPLY | No user-controlled URL fetch. The only outbound request is `src/ai.js` to a fixed Gemini endpoint. |
| 15 | Path traversal | APPLIES (fixed) | The old `full.startsWith(PUBLIC_DIR)` check is not a safe boundary (a sibling sharing the prefix could pass). Fixed with a `path.relative` containment check. Verified live: encoded traversal attempts return 404. |
| 16 | Reset poisoning | DOES NOT APPLY | No password reset or account recovery. |
| 17 | Source maps | DOES NOT APPLY | No build step, no source maps in the current demo. Rule for the static build: ship no source maps. |
| 18 | Clickjacking | APPLIES (fixed) | No framing protection before. Fixed: `X-Frame-Options: DENY` + CSP `frame-ancestors 'none'` on the Node server; the same headers in `netlify.toml` for the static build. |
| 19 | Open redirect | DOES NOT APPLY | No redirects (no `Location` headers, no redirect endpoints). |
| 20 | User enumeration | DOES NOT APPLY | No user accounts or login. |

## Checklist B — VibeSecure 10-step pipeline

1. **Architecture validation — DECIDED.** Public = static build; Node server = local dev only (see above). Differs from ChatGPT's Option B for the reasons given.
2. **Security hardening — DONE for this demo's scope.** Secrets: `GEMINI_API_KEY` via env only, `.env` gitignored, `.env.example` placeholder only, no keys in code. HTTPS: Netlify terminates TLS for the static build; the Node server is loopback-only. HSTS: the host's job (Netlify sends it); the Node server must not send HSTS on localhost, and `netlify.toml` sets it explicitly for the static build. Headers: strict CSP (no `unsafe-inline`; inline script/style were extracted to external files), `X-Frame-Options`, nosniff, `Referrer-Policy`, `Permissions-Policy`. CSRF: no cookies; POST routes reject cross-origin `Origin` headers. XSS: `textContent` everywhere in the UI; verified live with a payload. Rate limiting: 60/min per IP on `/api/*`. Auth: none, by design for the local dev server; the public build has no privileged routes at all. Sessions: `crypto.randomUUID`, capped at 500, in-memory, lost on restart.
3. **Privacy/compliance — DONE for a synthetic demo.** The local version collects name + phone in enquiries (user-provided). The public build collects and stores nothing. PII (phone/email) is redacted before any Gemini call. `console.log` of user data was removed from the UI. The UI tells visitors to use sample details, not real personal info. No claim of GDPR, FERPA, or HIPAA compliance is made. Retention: the local CSV is the operator's responsibility; the public build has nothing to retain.
4. **Accessibility WCAG 2.2 — PARTIAL.** Present: semantic buttons/headings, `role="log"` + `aria-live="polite"` on the messages region, `role="status"`/`role="alert"` on banners, aria-labels, a visible `:focus-visible` outline (added). Not done: a full WCAG 2.2 AA audit (keyboard walkthrough, screen-reader test, measured contrast). The video QC pass exercises the page in a real browser, but that is not an accessibility audit. Stated honestly.
5. **Performance — DONE for this demo's scope.** Zero dependencies, one HTML + JS + CSS file, no external requests. Resource bounds: 100 KB body cap, 2000-char message cap, 60/min/IP rate limit, 500-session cap, 500-entry in-memory enquiry cap. No load test run; the demo is not expected to take load, and the static build is served by Netlify's CDN.
6. **AI safety — DONE for this demo's scope.** Candidate-id allowlist (validated), no AI-generated reply text or prices, prompt delimits user text as untrusted data, PII redaction before the Gemini call, 4 adversarial tests pass. Gemini is disabled by default (no key configured); the public static build has no key at all.
7. **Database validation — DOES NOT APPLY.** No database. CSV parsing is tested (quoted fields, comment lines); `csvEscape` now also neutralises spreadsheet formula injection (a field starting with `=`, `+`, `-`, `@`, tab, or CR gets a leading single quote).
8. **API validation — DONE for this demo's scope.** 2000-char message cap, 100 KB body cap, session-id and text coerced to strings, wrong-method 405, generic 500s (no internal details), 400s are generic messages, rate limiting, `Origin` check on POSTs. The public build has no API.
9. **Automated testing — DONE for this phase.** 94-case bot test set (90 original + 4 adversarial) passes; 27-check HTTP smoke suite (`tests/server-smoke.mjs`) passes, with 1 documented SKIP (the non-loopback TCP test cannot run in this sandbox; the guard is verified by inspection plus the loopback-positive case). ChatGPT did not run the tests.
10. **Deployment readiness — READY, with the architecture decision above.** Static build: `netlify.toml` with security headers, no source maps, no secrets. Node server: local-only. Remaining: the Netlify site itself needs Luis's login approval to create/link; after pushing, verify the new commit's deploy is `ready` via the Netlify API before treating the link as updated (house rule).

## ChatGPT reconciliation

Every finding in ChatGPT's review, and its disposition here. Fixes were verified in the code before being applied; nothing was applied blindly.

| ChatGPT finding | Disposition |
|---|---|
| Critical: unauthenticated `GET /api/enquiries` exposes the full log | FIXED. Loopback-only by code in the dev server; absent entirely from the public static build. |
| `POST /api/handover/resume` unauthenticated | ACCEPTED with mitigation. Local-only server, rate-limited, Origin-checked. It resumes a demo session; it reads no data. The public build has no resume endpoint (pause state is client-side). |
| Deployment architecture unresolved (Priority 2) | DECIDED. Static public + Node local. Differs from ChatGPT's Option B; reasons in the Architecture section. |
| No rate limiting | FIXED. 60/min per IP on `/api/*`, verified live (429 after a flood). |
| No security headers | FIXED. CSP (strict, no `unsafe-inline`), `X-Frame-Options`, nosniff, `Referrer-Policy`, `Permissions-Policy`. Inline script/style extracted to external files so the CSP can be strict. |
| Privacy: `console.log` leaks user data | FIXED. All `console.log` calls carrying user text or enquiries removed from `public/app.js`; errors log the status only. |
| Privacy: raw user text sent to Gemini | FIXED. PII redaction (phone/email) before the call, prompt delimits user text as untrusted data, Gemini disabled by default. |
| Accessibility not verified | PARTIAL. `role="log"` + `aria-relevant` added, `:focus-visible` outline added. Full WCAG audit not done; stated honestly. |
| No rate/session limits | FIXED. 60/min/IP rate limit, 500-session cap, 500-entry in-memory enquiry cap. |
| AI safety: no adversarial tests or PII filter | FIXED. 4 adversarial tests (ADV-01..04) pass; PII filter added. |
| API validation weak | FIXED. 2000-char cap, 100 KB body cap, 405s, generic 500s, `Origin` check on POSTs. |
| No security test suite | FIXED. `tests/server-smoke.mjs`, 27 checks, wired into `npm test`. |
| CSV formula injection | FIXED. `csvEscape` prefixes a single quote on fields starting with `=`, `+`, `-`, `@`, tab, or CR. |
| Session-ID predictability | FIXED. `crypto.randomUUID()` in the UI. |
| Error disclosure (raw exception messages) | FIXED. Unexpected errors return a generic 500; 400s are generic messages. |
| HSTS missing | DISAGREED in part. HSTS is the host's job: Netlify sends it on hosted sites, and `netlify.toml` sets it explicitly. The Node server must not send HSTS on localhost. |
| CSRF | MITIGATED. No cookies, so there is nothing to steal; POST routes reject cross-origin `Origin` headers. |
| Path containment (`startsWith` unsafe) | FIXED. `path.relative` containment check. |
| Race condition (shared session state) | FIXED. Per-session promise chain in `src/bot.js`. |
| Prompt injection (no instruction/data separation) | FIXED as far as it goes. Delimiters + allowlist + adversarial tests. Residual wrong-candidate risk stated in item 9 above. |
| "Deploy with Gemini disabled initially" | AGREED and already the case: no key is configured, and the public static build has no key at all. |

## Fixes made in this pass

- `server.mjs`: binds `127.0.0.1` by default (was all interfaces); security headers on every response; 60/min/IP rate limit on `/api/*`; 2000-char message cap; generic 500s; `path.relative` containment; loopback-only `/api/enquiries`; 405 for wrong-method API calls; `Origin` check on POSTs; 500-entry in-memory enquiry cap.
- `src/bot.js`: per-session promise chain (serialises concurrent messages for one session); 500-session cap (oldest evicted).
- `src/ai.js`: PII redaction (phone/email) before the Gemini call; prompt delimits the user message as untrusted data; `redactPII` exported for tests.
- `src/data.js`: `csvEscape` neutralises spreadsheet formula injection.
- `public/index.html`: split into `index.html` + `app.js` + `styles.css` (no inline script or style); `role="log"` + `aria-relevant="additions"` on the messages region; a "use sample details, not your real name or phone number" note.
- `public/app.js`: transport seams (`apiChat`, `apiResume`, `apiEnquiries`, `recordEnquiry`) for the static build; `res.ok` checked before rendering a reply; `console.log` of user data removed; `crypto.randomUUID()` session id.
- `public/styles.css`: `:focus-visible` outline for buttons and inputs.
- `tests/cases.json`: 4 adversarial cases added (94 total).
- `tests/server-smoke.mjs`: new 27-check HTTP security suite; `npm test` runs both suites.

## Test evidence (run by the hub, not by ChatGPT)

- `npm test`: bot set PASS 94/94 (en 30/30, kh 30/30, ambiguous 10/10, missing-info 10/10, escalation 10/10, adversarial 4/4); smoke suite SMOKE PASS (27 checks, 1 SKIP: the non-loopback TCP test cannot run in this sandbox because the sandbox blocks direct TCP to non-loopback addresses; the guard is verified by inspection plus the loopback-positive case).
- Live verification: pepper question returns the verbatim `$6.50`; an XSS payload (`<img src=x onerror=alert(1)>`) is not reflected in the reply; encoded traversal attempts return 404; the rate limit trips a 429 after a flood; `data/enquiries.csv` stayed header-only through the smoke suite.

## Known remaining limits

- H06 ("bot does not understand") fires on messages with no recognisable word, but its "twice in a row" clause is not implemented: consecutive clarification questions are part of the normal enquiry flow, and counting them would pause the bot mid-enquiry.
- `handleMessage` is async (to await the AI rerank); with no key it resolves immediately.
- No live ManyChat account is wired in; the ManyChat side is a flow specification in `docs/sheets-and-manychat.md`.
- Voice is out of scope for the demo (separately quoted phase); TikTok is not built (likely unavailable for a Cambodia-registered account).
- No load test has been run. The static build is served by Netlify's CDN, which is the mitigation.
- A full WCAG 2.2 AA audit has not been done.
- The non-loopback enquiries guard test is skipped in this sandbox (see test evidence above); it should be re-run on the laptop via the Antigravity brief.
