// tests/run.js
// Runs every case in tests/cases.json through the bot and checks the
// expected source, handover flag, language (when given), enquiry (when
// given), and that every expected substring appears in the reply.
// Prints one line per failure, a "PASS x/N" summary, and per-category
// counts. Exits non-zero when any case fails. No dependencies.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadData } from '../src/data.js';
import { createBot } from '../src/bot.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const CASES_FILE = path.join(ROOT, 'tests', 'cases.json');
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');

function fail(message) {
  console.log(`FAIL ${message}`);
}

async function main() {
  if (!fs.existsSync(CASES_FILE)) {
    console.log(`FAIL cases file not found: ${CASES_FILE}`);
    process.exit(1);
  }
  const cases = JSON.parse(fs.readFileSync(CASES_FILE, 'utf8'));
  const data = loadData(DATA_DIR);
  if (data.products.length === 0) console.log('NOTE no products loaded from data/products.csv');
  if (data.faqs.length === 0) console.log('NOTE no FAQs loaded from data/faqs.csv');
  if (data.handover.length === 0) console.log('NOTE no handover rules loaded from data/handover.csv');

  const bot = createBot({
    products: data.products,
    faqs: data.faqs,
    handover: data.handover,
    apiKey: process.env.GEMINI_API_KEY || null,
  });

  let passed = 0;
  const byCategory = new Map();

  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];
    const id = c.id || `case-${i + 1}`;
    const category = c.category || 'uncategorized';
    const text = c.text || c.input || c.message || '';
    // A case without its own sessionId gets a fresh one so handover
    // pauses from one case cannot leak into another.
    const sessionId = c.sessionId || `test-${id}`;
    const expect = c.expect || {};
    const problems = [];

    let result;
    try {
      result = await bot.handleMessage({ sessionId, text });
    } catch (err) {
      problems.push(`threw ${err}`);
      result = null;
    }

    if (result) {
      if (expect.source !== undefined && result.source !== expect.source) {
        problems.push(`source: expected ${expect.source}, got ${result.source}`);
      }
      if (expect.handover !== undefined && result.handover !== expect.handover) {
        problems.push(`handover: expected ${expect.handover}, got ${result.handover}`);
      }
      if (expect.language !== undefined && result.language !== expect.language) {
        problems.push(`language: expected ${expect.language}, got ${result.language}`);
      }
      if (expect.enquiry !== undefined) {
        if (expect.enquiry === true && !result.enquiry) {
          problems.push('enquiry: expected an enquiry object, got null');
        } else if (expect.enquiry === false && result.enquiry) {
          problems.push('enquiry: expected null, got an enquiry object');
        } else if (expect.enquiry && typeof expect.enquiry === 'object') {
          for (const [k, v] of Object.entries(expect.enquiry)) {
            if (result.enquiry?.[k] !== v) {
              problems.push(`enquiry.${k}: expected ${v}, got ${result.enquiry?.[k]}`);
            }
          }
        }
      }
      const contains = expect.contains || [];
      for (const needle of contains) {
        if (!result.reply.includes(needle)) {
          problems.push(`reply missing ${JSON.stringify(needle)} (reply was ${JSON.stringify(result.reply)})`);
        }
      }
    }

    const tally = byCategory.get(category) || { pass: 0, total: 0 };
    tally.total += 1;
    if (problems.length === 0) {
      passed += 1;
      tally.pass += 1;
    } else {
      fail(`[${id}] (${category}) ${JSON.stringify(text)} :: ${problems.join('; ')}`);
    }
    byCategory.set(category, tally);
  }

  const total = cases.length;
  console.log(`PASS ${passed}/${total}`);
  for (const [category, tally] of [...byCategory.entries()].sort()) {
    console.log(`${category}: ${tally.pass}/${tally.total}`);
  }
  if (passed !== total) process.exit(1);
}

main().catch((err) => {
  console.log(`FAIL runner error: ${err}`);
  process.exit(1);
});
