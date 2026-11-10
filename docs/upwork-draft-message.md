# Draft Upwork message to the client

Subject: I built a working demo of your Khmer/English chatbot

Hi,

I read your post for a Khmer/English AI customer service chatbot, and rather than only describing how I would build it, I built a working demo first so you can see it behave.

Demo repo (public, code, sheets, and tests all visible):
https://github.com/Luisv8181/khmercial

What the demo shows, in about 90 seconds on video (link to Loom to be added):
- A customer asks in English, Khmer script, or romanized Khmer, and gets an answer in the same language.
- Prices and stock come straight from a sheet the shop owner edits. The bot copies them word for word and never guesses. An out-of-stock product gets an honest out-of-stock reply.
- Orders are logged with name, phone, and product for your team to follow up.
- An upset customer, a refund request, or a question the sheet cannot answer hands over to a human, and the bot pauses until your team resumes it.
- 94 test questions (English and Khmer, plus adversarial prompts) all pass, and the test list is in the repo.

The public link is the customer chat; the video also shows the staff view, where orders land for your team.

The demo uses a fictional shop and sample data. The Khmer lines are samples, and your native speaker would approve the real wording before launch. That is a condition I would hold to in the real build.

How I would build yours, in milestones:
1. Audit and architecture ($250): your product list, FAQs, and handover rules in your own sheets, in your own words, plus a written plan and monthly cost estimate.
2. ManyChat plus Sheets plus the AI backend ($500): Facebook and Instagram connected, bot answering from your sheets, handover and enquiry logging live.
3. Bilingual workflows, testing, docs, and training ($650): Khmer and English tested with your team, your speaker's approval on every Khmer reply, a guide your staff can use.
4. Testing and handover ($600): live testing on your real accounts, fixes, and training so your team can run it without me.

Monthly running costs would be your ManyChat Pro plan plus about $5 to $30 a month in AI usage. Maintenance terms we agree in writing.

Two honest notes. Voice-message understanding and TikTok are quoted separately, not bundled into the chatbot price. And on TikTok: ManyChat TikTok messaging is limited to US-registered business accounts, so for a Cambodia-registered business it is likely unavailable. I would confirm that with you in week 1 rather than promise it.

The demo was built with AI-assisted development that I personally review and test. Happy to walk through it on a call and answer anything about the milestones.

Thank you for considering me,
Luis Vasquez

---
Notes for Luis (not sent to the client):
- Add the Loom video link before sending.
- Check the job listing is still open and the client is payment verified before spending Connects.
- The public demo link is the customer chat only, by design (see docs/security-review.md); the video shows the staff view. Do not promise a public staff login.
- The milestone prices are Claude's structure from the feasibility review ($800 / $400 / $500 / $300 voice optional was Claude's split; the $250 / $500 / $650 / $600 split above is ChatGPT's). Pick one structure before sending and keep it consistent.
- Do not claim a deployed chatbot or a team of human developers anywhere in the proposal.
