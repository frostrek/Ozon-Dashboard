#!/usr/bin/env bun

import { CONFIG } from "./config.js";
import path from "path";

/**
 * Translate product titles for labels/Excel only.
 * Customer names, cities, payment rows, and discount text stay as Ozon sent them.
 */

const CACHE_FILE = path.join(process.cwd(), "translate-cache.json");
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

const hasRussian = (str) => typeof str === "string" && /[а-яА-ЯёЁ]/.test(str);

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

function productNames(orders) {
  const names = new Set();
  if (!Array.isArray(orders)) return names;
  for (const order of orders) {
    for (const product of order?.products || []) {
      const name = String(product?.name || "").trim();
      if (hasRussian(name)) names.add(name);
    }
  }
  return [...names];
}

function applyProductNames(orders, cache) {
  if (!Array.isArray(orders)) return orders;
  return orders.map((order) => ({
    ...order,
    products: Array.isArray(order.products)
      ? order.products.map((product) => {
        const name = String(product?.name || "").trim();
        if (!hasRussian(name)) return product;
        return { ...product, name: cache.get(name) || name };
      })
      : order.products,
  }));
}

async function translateWithGroq(texts, logger) {
  if (!GROQ_API_KEY || texts.length === 0) return null;
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0.1,
      messages: [
        {
          role: "system",
          content: "Translate Russian product titles to natural English. Keep brand names. Return only a JSON array of strings, same order and length as the input.",
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
    throw new Error("Groq did not return one translation per title.");
  }
  logger.info(`Translated ${texts.length} product title(s) with Groq.`);
  return parsed.map((item) => String(item || "").trim());
}

async function translateWithGoogle(text, logger) {
  const url = new URL("https://clients5.google.com/translate_a/t");
  url.searchParams.set("client", "dict-chrome-ex");
  url.searchParams.set("sl", "ru");
  url.searchParams.set("tl", "en");
  url.searchParams.set("q", text);
  const res = await fetch(url.toString(), {
    headers: {
      "User-Agent": "Mozilla/5.0",
      Referer: "https://chrome.google.com/",
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 429) {
    logger.warn("Google Translate rate-limited this title. Keeping the Russian name.");
    return text;
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const translated = Array.isArray(data) ? data[0] : null;
  if (!translated || typeof translated !== "string") return text;
  return translated;
}

export async function translateOrders(runDir, logger) {
  const inputFile = `${runDir}/${CONFIG.filenames.raw}`;
  const outputFile = `${runDir}/${CONFIG.filenames.translated}`;
  const inputBunFile = Bun.file(inputFile);
  if (!(await inputBunFile.exists())) {
    throw new Error(`Input file not found: ${inputFile}`);
  }
  const data = await inputBunFile.json();
  const names = productNames(data);

  if (names.length === 0) {
    logger.info("No Russian product titles to translate. Copying orders as-is.");
    await Bun.write(outputFile, JSON.stringify(data, null, 2));
    return;
  }

  logger.info(`Translating ${names.length} product title(s) for labels. Customer and address text is left as Ozon sent it.`);

  const cache = await loadPersistentCache();
  const misses = names.filter((name) => !cache.has(name));
  logger.info(`Cache: ${names.length - misses.length} hit(s), ${misses.length} need translation.`);

  if (misses.length) {
    let usedGroq = false;
    try {
      const groq = await translateWithGroq(misses, logger);
      if (groq) {
        misses.forEach((original, index) => cache.set(original, groq[index] || original));
        usedGroq = true;
      }
    } catch (error) {
      logger.warn(`Groq translation skipped: ${error.message}. Falling back to one Google request at a time.`);
    }

    if (!usedGroq) {
      for (let index = 0; index < misses.length; index += 1) {
        const original = misses[index];
        try {
          cache.set(original, await translateWithGoogle(original, logger));
        } catch {
          cache.set(original, original);
          logger.warn(`Could not translate "${original.slice(0, 50)}". Keeping original.`);
        }
        if (index + 1 < misses.length) await Bun.sleep(400);
      }
    }

    await savePersistentCache(cache);
  }

  const translatedData = applyProductNames(data, cache);
  await Bun.write(outputFile, JSON.stringify(translatedData, null, 2));
  logger.info(`Translated product titles saved to ${outputFile}`);
}
