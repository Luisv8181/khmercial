// data.js
// Loads the four CSV files for the Sokha Mart demo.
// No dependencies. Values are kept as strings so prices and stock
// can be copied verbatim into replies.

import fs from 'node:fs';
import path from 'node:path';

// Parse one CSV document into an array of row objects keyed by header.
// Handles quoted fields that contain commas, doubled quotes (""), and
// line breaks inside quoted fields.
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  // Normalise line endings first; quoted newlines are handled below
  // because we scan character by character.
  const src = String(text ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  // Flush the last field and row (a file may not end with a newline).
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // Drop comment rows (lines starting with '#'). The data files carry
  // header comments such as sample-text warnings above the real header.
  const dataRows = rows.filter(
    (r) => !(r.length > 0 && String(r[0]).trim().startsWith('#')),
  );
  if (dataRows.length === 0) return [];

  const headers = dataRows[0].map((h) => h.trim());
  const out = [];
  for (const r of dataRows.slice(1)) {
    if (r.every((c) => c.trim() === '')) continue;
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = r[idx] !== undefined ? r[idx] : '';
    });
    out.push(obj);
  }
  return out;
}

const FILES = {
  products: 'products.csv',
  faqs: 'faqs.csv',
  handover: 'handover.csv',
  enquiries: 'enquiries.csv',
};

// Load all four CSV files from dir. A missing file loads as an empty
// array so the server can still start while data is being prepared;
// the test runner reports missing data as failures instead.
export function loadData(dir) {
  const data = {};
  for (const [key, file] of Object.entries(FILES)) {
    const full = path.join(dir, file);
    if (!fs.existsSync(full)) {
      data[key] = [];
      continue;
    }
    data[key] = parseCsv(fs.readFileSync(full, 'utf8'));
  }
  return data;
}

// Escape one value for writing back to a CSV file.
export function csvEscape(value) {
  const s = String(value ?? '');
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}
