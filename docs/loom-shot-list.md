# Loom walkthrough: 90-second shot list

Record with the demo running locally (`npm start`, http://localhost:3000). Screen record only, no face needed. Speak plainly, one idea per shot. Target 90 seconds total.

## Shot 1 (0-10s): the setup

Show the repo page on GitHub and the demo banner. Say: "This is a working demo I built for the chatbot in your job post. It is a fictional shop, Sokha Mart, with sample data, so you can see how the bot behaves before we touch your real shop."

## Shot 2 (10-30s): English price and stock

Type: "How much is the Kampot pepper?" Show the reply with the price in dollars and riel and the stock count. Point at the Products badge under the bubble. Then type: "Do you have dried mango in stock?" Show the "Out of stock" reply. Say: "Prices and stock come straight from the sheet. The bot copies them word for word. It never guesses a price."

## Shot 3 (30-50s): Khmer

Type the Khmer question for the pepper price (or the romanized "tae mlai bonman" if typing Khmer script is slow). Show the Khmer reply and the KH badge. Say: "It answers in Khmer too. The Khmer lines here are samples. Your native speaker approves the real wording before launch."

## Shot 4 (50-70s): enquiry and handover

Type: "I want to order 2 Kampot black pepper." Show it asking for a name, then type a name and phone number and show the confirmation. Switch to Staff view and show the new row in the enquiries table. Then type an angry message ("I want a refund") in a fresh chat and show the handover banner and the paused state. Say: "Orders are logged for your team, and an upset customer is handed to a human. The bot stops talking until your team resumes it."

## Shot 5 (70-90s): the close

Show the test run in the terminal (`npm test`, PASS 94/94 and SMOKE PASS). Say: "Ninety-four test questions, all passing, English and Khmer. The code, the sheets, and the test list are all in the repo link below. Happy to walk through the milestones and monthly costs on a call."

## Before recording

- Run `npm start` and confirm the page loads.
- Clear the enquiries log first (it should have header only) so the staff view starts empty.
- Use a fresh browser session so no old chat is on screen.
- Keep the terminal visible for the final shot.
- The staff-view portion of shot 4 is the local dev version; the public Netlify link is customer-chat-only by design (see `docs/security-review.md`).
