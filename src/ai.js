// ai.js
// Optional Gemini reranking layer. The demo runs fully without a key:
// aiAssist returns null and the bot falls back to its own keyword
// matching. AI only picks an id from a candidate list the bot already
// built. It never writes prices, stock, or reply text.

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

// Ask Gemini to pick the best candidate id for the user message.
// Returns { pickedId } or null on any error, missing key, or bad reply.
export async function aiAssist({ text, candidates, apiKey }) {
  if (!apiKey || !Array.isArray(candidates) || candidates.length === 0) {
    return null;
  }
  const ids = candidates.map((c) => String(c.id));
  const list = candidates.map((c) => `${c.id}: ${c.label || ''}`).join('\n');
  const prompt =
    'Pick the single best matching candidate id for this user message. ' +
    'Reply with only the id, nothing else.\n' +
    `Message: ${text}\n` +
    `Candidates:\n${list}`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    let res;
    try {
      res = await fetch(GEMINI_URL, {
        method: 'POST',
        headers: {
          'x-goog-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) return null;
    const data = await res.json();
    const replyText =
      data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') ?? '';
    const picked = replyText.trim().split(/\s+/)[0];
    if (ids.includes(picked)) return { pickedId: picked };
    return null;
  } catch {
    // Network error, timeout, bad JSON, or any other failure: the bot
    // must keep working exactly as if no key were configured.
    return null;
  }
}
