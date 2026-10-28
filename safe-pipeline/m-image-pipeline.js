#!/usr/bin/env bun
/**
 * m-image-pipeline.js  — Ozon Image Optimization Pipeline
 * ─────────────────────────────────────────────────────────
 * Clean, standard 3:4 aspect ratio image conversion.
 * No text overlays, no SVGs, no AI hallucination.
 * Original product packaging ONLY against clean light backgrounds.
 */

import sharp from "sharp";
sharp.cache(false); // <--- FREE MEMORY: Disable global sharp cache to prevent memory leaks



// ─── Output dimensions (Strict 3:4 Ratio) ───────────────────────────────────
const MAIN_W  = 1500;
const MAIN_H  = 2000;  // 3:4 ratio

// ─── Fetch image buffer from URL ─────────────────────────────────────────────
async function fetchImageBuf(url) {
  const cleanUrl = url.replace(/\._[A-Z0-9,_-]+\./i, ".");
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8"
  };
  let res = await fetch(cleanUrl, { headers, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) {
      if (res.body) { await res.text().catch(() => {}); }
      res = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
  }
  if (!res.ok) throw new Error(`Image fetch failed: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// ═══════════════════════════════════════════════════════════════════════════════
// STANDARD IMAGE GENERATOR (3:4 Ratio, Clean Studio Background)
// ═══════════════════════════════════════════════════════════════════════════════
export async function generateStandardImage(imageUrl) {
  let srcBuf;
  try {
    srcBuf = await fetchImageBuf(imageUrl);
  } catch (e) {
    console.warn(`  ⚠️  Cannot fetch image: ${imageUrl.slice(-60)} — skipping`);
    return null;
  }

  // Create a clean light baseline background (Ozon prefers F8F8F8 to FFFFFF)
  const baseImg = sharp({
    create: { width: MAIN_W, height: MAIN_H, channels: 3, background: { r: 248, g: 248, b: 248 } }
  });

  // Calculate product bounds (Leave 5% padding padding on edges so it looks clean)
  const prodW = Math.round(MAIN_W * 0.90);
  const prodH = Math.round(MAIN_H * 0.90);

  let resizedProduct = await sharp(srcBuf)
    .resize(prodW, prodH, { 
      fit: 'contain', 
      background: { r: 255, g: 255, b: 255, alpha: 0 }, 
      kernel: sharp.kernel.lanczos3 
    })
    .png({ quality: 100 })
    .toBuffer();

  // Composite the product dead-center over the studio background
  const finalBuf = await baseImg
    .composite([{ 
      input: resizedProduct, 
      top: Math.round((MAIN_H - prodH) / 2), 
      left: Math.round((MAIN_W - prodW) / 2) 
    }])
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();

  srcBuf = null; // <--- FREE MEMORY: release reference
  resizedProduct = null; // <--- FREE MEMORY: release reference
  return finalBuf;
}

// ═══════════════════════════════════════════════════════════════════════════════
// IMAGE QUALITY VALIDATOR
// ═══════════════════════════════════════════════════════════════════════════════
export async function validateImageQualityBuffer(buf) {
  try {
    const meta = await sharp(buf).metadata();
    const { width, height, format } = meta;
    const errors = [];

    if (!width || !height) { errors.push("Cannot read dimensions"); }
    else {
      const ratio = width / height;
      if (ratio < 0.6 || ratio > 1.6) errors.push(`Unusual aspect ratio: ${ratio.toFixed(2)}`);
      if (width < 800)  errors.push(`Width too small: ${width}px (min 800)`);
      if (height < 800) errors.push(`Height too small: ${height}px (min 800)`);
      const sizeKb = buf.length / 1024;
      if (sizeKb > 10240) errors.push(`File too large: ${sizeKb.toFixed(0)}KB (max 10MB)`);
    }
    return { pass: errors.length === 0, errors, width, height };
  } catch (e) {
    return { pass: false, errors: [`Validation error: ${e.message}`], width: 0, height: 0 };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MASTER ORCHESTRATOR
// ═══════════════════════════════════════════════════════════════════════════════
export async function processProductImages(product, brand, titleRu, benefitsRu = [], typeLabel = "", packQty = 1) {
  const asin = product.asin || "UNKNOWN";
  const imageUrls = Array.isArray(product.image_urls) ? product.image_urls : [];
  const qualityReport = [];

  console.log(`  🎨 [ImagePipeline] Processing ${imageUrls.length} standard images for ${asin}`);

  let mainBuf = null;
  const additionalBufs = [];

  // Try fetching the primary image
  for (let i = 0; i < imageUrls.length; i++) {
    const buf = await generateStandardImage(imageUrls[i]);
    if (buf) {
      const qv = await validateImageQualityBuffer(buf);
      
      if (!mainBuf) {
        mainBuf = buf;
        qualityReport.push({ slot: "main", ...qv });
        console.log(`  ✅ Main image (3:4 Studio): ${qv.width}×${qv.height}px`);
      } else {
        additionalBufs.push(buf);
        qualityReport.push({ slot: `additional_${additionalBufs.length}`, ...qv });
        console.log(`  ✅ Additional image (3:4 Studio) [${additionalBufs.length}]: ${qv.width}×${qv.height}px`);
      }

      // Cap at 8 images total (1 main + 7 additional), per Ozon guidelines
      if (additionalBufs.length >= 7) break;
    }
  }

  // Variant text overlays are BANNED. The variant Buf is omitted entirely now.
  let variantBuf = null;

  console.log(`  📊 [ImagePipeline] Done: main=${mainBuf ? "✓" : "✗"}, additional=${additionalBufs.length}`);

  // Force GC for image processing if possible
  if (typeof Bun !== "undefined" && Bun.gc) { Bun.gc(true); }

  return { mainBuf, additionalBufs, variantBuf, qualityReport };
}
