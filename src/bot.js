// bot.js
// Rule-based chatbot for the Sokha Mart demo (fictional shop, Phnom Penh).
//
// Check order in handleMessage:
//   1. detect language
//   2. paused session (after a handover) stays paused
//   3. handover rules (angry, refund, complaint, wants a human,
//      discount, phone number shared, "call me" with no product)
//   4. greeting on its own -> opening-hours FAQ
//   5. "how do I order" style questions -> how-to-order FAQ
//   6. "what do you sell" -> product catalogue
//   7. pronoun with no product named ("it", "that one") -> ask which
//      product, with a clarification question
//   8. enquiry flow (order or contact), staged missing-info questions
//   9. product price / stock questions
//  10. FAQ keyword match (before the not-found handover, so "Do you
//      offer wholesale prices?" answers from the FAQ instead of handing
//      over on the word "prices")
//  11. product question naming a product that is not in the sheet
//      -> handover
//  12. fallback with a clarification question, or handover when the
//      message contains no recognisable words at all
//
// Prices and stock are always copied verbatim from the CSV row. The bot
// never invents a price. A product question with no matching product
// hands over to the team.
//
// Language rule for answers, set by the test cases: Khmer script gets
// the Khmer answer; romanized Khmer and English get the English answer,
// except a greeting on its own, which gets the Khmer opening-hours
// answer in Khmer script for both Khmer script and romanized Khmer.
//
// AI (aiAssist) is optional. When no key is configured it returns null
// and the bot behaves identically. When a key is set, AI only reranks
// candidates the bot already found; it never generates reply text.

import { aiAssist as defaultAiAssist } from './ai.js';

// ---------------------------------------------------------------------------
// Language detection
// ---------------------------------------------------------------------------

const KHMER_SCRIPT = /[\u1780-\u17FF]/;

// Romanized Khmer words. Word boundaries keep short words such as "ot"
// and "ey" from matching inside English words.
const ROMAN_KHMER_WORDS = [
  'sua', 'sdei', 'suostei', 'tae', 'mlai', 'bonman', 'som', 'ot', 'mean',
  'ey', 'arkun', 'orkun', 'chum', 'reap', 'sok', 'sabay', 'bong', 'oun',
  'knhom', 'nov', 'ban', 'jong', 'kom', 'tov', 'mok', 'pel', 'ni', 'jea',
  'moan', 'ponman', 'doch', 'mdach', 'tee', 'na',
  'skor', 'tnout', 'svay', 'krieb', 'kafe', 'breng', 'doung', 'kanseng',
  'sot', 'mee', 'angkor', 'kontrak',
];
const ROMAN_KHMER_RE = new RegExp(`\\b(${ROMAN_KHMER_WORDS.join('|')})\\b`, 'i');

export function detectLanguage(text) {
  const s = String(text ?? '');
  if (KHMER_SCRIPT.test(s)) return 'kh';
  if (ROMAN_KHMER_RE.test(s)) return 'kh-roman';
  return 'en';
}

// Pick the reply in the detected language, falling back to English when
// no Khmer version exists. For FAQs, romanized Khmer gets the English
// answer; only Khmer script gets the Khmer answer.
function faqLocalised(row, language) {
  if (language === 'kh' && row.answer_kh) return row.answer_kh;
  return row.answer_en || '';
}

// Handover replies follow the sheet: Khmer when the customer wrote in
// Khmer script or romanized Khmer, else English.
function handoverLocalised(row, language) {
  if ((language === 'kh' || language === 'kh-roman') && row.reply_kh) {
    return row.reply_kh;
  }
  return row.reply_en || '';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'do', 'does', 'did', 'you', 'your',
  'yours', 'have', 'has', 'had', 'how', 'much', 'many', 'there', 'any',
  'i', 'we', 'want', 'wants', 'to', 'buy', 'order', 'please', 'me', 'my',
  'can', 'could', 'would', 'should', 'what', 'whats', 'when', 'where',
  'in', 'on', 'at', 'for', 'of', 'and', 'or', 'this', 'that', 'it', 'its',
  'per', 'tell', 'about', 'show', 'get', 'give', 'need', 'like', 'just',
  'hello', 'hi', 'hey', 'thanks', 'thank', 'ok', 'okay', 'yes', 'no',
]);

function tokens(text) {
  return String(text ?? '')
    .toLowerCase()
    .split(/[^\p{L}\p{M}\p{N}]+/u)
    .filter((t) => t && !STOPWORDS.has(t));
}

