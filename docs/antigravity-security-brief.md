# Antigravity brief — verify the khmercial security pass + static build

Paste this whole brief into Antigravity on the laptop. Scope is the demo
repo and synthetic data only. Do not open the Life Language Library, do
not open any file named `notes. 2-18.txt`, do not touch real customer
data (there is none in this repo). Read-only except running the commands
below in the repo clone.

## Context

Repo: https://github.com/Luisv8181/khmercial (branch main, public).
The demo is a Khmer/English customer-service chatbot for a fictional
Cambodian shop, Sokha Mart. All data is synthetic. The security pass
(commit 2f8f448) and the static Netlify build (commit 6b95882) are the
work to verify. Full review: `docs/security-review.md`.

Two versions exist by design:
- Public version: static build (Netlify). Customer chat only, no server,
  no staff view, no enquiry storage of any kind.
- Local version: Node server (`npm start`). Full app with staff view and
  CSV enquiry log. Localhost only.

## Setup

```bash
git clone https://github.com/Luisv8181/khmercial.git khmercial-verify
cd khmercial-verify
git log --oneline -3
# Expect HEAD 6b95882 (static build) on top of 2f8f448 (security pass).
node --version   # any recent Node 20+
```

## Check 1 — tests pass (94 bot cases + HTTP smoke suite)

```bash
npm test
```

Expected: `PASS 94/94` (en 30/30, kh 30/30, ambiguous 10/10,
missing-info 10/10, escalation 10/10, adversarial 4/4) and `SMOKE PASS`
(27 checks). Note any FAIL and stop there; do not proceed to deploy
checks until the tests are green.

## Check 2 — syntax on every changed file

```bash
for f in server.mjs src/bot.js src/data.js src/ai.js public/app.js tests/run.js tests/server-smoke.mjs scripts/build-static.mjs; do node --check "$f" && echo "OK $f"; done
```

Expected: every file prints OK. A syntax error in any file is a
failure, even if the tests pass.

## Check 3 — security headers on the local server

```bash
npm start &
sleep 2
curl -s -D - http://127.0.0.1:3000/ -o /dev/null
```

Expected headers: `X-Frame-Options: DENY`,
`Content-Security-Policy` containing `frame-ancestors 'none'` and no
`unsafe-inline`, `X-Content-Type-Options: nosniff`. Then:

```bash
curl -s http://127.0.0.1:3000/api/health
# Expect {"ok":true}
curl -s -X POST http://127.0.0.1:3000/api/chat -H 'Content-Type: application/json' -d '{"text":"How much is the Kampot pepper?"}'
# Expect the reply with $6.50 (26,000 riel), in stock 25, source products.
curl -s -X POST http://127.0.0.1:3000/api/chat -H 'Content-Type: application/json' -d '{"text":"<img src=x onerror=alert(1)>"}'
# Expect a handover reply. The reply must NOT contain "<img".
curl -s http://127.0.0.1:3000/../server.mjs -o /dev/null -w "%{http_code}\n"
# Expect 404.
curl -s http://127.0.0.1:3000/data/products.csv -o /dev/null -w "%{http_code}\n"
# Expect 404.
```

Kill the server when done (`Ctrl+C` in its terminal, or find and stop
the `node server.mjs` process).

## Check 4 — loopback-only enquiries (the test the sandbox could not run)

The sandbox blocks direct TCP to non-loopback addresses, so this check
was skipped there. On the laptop it can run for real.

```bash
HOST=0.0.0.0 PORT=18742 npm start &
sleep 2
curl -s http://127.0.0.1:18742/api/enquiries -o /dev/null -w "loopback: %{http_code}\n"
# Expect loopback: 200
ipconfig | findstr /i "IPv4"
# Note the laptop's LAN IPv4 address, then (replace LAN-IP):
curl -s http://LAN-IP:18742/api/enquiries -o /dev/null -w "lan: %{http_code}\n"
# Expect lan: 404. If it returns 200, the loopback guard is broken: stop and report it.
```

Kill that server instance when done.

## Check 5 — static build (the public deployment)

```bash
rm -rf static && node scripts/build-static.mjs
ls static/
# Expect: index.html, app.js, bot.js, ai.js, data.js, styles.css
grep -r "localStorage\|sessionStorage" static/ || echo "no browser storage: good"
grep -r "staffView\|Staff view\|apiEnquiries" static/ || echo "no staff view: good"
grep -r "GEMINI_API_KEY\|AIza" static/ || echo "no key in output: good"
node --check static/app.js && node --check static/bot.js && node --check static/data.js && node --check static/ai.js
```

Expected: no matches for the three greps (the only `fetch(` in the
output is inside `static/ai.js`, the Gemini call, which never fires
because no key is ever passed to the bot in the static build — confirm
with `grep -n "createBot" static/app.js`, which must show
`createBot({ products, faqs, handover })` with no `apiKey`).

Serve it and check it in a real browser:

```bash
cd static && python -m http.server 8000
```

Open http://localhost:8000. Confirm: the page renders, the chat
answers the pepper question with $6.50, the Khmer question answers in
Khmer, there is no Staff view button, and the browser Network tab shows
no requests to any server (only the local files). The page must carry
the "This public demo stores nothing" line. Close the server when done.

## Check 6 — no secrets in the repo

```bash
git grep -n "GEMINI_API_KEY" -- . | grep -v ".env.example" | grep -v "apiKey:"
# Expect no output: the key appears only as the variable name in code
# (server.mjs, src/ai.js) and as a placeholder in .env.example.
ls .env 2>&1
# Expect "cannot access .env": no key file is committed or present.
cat data/enquiries.csv
# Expect the header line only. If a row is present, it came from a local
# test run: reset the file to the header line only and do not commit it.
```

## Report back

For each check: PASS or FAIL with the exact output. If anything fails,
paste the failing command and its full output. Do not fix code in this
brief; verification only. Do not deploy anything; deployment needs
Luis's Netlify login separately.
