import fs from 'fs';
import path from 'path';
import translateGoogle from 'translate-google';

const CACHE_FILE = path.join(process.cwd(), 'translate-cache.json');
let memoryCache = null;

function loadCache() {
  if (memoryCache) return memoryCache;
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      memoryCache = new Map(Object.entries(data));
    } else {
      memoryCache = new Map();
    }
  } catch {
    memoryCache = new Map();
  }
  return memoryCache;
}

function saveCache() {
  if (!memoryCache) return;
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(Object.fromEntries(memoryCache), null, 2), 'utf8');
  } catch (err) {
    // Ignore cache write error
  }
}

function hasCyrillic(text) {
  return /[а-яА-ЯёЁ]/.test(String(text || ''));
}

/**
 * 1. Official Google Translate API (when API key is provided)
 */
async function translateWithGoogleCloud(texts, apiKey) {
  const url = `https://translation.googleapis.com/language/translate/v2?key=${apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      q: texts,
      target: 'en',
      source: 'ru',
      format: 'text',
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData?.error?.message || `Google Translate API HTTP ${response.status}`);
  }
  const data = await response.json();
  const translations = data?.data?.translations;
  if (!Array.isArray(translations) || translations.length !== texts.length) {
    throw new Error('Google Translate API returned unexpected format');
  }
  return translations.map((t) => t.translatedText);
}

/**
 * 2. Google Chrome Dict API (fast, high quality, free endpoint)
 */
async function translateWithGoogleDict(text) {
  const url = new URL('https://clients5.google.com/translate_a/t');
  url.searchParams.set('client', 'dict-chrome-ex');
  url.searchParams.set('sl', 'ru');
  url.searchParams.set('tl', 'en');
  url.searchParams.set('q', text);

  const res = await fetch(url.toString(), {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 429) {
    throw new Error('Google Translate 429 rate limit');
  }
  if (!res.ok) {
    throw new Error(`Google Translate HTTP ${res.status}`);
  }
  const data = await res.json();
  const translated = Array.isArray(data) ? data[0] : null;
  if (!translated || typeof translated !== 'string') {
    throw new Error('Google Translate returned empty response');
  }
  return translated;
}

/**
 * 3. Grok AI (xAI) translation fallback
 */
async function translateWithGrok(texts, apiKey) {
  const res = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'grok-2-latest',
      messages: [
        {
          role: 'system',
          content: 'You are an expert translator. Translate the following Russian e-commerce product titles to natural English. Return ONLY a valid JSON array of strings in the exact same order and length.',
        },
        { role: 'user', content: JSON.stringify(texts) },
      ],
      temperature: 0.1,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    throw new Error(`Grok API returned HTTP ${res.status}`);
  }
  const data = await res.json();
  const raw = String(data?.choices?.[0]?.message?.content || '').trim();
  const jsonStr = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  const parsed = JSON.parse(jsonStr);
  if (!Array.isArray(parsed) || parsed.length !== texts.length) {
    throw new Error('Grok response did not match expected array length');
  }
  return parsed.map((item) => String(item || '').trim());
}

/**
 * 4. Free MyMemory translation fallback
 */
async function translateWithMyMemory(text) {
  const url = new URL('https://api.mymemory.translated.net/get');
  url.searchParams.set('q', text.slice(0, 450));
  url.searchParams.set('langpair', 'ru|en');
  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error('MyMemory HTTP error');
  const data = await res.json();
  const translated = String(data?.responseData?.translatedText || '').trim();
  if (!translated || /invalid|quota|query length/i.test(translated)) throw new Error('MyMemory quota exceeded');
  return translated;
}

/**
 * Single text translation with Google first, then Grok fallback
 */
export async function translateText(text) {
  if (!text || text === 'Unknown Product' || !hasCyrillic(text)) {
    return text;
  }

  const cache = loadCache();
  if (cache.has(text)) {
    return cache.get(text);
  }

  // 1. Google Translate First
  const googleApiKey = process.env.GOOGLE_TRANSLATE_API_KEY;
  if (googleApiKey) {
    try {
      const [res] = await translateWithGoogleCloud([text], googleApiKey);
      if (res) {
        cache.set(text, res);
        saveCache();
        return res;
      }
    } catch (err) {
      console.warn(`[Translate] Google Cloud API error (${err.message}). Trying fallback.`);
    }
  }

  try {
    const res = await translateWithGoogleDict(text);
    if (res) {
      cache.set(text, res);
      saveCache();
      return res;
    }
  } catch (err) {
    console.warn(`[Translate] Google Dict error (${err.message}). Switching to Grok/fallback.`);
  }

  try {
    const res = await translateGoogle(text, { to: 'en' });
    if (res) {
      cache.set(text, res);
      saveCache();
      return res;
    }
  } catch {
    // continue to Grok
  }

  // 2. Grok Fallback when Google exceeds limits or fails
  const grokApiKey = process.env.GROK_API_KEY;
  if (grokApiKey) {
    try {
      const [res] = await translateWithGrok([text], grokApiKey);
      if (res) {
        cache.set(text, res);
        saveCache();
        return res;
      }
    } catch (err) {
      console.warn(`[Translate] Grok error (${err.message}).`);
    }
  }

  // 3. MyMemory Fallback
  try {
    const res = await translateWithMyMemory(text);
    if (res) {
      cache.set(text, res);
      saveCache();
      return res;
    }
  } catch {
    // Keep original
  }

  return text;
}

/**
 * Bulk translation for product listings (Google Translate first -> Grok fallback)
 */
export async function translateBulk(textsArray) {
  if (!textsArray || textsArray.length === 0) return [];

  const cache = loadCache();
  const needsTranslation = [];
  const translationMap = new Map();

  for (const text of textsArray) {
    if (!text || text === 'Unknown Product' || !hasCyrillic(text)) {
      translationMap.set(text, text);
    } else if (cache.has(text)) {
      translationMap.set(text, cache.get(text));
    } else if (!translationMap.has(text)) {
      needsTranslation.push(text);
      translationMap.set(text, null);
    }
  }

  if (needsTranslation.length > 0) {
    let success = false;

    // 1. TRY GOOGLE TRANSLATE FIRST
    const googleApiKey = process.env.GOOGLE_TRANSLATE_API_KEY;
    if (googleApiKey) {
      try {
        const results = await translateWithGoogleCloud(needsTranslation, googleApiKey);
        for (let i = 0; i < needsTranslation.length; i++) {
          const trans = results[i] || needsTranslation[i];
          translationMap.set(needsTranslation[i], trans);
          cache.set(needsTranslation[i], trans);
        }
        success = true;
      } catch (err) {
        console.warn(`[Translate] Google Cloud bulk error: ${err.message}. Trying next Google endpoint.`);
      }
    }

    if (!success) {
      try {
        // Run Google Dict in batches of 5
        const batchSize = 5;
        for (let i = 0; i < needsTranslation.length; i += batchSize) {
          const batch = needsTranslation.slice(i, i + batchSize);
          const results = await Promise.all(
            batch.map(async (str) => {
              try {
                return await translateWithGoogleDict(str);
              } catch {
                return null;
              }
            })
          );
          for (let j = 0; j < batch.length; j++) {
            if (results[j]) {
              translationMap.set(batch[j], results[j]);
              cache.set(batch[j], results[j]);
            }
          }
        }
        // Check if all were translated
        const remaining = needsTranslation.filter((t) => !translationMap.get(t));
        if (remaining.length === 0) {
          success = true;
        }
      } catch (err) {
        console.warn(`[Translate] Google Dict bulk rate-limited/failed: ${err.message}.`);
      }
    }

    // 2. SWITCH TO GROK WHEN GOOGLE EXCEEDS LIMIT / FAILS
    const stillNeeded = needsTranslation.filter((t) => !translationMap.get(t));
    if (stillNeeded.length > 0) {
      const grokApiKey = process.env.GROK_API_KEY;
      if (grokApiKey) {
        try {
          console.log(`[Translate] Google limit reached or missing for ${stillNeeded.length} items. Switching to Grok API.`);
          const grokResults = await translateWithGrok(stillNeeded, grokApiKey);
          for (let i = 0; i < stillNeeded.length; i++) {
            const trans = grokResults[i] || stillNeeded[i];
            translationMap.set(stillNeeded[i], trans);
            cache.set(stillNeeded[i], trans);
          }
        } catch (err) {
          console.warn(`[Translate] Grok fallback failed: ${err.message}.`);
        }
      }
    }

    // 3. FINAL FALLBACK: translate-google package or MyMemory for any leftover
    const finalLeftover = needsTranslation.filter((t) => !translationMap.get(t));
    for (const text of finalLeftover) {
      try {
        const trans = await translateGoogle(text, { to: 'en' });
        translationMap.set(text, trans || text);
        cache.set(text, trans || text);
      } catch {
        try {
          const trans = await translateWithMyMemory(text);
          translationMap.set(text, trans || text);
          cache.set(text, trans || text);
        } catch {
          translationMap.set(text, text);
        }
      }
    }

    saveCache();
  }

  return textsArray.map((t) => translationMap.get(t) || t);
}