const PRICE_WORDS = [
  'price', 'cost', 'costs', 'how much', 'tae', 'charge', 'pricing',
];
const STOCK_WORDS = [
  'stock', 'have', 'available', 'left', 'in stock', 'out of stock',
  'still have', 'got any', 'any left',
];
// Khmer script words for price / have, checked by substring. The
// "have" word must not match inside "how many": the tail of ប៉ុន្មាន
// (ponman) is មាន (mean), so a bare substring check would call every
// "how much" question a stock question.
const KHMER_PRICE_WORDS = ['តម្លៃ'];
const KHMER_STOCK_WORDS = ['មាន'];

function isPriceOrStockQuestion(text) {
  const lower = String(text ?? '').toLowerCase();
  if (PRICE_WORDS.some((w) => lower.includes(w))) return true;
  if (STOCK_WORDS.some((w) => lower.includes(w))) return true;
  if (KHMER_PRICE_WORDS.some((w) => text.includes(w))) return true;
  if (KHMER_STOCK_WORDS.some((w) => new RegExp(`(?<!\u17D2)${w}`).test(text))) return true;
  return false;
}

function isPriceQuestion(text) {
  const lower = String(text ?? '').toLowerCase();
  return PRICE_WORDS.some((w) => lower.includes(w));
}

// Words that only frame a question, never name a product. Used to tell
// "How much is it?" (no product named) from "Do you sell fresh fish?"
// (a product named, but not in the sheet).
const QUESTION_WORDS = new Set([
  ...STOPWORDS,
  'price', 'prices', 'cost', 'costs', 'costing', 'pricing', 'stock',
  'sell', 'sells', 'sold', 'available', 'left', 'fresh', 'know', 'per',
  'kg', 'g', 'ml', 'much', 'many', 'any', 'some', 'one', 'two', 'three',
]);

function hasNamedNoun(text) {
  return tokens(text).some((t) => !QUESTION_WORDS.has(t));
}

const ORDER_WORDS = ['order', 'buy', 'want', 'book', 'reserve'];

// A "how" question is a how-to question, not an order: "How do I order?"
// and "How can I contact a human?" are FAQ questions, not enquiries.
function startsWithHow(text) {
  return /^\s*how\b/i.test(String(text ?? ''));
}

function hasOrderIntent(text) {
  if (startsWithHow(text)) return false;
  const lower = String(text ?? '').toLowerCase();
  return ORDER_WORDS.some((w) => new RegExp(`\\b${w}\\b`).test(lower));
}

const CONTACT_MARKERS = [
  'enquir', 'ask about', 'tell me about', 'call me', 'call us',
  'contact', 'deliver to me', 'deliver to us', 'deliver for me',
  'deliver for us',
];

function hasContactIntent(text) {
  if (startsWithHow(text)) return false;
  const lower = String(text ?? '').toLowerCase();
  return CONTACT_MARKERS.some((w) => lower.includes(w));
}

// A phone number is a run of 8 to 15 digits, allowing spaces and dashes.
const PHONE_RE = /(?:\+?855[\s-]?\d{2,3}[\s-]?\d{3,4}[\s-]?\d{3,4}|0\d{2}[\s-]?\d{3}[\s-]?\d{3,4}|\b\d{9,15}\b)/;

function extractPhone(text) {
  const m = String(text ?? '').match(PHONE_RE);
  return m ? m[0].trim() : null;
}

function hasPhone(text) {
  return extractPhone(text) !== null;
}

