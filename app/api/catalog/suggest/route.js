import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const PREFERRED_MODELS = ['openai/gpt-oss-20b', 'qwen/qwen3.6-27b', 'openai/gpt-oss-120b'];
let cachedModel = '';
let lastReason = '';

function clip(value, max = 80) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function asList(parsed) {
  const source = Array.isArray(parsed) ? parsed : parsed?.suggestions;
  if (!Array.isArray(source)) return [];
  return [...new Set(source.map((item) => clip(item, 60)).filter((item) => item.length >= 1))].slice(0, 8);
}

function parseList(text) {
  const cleaned = String(text || '').replace(/```json|```/gi, '').trim();
  const objectStart = cleaned.indexOf('{');
  if (objectStart >= 0) {
    try {
      const list = asList(JSON.parse(cleaned.slice(objectStart)));
      if (list.length) return list;
    } catch {
      // The model may add text after the JSON object.
    }
  }
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start < 0 || end <= start) return [];
  try {
    return asList(JSON.parse(cleaned.slice(start, end + 1)));
  } catch {
    return [];
  }
}

function promptFor(field, keyword, brand) {
  if (field === 'keyword') {
    return keyword
      ? `The seller typed "${keyword}" as an Amazon search. Return 8 short English search phrases that improve or narrow it.`
      : 'Return 8 short English Amazon search keywords for beauty, personal care, or grocery products a seller might source.';
  }
  if (field === 'brand') {
    return `Return 8 real brand names sold on Amazon for "${keyword || 'skincare'}". Brand names only.`;
  }
  if (field === 'category') {
    const extra = brand ? ` from ${brand}` : '';
    return `Return 6 English product-category leaf names for "${keyword || 'skincare'}"${extra}. Examples: Facial Cleanser, Sunscreen, Hair Serum.`;
  }
  if (field === 'pages') {
    return `Return 4 Amazon scrape page counts between 1 and 5 for "${keyword || 'this search'}", as number strings.`;
  }
  return `Return 4 old-price multipliers between 1.5 and 3 for "${keyword || 'this product'}", as number strings with one decimal.`;
}

function normalize(field, suggestions) {
  if (field === 'pages') {
    const pages = suggestions.map((item) => String(parseInt(item, 10))).filter((item) => Number(item) >= 1 && Number(item) <= 10);
    return pages.length ? [...new Set(pages)].slice(0, 4) : ['1', '2', '3'];
  }
  if (field === 'multiplier') {
    const values = suggestions
      .map((item) => Number(item))
      .filter((item) => item >= 1 && item <= 5)
      .map((item) => String(Math.round(item * 10) / 10));
    return values.length ? [...new Set(values)].slice(0, 4) : ['1.5', '2', '2.5'];
  }
  return suggestions;
}

async function chooseModel(key) {
  if (cachedModel) return cachedModel;
  try {
    const response = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { Authorization: `Bearer ${key}` },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) lastReason = `models-${response.status}`;
    const ids = (Array.isArray(data.data) ? data.data : []).map((item) => item.id).filter(Boolean);
    cachedModel = PREFERRED_MODELS.find((id) => ids.includes(id))
      || ids.find((id) => !/whisper|guard|tts|orpheus|vision/i.test(id))
      || PREFERRED_MODELS[0];
  } catch {
    cachedModel = PREFERRED_MODELS[0];
  }
  return cachedModel;
}

async function askGroq(prompt) {
  const key = process.env.GROQ_API_KEY;
  if (!key) {
    lastReason = 'no-key';
    return [];
  }
  const preferred = await chooseModel(key);
  const models = [...new Set([preferred, ...PREFERRED_MODELS])];
  for (const model of models) {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          temperature: 0.3,
          max_tokens: 400,
          messages: [
            { role: 'system', content: 'Reply with one JSON object only: {"suggestions":["real phrase"]}. Fill suggestions from the user request. No markdown and no placeholder words.' },
            { role: 'user', content: prompt },
          ],
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        lastReason = `${model}:${response.status}`;
        continue;
      }
      const message = data?.choices?.[0]?.message || {};
      const suggestions = parseList(message.content || message.reasoning || '');
      if (suggestions.length) {
        cachedModel = model;
        lastReason = '';
        return suggestions;
      }
      lastReason = `${model}:empty`;
    } catch {
      continue;
    }
  }
  return [];
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const field = String(body.field || '');
  if (!['keyword', 'brand', 'category', 'pages', 'multiplier'].includes(field)) {
    return NextResponse.json({ suggestions: [], note: 'This field has fixed choices.' }, { status: 400 });
  }
  const keyword = clip(body.keyword);
  const brand = clip(body.brand);
  const suggestions = normalize(field, await askGroq(promptFor(field, keyword, brand)));
  return NextResponse.json({
    suggestions,
    note: suggestions.length ? '' : 'AI suggestions are unavailable right now. Type a value and continue.',
  });
}
