# Architecture

## The idea in one paragraph

ManyChat owns the channels (Facebook, Instagram) and the human handover button. A small backend owns the brain: it reads the shop's Google Sheets, matches the customer's message to a product or FAQ, and returns a reply. Prices and stock are copied from the sheet word for word. Anything the sheet cannot answer goes to a human. The AI model is an optional helper that only reranks candidate answers. It never writes prices and never writes reply text.

## Pieces

```
Customer (Facebook / Instagram)
  -> ManyChat flow (keyword trigger, call webhook, show reply, handover button)
  -> Backend (this repo: server.mjs + src/bot.js)
  -> Knowledge base (data/*.csv here; Google Sheets in production)
  -> Optional AI rerank (src/ai.js, Gemini, only with a key set)
  -> Enquiries log (data/enquiries.csv here; Enquiries sheet in production)
```

## Request flow

1. `POST /api/chat` receives `{sessionId, text}`.
2. The bot detects the language: Khmer script, romanized Khmer, or English.
3. Handover rules run first. Angry customer, refund, complaint, wants a human, discount talk, a phone number, or a product that is not in the sheet all pause the bot and hand over.
4. Product questions match by token overlap on the English and Khmer names, plus a small alias table for romanized Khmer. The reply copies the price and stock verbatim from the row.
5. FAQ questions match by keyword overlap and return the stored answer in the customer's language.
6. Enquiry intent (order, buy, want, book) starts a staged flow: ask for the name, then the phone number, then confirm and log the enquiry.
7. Anything else gets a clarification question or the fallback line, and the bot does not pretend to know.

## Static mode (public demo)

The public deployment is a static build, not the Node server: `scripts/build-static.mjs` bundles the bot and the sheet data into `static/` for Netlify, and the page runs the bot in the visitor's browser. It is customer-chat-only by decision, not by omission: there is no staff view, no enquiry endpoint, and no storage of any kind, so the public link collects and stores nothing. The enquiry flow still completes in the chat (name, phone, confirmation) and then ends there. The full app with the staff view and the enquiry log lives only in the local Node version.

## Session state

Sessions live in memory on the server. A paused session stays paused: every later message returns the handover reply until staff resumes it with `POST /api/handover/resume`. Restarting the server clears sessions and the in-memory enquiry list. The CSV log on disk persists.

## Why the AI is optional

The demo runs with no key at all. Deterministic matching covers the demo's 8 products and 10 FAQs. The AI layer exists for the real job, where the catalogue is bigger and phrasing varies more. Even there, the model only picks which stored answer fits best. The stored answer is what the customer sees, so a model hallucination cannot invent a price.

## Language rules

- Khmer script input gets Khmer script answers where they exist.
- Romanized Khmer input gets English answers (the romanized spelling is how a customer types; the answer in English is readable and unambiguous). A greeting alone in romanized Khmer gets the Khmer opening-hours answer, matching the test set.
- English input gets English answers.
- Every reply carries its detected language, its source (products, faqs, handover, fallback, enquiry), and a confidence score, shown as badges in the UI.

## Known limits (stated, not hidden)

- The H06 handover rule ("bot does not understand") fires on messages with no recognisable word at all. Its "twice in a row" clause is not implemented, because consecutive clarification questions are part of the normal enquiry flow (ask name, then phone). Counting them would pause the bot mid-enquiry.
- `handleMessage` is async, so the AI rerank can be awaited. With no key it resolves immediately.
- The demo has no real ManyChat account wired in. The ManyChat side is a flow specification in `docs/sheets-and-manychat.md`, not a live integration.
- Voice messages are out of scope for the demo. They are a separately quoted phase in the proposal.
- TikTok is not built. ManyChat TikTok messaging is limited to US-registered business accounts, so a Cambodia-registered account likely cannot use it. The proposal says this plainly.
