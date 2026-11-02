#!/usr/bin/env bun

import { CONFIG } from "./config.js";
import path from "path";

/**
 * Translate Russian fields for Excel and PDF labels into English.
 */

const CACHE_FILE = path.join(process.cwd(), "translate-cache.json");
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const GROQ_MODELS = [
  process.env.GROQ_MODEL,
  "openai/gpt-oss-20b",
  "openai/gpt-oss-120b",
  "qwen/qwen3.6-27b",
  "llama-3.1-8b-instant",
  "llama-3.3-70b-versatile",
].filter(Boolean);

const hasRussian = (str) => typeof str === "string" && /[а-яА-ЯёЁ]/.test(str);

function addText(set, value) {
  const text = String(value || "").trim();
  if (hasRussian(text)) set.add(text);
}

function russianFields(orders) {
  const names = new Set();
  if (!Array.isArray(orders)) return names;
  for (const order of orders) {
    addText(names, order?.customer?.name);
    addText(names, order?.customer?.address?.address_tail);
    addText(names, order?.financial_data?.cluster_to);
    for (const product of order?.products || []) addText(names, product?.name);
  }
  return [...names];
}

function swap(value, cache) {
  const text = String(value || "").trim();
  return cache.get(text) || text;
}

function applyTranslations(orders, cache) {
  if (!Array.isArray(orders)) return orders;
  return orders.map((order) => ({
    ...order,
    customer: order.customer
      ? {
        ...order.customer,
        name: swap(order.customer.name, cache),
        address: order.customer.address
          ? { ...order.customer.address, address_tail: swap(order.customer.address.address_tail, cache) }
          : order.customer.address,
      }
      : order.customer,
    financial_data: order.financial_data
      ? { ...order.financial_data, cluster_to: swap(order.financial_data.cluster_to, cache) }
      : order.financial_data,
    products: Array.isArray(order.products)
      ? order.products.map((product) => ({ ...product, name: swap(product?.name, cache) }))
      : order.products,
  }));
}

async function loadPersistentCache() {
  const file = Bun.file(CACHE_FILE);
  if (!(await file.exists())) return new Map();
  try {
    return new Map(Object.entries(await file.json()));
  } catch {
    return new Map();
  }
}

async function savePersistentCache(cache) {
  try {
    await Bun.write(CACHE_FILE, JSON.stringify(Object.fromEntries(cache), null, 2));
  } catch {
    /* Render disk may be read-only after boot */
  }
}

async function groqOnce(model, texts) {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      messages: [
        {
          role: "system",
          content: "Translate Russian shipping text to natural English. Keep brand names, codes, and numbers. Return only a JSON array of strings, same order and length as the input.",
        },
        { role: "user", content: JSON.stringify(texts) },
      ],
    }),
    signal: AbortSignal.timeout(45_000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || `Groq returned HTTP ${response.status}`);
  }
  const raw = String(data?.choices?.[0]?.message?.content || "").trim();
  const json = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const parsed = JSON.parse(json);
  if (!Array.isArray(parsed) || parsed.length !== texts.length) {
    throw new Error("Groq did not return one translation per line.");
  }
  return parsed.map((item) => String(item || "").trim());
}

async function translateWithGroq(texts, logger) {
  if (!GROQ_API_KEY || texts.length === 0) return null;
  let lastError = "";
  const tried = new Set();
  for (const model of GROQ_MODELS) {
    if (tried.has(model)) continue;
    tried.add(model);
    try {
      const parsed = await groqOnce(model, texts);
      logger.info(`Translated ${texts.length} line(s) with Groq (${model}).`);
      return parsed;
    } catch (error) {
      lastError = error.message;
      logger.warn(`Groq model ${model} failed: ${lastError}`);
    }
  }
  throw new Error(lastError || "No Groq model accepted this request.");
}

async function translateWithMyMemory(text) {
  const url = new URL("https://api.mymemory.translated.net/get");
  url.searchParams.set("q", text.slice(0, 450));
  url.searchParams.set("langpair", "ru|en");
  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(12_000) });
  if (!res.ok) throw new Error(`MyMemory HTTP ${res.status}`);
  const data = await res.json();
  const translated = String(data?.responseData?.translatedText || "").trim();
  if (!translated || /invalid|quota|query length/i.test(translated)) throw new Error("MyMemory empty");
  return translated;
}

async function translateWithGoogle(text, logger) {
  const url = new URL("https://clients5.google.com/translate_a/t");
  url.searchParams.set("client", "dict-chrome-ex");
  url.searchParams.set("sl", "ru");
  url.searchParams.set("tl", "en");
  url.searchParams.set("q", text);
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const res = await fetch(url.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Referer: "https://chrome.google.com/",
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 429) {
      logger.warn(`Google Translate rate-limited. Waiting ${attempt * 2}s...`);
      await Bun.sleep(attempt * 2000);
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const translated = Array.isArray(data) ? data[0] : null;
    if (!translated || typeof translated !== "string") return text;
    return translated;
  }
  throw new Error("Google Translate still rate-limited.");
}

async function translateOne(text, logger) {
  try {
    return await translateWithGoogle(text, logger);
  } catch {
    return translateWithMyMemory(text);
  }
}

export async function translateOrders(runDir, logger) {
  const inputFile = `${runDir}/${CONFIG.filenames.raw}`;
  const outputFile = `${runDir}/${CONFIG.filenames.translated}`;
  const inputBunFile = Bun.file(inputFile);
  if (!(await inputBunFile.exists())) {
    throw new Error(`Input file not found: ${inputFile}`);
  }
  const data = await inputBunFile.json();
  const names = russianFields(data);

  if (names.length === 0) {
    logger.info("No Russian text to translate. Copying orders as-is.");
    await Bun.write(outputFile, JSON.stringify(data, null, 2));
    return;
  }

  logger.info(`Translating ${names.length} Russian field(s) to English for Excel and PDF.`);

  const cache = await loadPersistentCache();
  const misses = names.filter((name) => !cache.has(name) || hasRussian(cache.get(name)));
  logger.info(`Cache: ${names.length - misses.length} hit(s), ${misses.length} need translation.`);

  if (misses.length) {
    let usedGroq = false;
    try {
      const groq = await translateWithGroq(misses, logger);
      if (groq) {
        misses.forEach((original, index) => {
          const next = groq[index] || original;
          cache.set(original, hasRussian(next) ? original : next);
        });
        usedGroq = misses.every((original) => cache.has(original) && !hasRussian(cache.get(original)));
      }
    } catch (error) {
      logger.warn(`Groq translation skipped: ${error.message}. Falling back to Google / MyMemory.`);
    }

    if (!usedGroq) {
      for (let index = 0; index < misses.length; index += 1) {
        const original = misses[index];
        if (cache.has(original) && !hasRussian(cache.get(original))) continue;
        try {
          const next = await translateOne(original, logger);
          cache.set(original, hasRussian(next) ? original : next);
        } catch {
          cache.set(original, original);
          logger.warn(`Could not translate "${original.slice(0, 50)}". Keeping original.`);
        }
        if (index + 1 < misses.length) await Bun.sleep(400);
      }
    }

    await savePersistentCache(cache);
  }

  const translatedData = applyTranslations(data, cache);
  await Bun.write(outputFile, JSON.stringify(translatedData, null, 2));
  logger.info(`English fields saved to ${outputFile}`);
}
