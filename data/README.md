# Sokha Mart demo data

Fictional shop data for the Sokha Mart demo chatbot. All products, prices, and answers are synthetic. No real shop data and no real people are used.

## The four files mirror four Google Sheets tabs

The production bot would read the same four tabs from Google Sheets. These CSV files are the demo stand in for those tabs.

- `products.csv` mirrors the Products tab.
- `faqs.csv` mirrors the FAQs tab.
- `handover.csv` mirrors the Handover rules tab.
- `enquiries.csv` mirrors the Enquiries log tab. It starts with a header only, and the bot appends one row per enquiry.

## Currency

Prices are shown in USD and Cambodian riel. The rate used is 4,000 KHR = $1, and that rate is an approximation, not a live exchange rate. Every price_khr value equals price_usd times 4,000.

## Khmer text

All Khmer text in these files is SAMPLE only, pending native-speaker review. Do not present it as verified Khmer.

## Fallback wording

When the bot cannot answer from the products or FAQs, cannot identify the product, or is missing information it needs, it replies with a clarification question and this fallback line:

"I will pass this to the team"

The clarification questions used in the test set are:

- "Which product would you like the price for?"
- "Which product are you asking about?"
- "What time do you mean?"
- "Could you tell me your name, please?"
- "Could you share your phone number, please?"
- "Which product would you like to order?"
- "How many would you like to order?"

Handover cases use a different line. They pause the bot and hand to a human, for example "I will pause here and connect you with a team member."
