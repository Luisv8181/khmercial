# Antigravity brief (paste into Antigravity on the laptop)

Scope: the demo repo only, and synthetic data only. Do not touch any other repo, any real account, or any file outside this repo.

## Repo

https://github.com/Luisv8181/khmercial (public, branch main)

Clone it fresh, then run the checks below. Do not change the code unless a check fails, and if you change anything, explain the change in the commit message.

## Checks to run

1. `npm test` - expect PASS 90/90 with per-category counts (en 30/30, kh 30/30, ambiguous 10/10, missing-info 10/10, escalation 10/10).
2. `npm start`, then open http://localhost:3000. The page must load with the demo banner visible.
3. In the chat, send: "How much is the Kampot pepper?" Expect the reply to show $6.50 (26,000 riel) and In stock: 25, with a Products badge.
4. Send: "Do you have dried mango in stock?" Expect an Out of stock reply.
5. Send a Khmer question about the pepper price. Expect a Khmer reply with the same price.
6. Send: "I want to order 2 Kampot black pepper." Expect it to ask for a name. Give a name and a phone number. Expect a confirmation, then open Staff view and confirm the enquiry row appears.
7. In a fresh chat, send: "I want a refund." Expect the handover banner, the input disabled, and the next message to return the same handover reply (paused state sticks). Then press Resume bot and confirm the bot answers again.
8. Check no secrets are in the repo: search for anything that looks like an API key or token, and confirm there is no `.env` file committed. `.env` must stay gitignored.

## Success looks like

All 8 checks pass, the UI behaves as described, and `git status` shows no unexpected changes. Report back with one line per check (pass or fail) and the exact reply text for checks 3, 4, and 5.

## If a check fails

Fix the smallest thing that makes it pass, rerun the full test suite, and say what you changed and why. Do not redesign anything. Do not add features. Do not add dependencies.