function extractName(text) {
  const s = String(text ?? '');
  let m = s.match(/my name is\s+([A-Za-z\u1780-\u17FF][A-Za-z\u1780-\u17FF .'-]{1,40})/i);
  if (m) return m[1].trim();
  m = s.match(/name\s*[:\-]\s*([A-Za-z\u1780-\u17FF][A-Za-z\u1780-\u17FF .'-]{1,40})/i);
  if (m) return m[1].trim();
  m = s.match(/\bi am\s+([A-Z][A-Za-z\u1780-\u17FF]+(?:\s+[A-Z][A-Za-z\u1780-\u17FF]+)?)/);
  if (m) return m[1].trim();
  return null;
}

// A bare number in an order ("I want to order 2") is a quantity.
// Strip any phone number first so its digits are never read as one.
function extractQuantity(text) {
  const withoutPhone = String(text ?? '').replace(PHONE_RE, ' ');
  const m = withoutPhone.match(/\b(\d{1,3})\b/);
  return m ? Number(m[1]) : null;
}

// Format a Khmer riel amount the way the demo shows it: 26000 -> 26,000.
// The digits themselves are copied verbatim from the CSV row.
function formatKhr(raw) {
  const s = String(raw ?? '').trim();
  if (/^\d+$/.test(s)) return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return s;
}

function stockNumber(product) {
  const n = Number(String(product.stock ?? '').trim());
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------------
// Handover rules
// ---------------------------------------------------------------------------

// Built-in trigger sets. Each set maps to a row in handover.csv whose
// rule or id mentions the same key word (for example a rule of
// "Customer is angry or upset" matches key "angry"). If no row matches,
// the first handover row is used. If the sheet is empty, a fixed generic
// reply is used so the bot still hands over instead of guessing.
const HANDOVER_TRIGGERS = [
  {
    key: 'angry',
    reason: 'angry or upset customer',
    words: ['angry', 'upset', 'furious', 'terrible', 'awful', 'worst', 'disappointed', 'frustrated', 'frustrating', 'hate', 'rude', 'scam', 'cheat', 'cheating', 'unhappy', 'mad', 'annoyed', 'disgusting'],
  },
  {
    key: 'refund',
    reason: 'refund request',
    words: ['refund', 'money back', 'return my money', 'give my money back', 'give back my money'],
  },
  {
    key: 'complaint',
    reason: 'complaint',
    words: ['complaint', 'complain', 'broken', 'damaged', 'wrong order', 'late delivery', 'never arrived', 'did not arrive', 'didnt arrive', 'missing item', 'bad quality', 'spoiled', 'expired'],
  },
  {
    key: 'human',
    reason: 'customer wants a human',
    words: ['human', 'real person', 'speak to someone', 'talk to someone', 'customer service', 'manager', 'agent', 'staff', 'someone real', 'real human'],
  },
  {
    key: 'discount',
    reason: 'discount or negotiation',
    words: ['discount', 'cheaper', 'negotiate', 'lower the price', 'lower price', 'lower', 'bargain', 'special price', 'can you do', 'make it cheaper', 'reduce the price', 'too high', 'too expensive', 'free'],
  },
];

const KEY_ALIASES = {
  notfound: ['not found', 'unknown product', 'no product', 'not in', 'missing product'],
  phone: ['phone', 'number', 'call back', 'callback', 'called'],
  low: ['low', 'does not understand', 'not sure'],
};

const FALLBACK_REPLY =
  'I am not sure about that. I will pass this to the team and they will reply soon.';
const PASS_LINE = 'I will pass this to the team and they will reply soon.';
const GENERIC_HANDOVER_REPLY =
  'Let me pass you to a member of our team. They will help you shortly.';

function findHandoverRow(handover, key) {
  if (!handover || handover.length === 0) return null;
  const needles = [key, ...(KEY_ALIASES[key] || [])];
  const row = handover.find((r) => {
    const hay = `${r.rule || ''} ${r.id || ''}`.toLowerCase();
    return needles.some((n) => hay.includes(n));
  });
  return row || handover[0];
}

// ---------------------------------------------------------------------------
// Product and FAQ matching
// ---------------------------------------------------------------------------

// Romanized Khmer names for the products, so "Skor tnout" finds palm
// sugar and "Kafe" finds coffee even though the sheet only carries the
// English and Khmer-script names.
const PRODUCT_ALIASES = {
  P01: ['kampot', 'mrech', 'mreah'],
  P02: ['skor', 'tnout', 'tnaot'],
  P03: ['svay', 'krieb', 'kreib'],
  P04: ['kanseng', 'sot', 'sout'],
  P05: ['breng', 'doung', 'dong'],
  P06: ['kafe', 'kaffey'],
  P07: ['mee', 'angkor', 'mi'],
  P08: ['kontrak', 'kontrok'],
};

function productCandidates(products, text) {
  const lower = String(text ?? '').toLowerCase();
  const textTokens = new Set(tokens(text));
  const scored = [];
  for (const p of products) {
    const nameTokens = [
      ...tokens(`${p.name_en || ''} ${p.category || ''} ${p.notes || ''}`),
      ...(PRODUCT_ALIASES[String(p.id)] || []),
    ];
    let score = 0;
    for (const t of new Set(nameTokens)) {
      if (textTokens.has(t)) score += 1;
    }
    // A full name written out in the message is an exact match.
    if (p.name_en && lower.includes(String(p.name_en).toLowerCase())) score += 5;
    // Khmer names usually have no spaces, so substring match is the
    // reliable check for Khmer script.
    if (p.name_kh && String(text).includes(p.name_kh)) score += 5;
    if (score > 0) scored.push({ product: p, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

// Khmer-script words that point at an FAQ, for messages typed in Khmer
// script where the sheet keywords are English.
const KHMER_FAQ_WORDS = {
  F01: ['បើក', 'ម៉ោង'],
  F02: ['ដឹកជញ្ជូន', 'ភ្នំពេញ'],
  F03: ['ក្រៅភ្នំពេញ', 'ខេត្ត'],
  F04: ['ទទួល', 'សាច់ប្រាក់'],
  F05: ['បញ្ជា', 'កម្ម៉ង់'],
  F06: ['ប្តូរ', 'ដូរ'],
  F07: ['បោះដុំ'],
  F08: ['ក្រៅប្រទេស'],
  F09: ['ហាឡាល'],
  F10: ['មនុស្ស'],
};

// FAQ score: how much of the message the FAQ question covers (recall),
// plus one per matching keyword, plus three per matching Khmer word.
// Recall first keeps "Do you deliver outside Phnom Penh?" on the
// outside-Phnom-Penh FAQ instead of the Phnom Penh one: the outside
// question covers the whole message, the inside one does not.
function faqCandidates(faqs, text) {
  const msgTokens = tokens(text);
  const msgTokenSet = new Set(msgTokens);
  const lower = String(text ?? '').toLowerCase();
  const scored = [];
  for (const f of faqs) {
    const qTokens = tokens(f.question_en || '');
    const matchedQ = qTokens.filter((t) => msgTokenSet.has(t)).length;
    const recall = msgTokens.length > 0 ? matchedQ / msgTokens.length : 0;
    const keys = String(f.keywords || '')
      .split(',')
      .map((k) => k.trim().toLowerCase())
      .filter(Boolean);
    let kw = 0;
    for (const k of keys) {
      if (k.includes(' ')) {
        if (lower.includes(k)) kw += 1;
      } else if (msgTokenSet.has(k)) {
        kw += 1;
      }
    }
    let kh = 0;
    for (const w of KHMER_FAQ_WORDS[String(f.id)] || []) {
      if (String(text).includes(w)) kh += 1;
    }
    const score = recall * 10 + kw + kh * 3;
    if (score > 0) scored.push({ faq: f, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

// ---------------------------------------------------------------------------
// Greetings, how-to-order, catalogue
// ---------------------------------------------------------------------------

const GREETING_RE =
  /^(hello|hi|hey)(\s+there)?[!.,\s]*$|^good\s+(morning|afternoon|evening)[!.,\s]*$|^sua\s*s'?dei[!.,\s]*$|^suostei[!.,\s]*$|^chom\s+reap(\s+sour)?[!.,\s]*$|^សួស្តី[!.,\s]*$/i;

const HOW_TO_ORDER_RE =
  /how\s+(do|can|to)\s+(i\s+)?(order|buy)|doch\s+mdach|order\s+doch/i;

const CATALOGUE_RE = /what do you sell|what products|what are you selling|show .*products|list .*products/i;

const PRONOUN_RE = /\b(that one|this one|it)\b/i;

// ---------------------------------------------------------------------------
// Fallback clarification questions (wording from data/README.md)
// ---------------------------------------------------------------------------

function clarificationFor(text) {
  if (isPriceQuestion(text)) return 'Which product would you like the price for?';
  if (/\btime\b/i.test(String(text ?? ''))) return 'What time do you mean?';
  return 'Which product are you asking about?';
}

function fallbackWithClarification(text) {
  return `${clarificationFor(text)} ${PASS_LINE}`;
}

// Words the bot recognises at all. A message with no recognised word
// (for example "asdf qwerty zzz") hands over under the low-confidence
// rule instead of getting a fallback.
const KNOWN_WORDS = new Set([
  ...STOPWORDS,
  'time', 'today', 'tomorrow', 'yesterday', 'week', 'month', 'year',
  'morning', 'afternoon', 'evening', 'night', 'day', 'sell', 'sells',
  'fresh', 'fish', 'price', 'prices', 'cost', 'costs', 'stock',
  'available', 'deliver', 'delivery', 'order', 'buy', 'want', 'call',
  'contact', 'human', 'person', 'help', 'please', 'thanks', 'thank',
  'hello', 'hi', 'hey', 'good', 'bad', 'open', 'close', 'closed', 'shop',
  'store', 'product', 'products', 'item', 'items', 'money', 'cash',
  'card', 'pay', 'payment', 'return', 'refund', 'discount', 'cheaper',
  'expensive', 'high', 'low', 'angry', 'upset', 'terrible', 'awful',
  'complain', 'complaint', 'speak', 'talk', 'real', 'bot', 'team',
  'member', 'phone', 'number', 'name', 'address', 'location', 'where',
  'when', 'which', 'who', 'whom', 'whose', 'why', 'how', 'what', 'am',
  'be', 'been', 'will', 'shall', 'about', 'with', 'without', 'from',
  'into', 'over', 'under', 'between', 'but', 'if', 'then', 'than', 'so',
  'such', 'as', 'by', 'may', 'might', 'must', 'one', 'two', 'three',
  'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'much', 'many',
  'more', 'less', 'very', 'really', 'just', 'now', 'soon', 'later',
  'here', 'there', 'our', 'us', 'was', 'were', 'does', 'did', 'could',
  'would', 'should', 'enquire', 'enquiry', 'ask', 'tell', 'know', 'need',
  'like', 'love', 'hate', 'sorry', 'ok', 'okay', 'yes', 'no', 'not',
  'never', 'always', 'every', 'each', 'all', 'any', 'some', 'none',
  'other', 'another', 'same', 'different', 'new', 'old', 'big', 'small',
  'hot', 'cold', 'sweet', 'black', 'white', 'red', 'green', 'blue',
]);

// ---------------------------------------------------------------------------
// Bot
// ---------------------------------------------------------------------------

export function createBot({ products = [], faqs = [], handover = [], apiKey = null, aiAssist = defaultAiAssist } = {}) {
  // Per-session state, kept in memory only.
  // sessions: sessionId -> { paused, pausedReply, pausedReason, pendingEnquiry }
  const sessions = new Map();
  // Bound the session table: a flood of new session ids must not grow
  // memory without limit. Sessions are in-memory only and lost on
  // restart.
  const MAX_SESSIONS = 500;

  // Enrich the known-words set with the vocabulary from the sheets.
  for (const p of products) {
    for (const t of tokens(`${p.name_en || ''} ${p.category || ''} ${p.notes || ''}`)) {
      KNOWN_WORDS.add(t);
    }
    for (const a of PRODUCT_ALIASES[String(p.id)] || []) KNOWN_WORDS.add(a);
  }
  for (const f of faqs) {
    for (const t of tokens(`${f.question_en || ''} ${f.keywords || ''}`)) {
      KNOWN_WORDS.add(t);
    }
  }
  for (const w of ROMAN_KHMER_WORDS) KNOWN_WORDS.add(w);

  function getSession(sessionId) {
    if (!sessions.has(sessionId)) {
      // Drop the oldest session when the table is full.
      if (sessions.size >= MAX_SESSIONS) {
        const oldest = sessions.keys().next().value;
        if (oldest !== undefined) sessions.delete(oldest);
      }
      sessions.set(sessionId, {
        paused: false,
        pausedReply: null,
        pausedReason: null,
        pendingEnquiry: null,
      });
    }
    return sessions.get(sessionId);
  }

  function baseResult(overrides) {
    return {
      reply: '',
      language: 'en',
      confidence: 0.4,
      handover: false,
      handoverReason: null,
      enquiry: null,
      source: 'fallback',
      matchedId: null,
      ...overrides,
    };
  }

  function doHandover(session, language, key, reason) {
    const row = findHandoverRow(handover, key);
    const reply = row
      ? handoverLocalised(row, language)
      : GENERIC_HANDOVER_REPLY;
    session.paused = true;
    session.pausedReply = reply;
    session.pausedReason = reason;
    return baseResult({
      reply,
      language,
      confidence: 0.9,
      handover: true,
      handoverReason: reason,
      source: 'handover',
      matchedId: row ? String(row.id) : null,
    });
  }

  function productReply(product, language, text) {
    const stock = stockNumber(product);
    const pricePart = `$${product.price_usd} (${formatKhr(product.price_khr)} riel)`;
    let stockPart;
    if (stock === null) stockPart = '';
    else if (stock === 0) stockPart = 'Out of stock';
    else stockPart = `In stock: ${stock}`;
    const nameEn = product.name_en || product.name_kh || 'this product';
    // Show both names so Khmer-script questions get the Khmer name in
    // the reply and English questions get the English name.
    const name =
      product.name_kh && product.name_en
        ? language === 'kh'
          ? `${product.name_kh} (${nameEn})`
          : `${nameEn} (${product.name_kh})`
        : nameEn;
    const askPriceOrStock = isPriceOrStockQuestion(text);
    let reply;
    if (askPriceOrStock && stock === 0) {
      reply = `${name} costs ${pricePart}. Out of stock.`;
    } else if (askPriceOrStock) {
      reply = `${name} costs ${pricePart}. ${stockPart}.`;
    } else {
      reply = `${name} costs ${pricePart}. ${stockPart}.`;
      if (product.notes) reply += ` ${product.notes}`;
    }
    return reply.trim();
  }

  // Optional AI rerank: only used when a key is configured and there is
  // more than one candidate. Returns the preferred item or null.
  async function rerank(text, candidates, labelOf) {
    if (!apiKey || !aiAssist || candidates.length < 2) return null;
    try {
      const picked = await aiAssist({
        text,
        candidates: candidates.map((c) => ({ id: String(c.id), label: labelOf(c) })),
        apiKey,
      });
      if (!picked || !picked.pickedId) return null;
      return candidates.find((c) => String(c.id) === String(picked.pickedId)) || null;
    } catch {
      return null;
    }
  }

  // Staged missing-info flow. Returns a result when the enquiry is
  // complete or a question must be asked, else null to keep going.
  function enquiryStep(session, language, kind, known) {
    const ask = (question) =>
      baseResult({
        reply: `${question} ${PASS_LINE}`,
        language,
        confidence: 0.4,
        source: 'fallback',
        matchedId: null,
      });
    if (kind === 'order') {
      if (!known.product) {
        session.pendingEnquiry = { ...known, kind };
        return ask('Which product would you like to order?');
      }
      if (!known.quantity) {
        session.pendingEnquiry = { ...known, kind };
        return ask('How many would you like to order?');
      }
    }
    if (!known.name) {
      session.pendingEnquiry = { ...known, kind };
      return ask('Could you tell me your name, please?');
    }
    if (!known.phone) {
      session.pendingEnquiry = { ...known, kind };
      return ask('Could you share your phone number, please?');
    }
    // Everything is known: record the enquiry.
    session.pendingEnquiry = null;
    const enquiry = {
      name: known.name,
      phone: known.phone,
      product: known.product || null,
      message: known.message || '',
      language,
    };
    const productBit = known.product ? ` for ${known.product}` : '';
    return baseResult({
      reply:
        `Thank you, ${known.name}. We have your order${productBit} ` +
        `and will call you at ${known.phone} soon.`,
      language,
      confidence: 0.9,
      source: 'enquiry',
      enquiry,
      matchedId: null,
    });
  }

  async function handleMessageInner({ sessionId = 'default', text = '' } = {}) {
    const message = String(text ?? '');
    const language = detectLanguage(message);
    const session = getSession(sessionId);

    // Paused sessions stay paused until resumeSession is called.
    if (session.paused) {
      return baseResult({
        reply: session.pausedReply || GENERIC_HANDOVER_REPLY,
        language,
        confidence: 0.9,
        handover: true,
        handoverReason: session.pausedReason || 'handed over to the team',
        source: 'handover',
        matchedId: null,
      });
    }

    const lower = message.toLowerCase();
    const trimmed = message.trim();

    // --- Handover rules, checked first. ---
    for (const trigger of HANDOVER_TRIGGERS) {
      // "How can I contact a human?" is an FAQ question, not a demand
      // for a human; the how-question guard keeps it out of handover.
      if (trigger.key === 'human' && startsWithHow(message)) continue;
      if (trigger.words.some((w) => lower.includes(w))) {
        return doHandover(session, language, trigger.key, trigger.reason);
      }
    }

    const productScoredEarly = productCandidates(products, message);
    const nameEarly = extractName(message);

    // "Call me" with no product and no name is a request to be called.
    // With a product ("Please call me about palm sugar") it is an
    // enquiry, handled below.
    if (
      /\bcall (me|us)\b/i.test(message) &&
      productScoredEarly.length === 0 &&
      !nameEarly
    ) {
      return doHandover(session, language, 'phone', 'customer asks to be called');
    }

    // A phone number on its own hands over (the customer probably wants
    // a call back). It does NOT hand over inside an enquiry: when the
    // message is an order, a contact request, answers a pending enquiry,
    // or carries a name, the number is the contact detail the enquiry
    // needs.
    const orderIntent = hasOrderIntent(message);
    const contactIntent = hasContactIntent(message);
    if (
      hasPhone(message) &&
      !orderIntent &&
      !contactIntent &&
      !session.pendingEnquiry &&
      !nameEarly
    ) {
      return doHandover(session, language, 'phone', 'phone number shared');
    }

    // --- Greeting on its own -> opening-hours FAQ. ---
    if (GREETING_RE.test(trimmed)) {
      const hours = faqs.find(
        (f) =>
          String(f.keywords || '').toLowerCase().includes('hours') ||
          String(f.question_en || '').toLowerCase().includes('opening hours'),
      );
      if (hours) {
        const reply =
          language === 'kh' || language === 'kh-roman'
            ? hours.answer_kh || hours.answer_en
            : hours.answer_en;
        return baseResult({
          reply,
          language,
          confidence: 0.9,
          source: 'faqs',
          matchedId: String(hours.id),
        });
      }
    }

    // --- "How do I order?" is a how-to question, not an order. ---
    if (HOW_TO_ORDER_RE.test(message)) {
      const howTo = faqs.find((f) =>
        String(f.keywords || '')
          .toLowerCase()
          .includes('how to order'),
      );
      if (howTo) {
        return baseResult({
          reply: faqLocalised(howTo, language),
          language,
          confidence: 0.9,
          source: 'faqs',
          matchedId: String(howTo.id),
        });
      }
    }

    // --- "What do you sell?" -> the product catalogue. ---
    if (CATALOGUE_RE.test(message)) {
      const list = products
        .map(
          (p) =>
            `${p.name_en} $${p.price_usd} (${formatKhr(p.price_khr)} riel)`,
        )
        .join('; ');
      return baseResult({
        reply: `We sell: ${list}.`,
        language,
        confidence: 0.9,
        source: 'products',
        matchedId: null,
      });
    }

    // --- Pronoun with no product named: ask which product. ---
    if (PRONOUN_RE.test(message) && productScoredEarly.length === 0) {
      return baseResult({
        reply: fallbackWithClarification(message),
        language,
        confidence: 0.4,
        source: 'fallback',
        matchedId: null,
      });
    }

    // --- Enquiry flow. ---
    const phoneEarly = extractPhone(message);
    const productNameEarly = productScoredEarly[0]
      ? productScoredEarly[0].product.name_en
      : null;
    const quantityEarly = extractQuantity(message);

    // Finish an enquiry that is waiting for details.
    if (session.pendingEnquiry) {
      const pending = session.pendingEnquiry;
      const merged = {
        kind: pending.kind,
        product: productNameEarly || pending.product || null,
        quantity: quantityEarly || pending.quantity || null,
        name: nameEarly || pending.name || null,
        phone: phoneEarly || pending.phone || null,
        message: pending.message || message,
      };
      // What the bot asked for last is what a bare reply answers: a bare
      // name ("Dara") answers a name question, a bare number ("2")
      // answers a quantity question. Any other bare word is not an
      // answer, so it is left for the normal checks below.
      const nextMissing =
        merged.kind === 'order'
          ? !merged.product
            ? 'product'
            : !merged.quantity
              ? 'quantity'
              : !merged.name
                ? 'name'
                : !merged.phone
                  ? 'phone'
                  : null
          : !merged.name
            ? 'name'
            : !merged.phone
              ? 'phone'
              : null;
      if (
        nextMissing === 'name' &&
        !merged.name &&
        /^[A-Za-z\u1780-\u17FF][A-Za-z\u1780-\u17FF' .-]{1,40}$/.test(trimmed)
      ) {
        merged.name = trimmed;
      }
      if (nextMissing === 'quantity' && !merged.quantity && /^\d+$/.test(trimmed)) {
        merged.quantity = Number(trimmed);
      }
      const gotSomething =
        merged.name !== pending.name ||
        merged.phone !== pending.phone ||
        merged.product !== pending.product ||
        merged.quantity !== pending.quantity;
      if (gotSomething) {
        const step = enquiryStep(session, language, merged.kind, merged);
        if (step) return step;
      }
      // No new enquiry detail in this message: keep the pending enquiry
      // open and answer the message normally below.
    }

    // Start a new enquiry. When one is already pending and this message
    // added nothing new, keep the pending details instead of starting
    // over with a blank slate.
    if (orderIntent || contactIntent || nameEarly) {
      const pending = session.pendingEnquiry;
      const kind = pending ? pending.kind : contactIntent ? 'contact' : 'order';
      const known = {
        kind,
        product: productNameEarly || (pending && pending.product) || null,
        quantity: quantityEarly || (pending && pending.quantity) || null,
        name: nameEarly || (pending && pending.name) || null,
        phone: phoneEarly || (pending && pending.phone) || null,
        message: (pending && pending.message) || message,
      };
      const step = enquiryStep(session, language, kind, known);
      if (step) return step;
    }

    // --- Product price / stock questions. ---
    if (productScoredEarly.length > 0) {
      let best = productScoredEarly[0];
      const aiPick = await rerank(
        message,
        productScoredEarly.map((s) => s.product),
        (p) => `${p.name_en || ''} ${p.name_kh || ''}`.trim(),
      );
      if (aiPick) {
        const found = productScoredEarly.find((s) => s.product === aiPick);
        if (found) best = found;
      }
      const exact =
        best.score >= 5 ||
        (best.product.name_en &&
          lower.includes(String(best.product.name_en).toLowerCase())) ||
        (best.product.name_kh && message.includes(best.product.name_kh));
      return baseResult({
        reply: productReply(best.product, language, message),
        language,
        confidence: exact ? 0.9 : 0.7,
        source: 'products',
        matchedId: String(best.product.id),
      });
    }

    // --- FAQ keyword match. ---
    // The FAQ check runs before the product-not-found handover on
    // purpose: "Do you offer wholesale prices?" is an FAQ question
    // that merely contains the word "prices", not a product question.
    const faqScored = faqCandidates(faqs, message);
    if (faqScored.length > 0) {
      let best = faqScored[0];
      const aiPick = await rerank(
        message,
        faqScored.map((s) => s.faq),
        (f) => f.question_en || '',
      );
      if (aiPick) {
        const found = faqScored.find((s) => s.faq === aiPick);
        if (found) best = found;
      }
      return baseResult({
        reply: faqLocalised(best.faq, language),
        language,
        confidence: best.score >= 8 ? 0.9 : 0.7,
        source: 'faqs',
        matchedId: String(best.faq.id),
      });
    }

    // A product question naming a product that is not in the sheet
    // hands over. A question naming no product at all ("How much?")
    // is a fallback with a clarification question instead.
    if (
      (isPriceOrStockQuestion(message) ||
        /\bdo you sell\b/i.test(message) ||
        /\bsell\b/i.test(message)) &&
      hasNamedNoun(message)
    ) {
      return doHandover(session, language, 'notfound', 'product not found');
    }

    // --- Fallback. ---
    const msgTokens = tokens(message);
    if (msgTokens.length > 0 && !msgTokens.some((t) => KNOWN_WORDS.has(t))) {
      // No recognisable word at all: low-confidence handover rule.
      return doHandover(session, language, 'low', 'bot does not understand');
    }
    if (msgTokens.length === 0 && trimmed === '') {
      return baseResult({
        reply: FALLBACK_REPLY,
        language,
        confidence: 0.4,
        source: 'fallback',
        matchedId: null,
      });
    }
    return baseResult({
      reply: fallbackWithClarification(message),
      language,
      confidence: 0.4,
      source: 'fallback',
      matchedId: null,
    });
  }

  // Serialize work per session: two messages for the same session can
  // otherwise interleave while one awaits the AI rerank, and the second
  // can read or overwrite the first one's pending-enquiry state. A
  // per-session promise chain makes each message run to completion
  // before the next one for that session starts. Different sessions
  // still run in parallel.
  const queues = new Map();
  async function handleMessage(args) {
    const sessionId = String((args && args.sessionId) || 'default');
    const prev = queues.get(sessionId) || Promise.resolve();
    const run = prev.then(() => handleMessageInner(args));
    // Store a non-rejecting promise so one failure cannot stall the
    // queue for the session; the caller still sees the real result.
    queues.set(sessionId, run.catch(() => {}));
    return run;
  }

  function resumeSession(sessionId) {
    const session = sessions.get(sessionId);
    if (!session || !session.paused) return false;
    session.paused = false;
    session.pausedReply = null;
    session.pausedReason = null;
    return true;
  }

  return { handleMessage, resumeSession };
}
