# Wiring real Google Sheets and ManyChat

The demo reads local CSV files. In production the same four tables live in Google Sheets, and ManyChat calls the backend instead of the demo page. Nothing about the bot logic changes.

## The four Sheets tabs

Create one Google Sheet with four tabs. The columns match the demo CSVs exactly.

1. **Products**: id, name_en, name_kh, price_usd, price_khr, stock, category, notes. The shop owner edits prices and stock here. The bot reads it fresh on each message (or on a short cache, 60 seconds).
2. **FAQs**: id, question_en, answer_en, answer_kh, keywords. One row per question. Keywords are comma separated words the bot uses to match.
3. **Handover rules**: id, rule, action, reply_en, reply_kh. One row per rule. Action is `pause`.
4. **Enquiries log**: timestamp, name, phone, product, message, language, status. The bot appends rows. Staff change status to `contacted` or `done`.

Share the sheet with the backend's service account as Viewer, and give the backend write access only to the Enquiries tab.

## Backend changes for production

- Replace `src/data.js` CSV loading with Google Sheets API reads (service account, read-only except the Enquiries tab append).
- Add a simple cache: reload the sheet every 60 seconds or on a webhook from the sheet.
- Move session state from memory to a small store (a JSON file is enough for one shop; Redis if there are several).
- Keep the same `POST /api/chat` contract so the ManyChat side does not change.

## ManyChat flow

1. **Trigger**: keyword or default reply on Facebook Messenger and Instagram DMs.
2. **Call the backend**: ManyChat External Request to `POST /api/chat` with `{sessionId: <subscriber id>, text: <last message>}`. Store the returned `reply`, `language`, `handover`, and `source` in custom fields.
3. **Show the reply**: send the stored `reply` as a text message. ManyChat's built-in Sheets lookup is not used, because it is exact-match only and cannot handle natural phrasing. The backend does the matching.
4. **Handover**: if `handover` is true, use ManyChat's Live Chat handover to pause the bot for that subscriber and notify staff. The bot stays paused until staff taps resume, which calls `POST /api/handover/resume`.
5. **Enquiry**: if the reply confirms an order enquiry, the row is already in the Enquiries sheet. Staff work from the sheet.
6. **Fallback**: if `source` is `fallback`, the flow still sends the clarification question. Two fallbacks in a row with no match also trigger a handover in the production flow.

## What the client provides

- Access to their Facebook Page and Instagram account to connect ManyChat.
- Their product list and prices in the Products tab, in their own words, in Khmer and English.
- A native Khmer speaker (chosen by the client) to approve every Khmer reply before launch.
- Their decision on voice messages (separately quoted) and on TikTok (likely unavailable for a Cambodia-registered account; confirmed in week 1).

## Monthly running costs (estimates for the proposal)

- ManyChat Pro plan: paid by the client, on their own account.
- AI usage (Gemini): about $5 to $30 per month at this volume, on the client's key or the builder's, agreed in writing.
- Hosting for the backend: a small serverless or VPS deployment, a few dollars a month. The demo runs on plain Node with no database.
