import { chromium } from "playwright-core";
import fs from "fs";
import path from "path";

// We'll keep a single browser instance alive during the batch
let browser;

export async function initImageRenderer() {
  if (!browser) {
    browser = await chromium.launch({ headless: true });
  }
}

export async function closeImageRenderer() {
  if (browser) {
    await browser.close();
    browser = null;
  }
}

// Convert style string to nice CSS
function getStyleCSS(styleKey) {
  const styles = {
    hair_care_herbal_green: "background: linear-gradient(135deg, #134E5E 0%, #71B280 100%); color: white;",
    hair_care_fresh_blue: "background: linear-gradient(135deg, #2193b0 0%, #6dd5ed 100%); color: white;",
    skincare_cosmetic_beige: "background: linear-gradient(135deg, #E6D0CE 0%, #F5E8E4 100%); color: #333;",
    skincare_cosmetic_gold: "background: linear-gradient(135deg, #bf953f 0%, #fcf6ba 100%); color: #333;",
    skincare_bright_white: "background: linear-gradient(135deg, #ffffff 0%, #f0f0f0 100%); color: #333;",
    ayurveda_herbal_earthy: "background: linear-gradient(135deg, #5A3F37 0%, #2C7744 100%); color: white;",
    homeopathy_wellness_white: "background: linear-gradient(135deg, #EAEAEA 0%, #DBDBDB 100%); color: #005C97;",
    health_supplement_clean: "background: linear-gradient(135deg, #1D2B64 0%, #F8CDDA 100%); color: white;",
    food_spice_vibrant: "background: linear-gradient(135deg, #FF416C 0%, #FF4B2B 100%); color: white;",
    food_natural_warm: "background: linear-gradient(135deg, #F2994A 0%, #F2C94C 100%); color: white;",
    cosmetic_clean_white: "background: linear-gradient(135deg, #fdfbfb 0%, #ebedee 100%); color: #333;"
  };
  return styles[styleKey] || styles.cosmetic_clean_white;
}

export async function generateMainImageBuf(product, layoutData) {
  await initImageRenderer();
  const page = await browser.newPage();
  
  // Set viewport to Ozon's ideal 3:4 ratio, e.g. 1200x1600
  await page.setViewportSize({ width: 1200, height: 1600 });
  
  const cssBackground = getStyleCSS(layoutData.background);
  
  const benefitsHtml = (layoutData.leftPanel?.benefits || [])
    .map(b => `<div class="benefit"><span class="check">✓</span> ${b.replace(/^✓\s*/, '')}</div>`)
    .join('');

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@600;800&family=Open+Sans:wght@400;600;700&display=swap" rel="stylesheet">
      <style>
        body {
          margin: 0; padding: 0;
          width: 1200px; height: 1600px;
          ${cssBackground}
          font-family: 'Open Sans', sans-serif;
          display: flex;
          box-sizing: border-box;
          overflow: hidden;
          position: relative;
        }
        
        .left-col {
          width: 55%;
          padding: 80px;
          display: flex;
          flex-direction: column;
          z-index: 10;
        }
        
        .brand {
          font-family: 'Montserrat', sans-serif;
          font-weight: 800;
          font-size: 55px;
          text-transform: uppercase;
          letter-spacing: 2px;
          margin-bottom: 20px;
          opacity: 0.9;
        }
        
        .title {
          font-family: 'Montserrat', sans-serif;
          font-weight: 600;
          font-size: 55px;
          line-height: 1.25;
          margin-bottom: 60px;
        }
        
        .benefits-container {
          display: flex;
          flex-direction: column;
          gap: 25px;
          margin-top: auto;
          margin-bottom: 80px;
        }
        
        .benefit {
          display: flex;
          align-items: center;
          font-size: 38px;
          font-weight: 600;
          background: rgba(255,255,255,0.15);
          padding: 20px 30px;
          border-radius: 15px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.05);
          backdrop-filter: blur(10px);
        }
        
        .check {
          color: #4CAF50;
          font-size: 46px;
          font-weight: 900;
          margin-right: 25px;
          filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2));
        }

        .right-col {
          width: 45%;
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          background-color: white; /* Sharp clean background for product */
          border-top-left-radius: 60px;
          border-bottom-left-radius: 60px;
          box-shadow: -20px 0 50px rgba(0,0,0,0.15);
        }
        
        .product-image {
          max-width: 95%;
          max-height: 95%;
          object-fit: contain;
          z-index: 5;
        }
        
        /* Subtle decorative touches */
        .deco-circle {
          position: absolute;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0) 70%);
        }
      </style>
    </head>
    <body>
      <div class="left-col">
        <div class="brand">${layoutData.top?.brandName || "Premium"}</div>
        <div class="title">${layoutData.top?.titleRu || "Крем"}</div>
        <div class="benefits-container">
          ${benefitsHtml}
        </div>
      </div>
      <div class="right-col">
        <div class="deco-circle" style="width: 800px; height: 800px; top: -100px; right: -100px;"></div>
        <div class="deco-circle" style="width: 600px; height: 600px; bottom: -50px; left: -50px; background: radial-gradient(circle, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0) 70%);"></div>
        <img class="product-image" src="${layoutData.productFocus?.primaryImage}" />
      </div>
    </body>
    </html>
  `;
  
  await page.setContent(html, { waitUntil: 'networkidle' });
  // Wait a moment for font/image loading
  await page.waitForTimeout(800);
  
  const buffer = await page.screenshot({ type: 'jpeg', quality: 90 });
  await page.close();
  return buffer;
}

export async function generateTranslatedImageBuf(originalImageUrl, translatedText) {
  await initImageRenderer();
  const page = await browser.newPage();
  
  // High res 1200x1200 for square
  await page.setViewportSize({ width: 1200, height: 1200 });
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@600;800&family=Open+Sans:wght@400;600;700&display=swap" rel="stylesheet">
      <style>
        body {
          margin: 0; padding: 0;
          width: 1200px; height: 1200px;
          background: #fff;
          font-family: 'Open Sans', sans-serif;
          position: relative;
        }
        .main-bg {
          position: absolute;
          top: 0; left: 0; width: 100%; height: 100%;
          object-fit: cover;
          z-index: 1;
        }
        /* A dark premium glassmorphism footer that anchors the translation without replacing the whole image */
        .glass-footer {
          position: absolute;
          bottom: 0px; left: 0px; width: 100%;
          min-height: 25%;
          padding: 40px 60px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          z-index: 10;
          background: rgba(0, 0, 0, 0.7);
          backdrop-filter: blur(15px);
          color: white;
          box-sizing: border-box;
          text-align: center;
        }
        .translated-text {
          font-family: 'Montserrat', sans-serif;
          font-size: 45px;
          font-weight: 600;
          line-height: 1.3;
          text-shadow: 0 4px 10px rgba(0,0,0,0.5);
        }
      </style>
    </head>
    <body>
      <img class="main-bg" src="${originalImageUrl}" />
      ${translatedText ? '<div class="glass-footer"><div class="translated-text">' + translatedText + '</div></div>' : ''}
    </body>
    </html>
  `;
  
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  
  const buffer = await page.screenshot({ type: 'jpeg', quality: 90 });
  await page.close();
  return buffer;
}

let supabaseUploadCircuitOpen = false;

/**
 * Upload a rendered JPEG buffer to the best available free host.
 * Tries backends in order: Supabase → imgbb → Catbox.moe
 *
 * Since Ozon RE-HOSTS images during the push API call, the URL only
 * needs to be alive for ~30 seconds. Catbox.moe is sufficient.
 *
 * @param {string} supabaseUrl
 * @param {string} supabaseKey
 * @param {string} asin
 * @param {number} slot    0 = main image, 1-9 = secondary images
 * @param {Buffer} buffer  JPEG buffer from Playwright/Sharp screenshot
 * @returns {Promise<string|null>} public URL or null on total failure
 */
export async function uploadRenderedImage(supabaseUrl, supabaseKey, asin, slot, buffer) {
  const fileName = `${asin}_ru_${slot}.jpg`;

  // ── BACKEND 1: Supabase Storage ─────────────────────────────────────────
  if (supabaseUrl && supabaseKey && !supabaseUploadCircuitOpen) {
    try {
      const storagePath = `ru-images/${asin}/${fileName}`;
      const res = await fetch(`${supabaseUrl}/storage/v1/object/ozon-images/${storagePath}`, {
        method: "PUT",
        headers: {
          "apikey": supabaseKey,
          "Authorization": `Bearer ${supabaseKey}`,
          "Content-Type": "image/jpeg",
          "Cache-Control": "3600",
          "x-upsert": "true"
        },
        body: buffer,
        signal: AbortSignal.timeout(10_000) // Lowered timeout for faster failover
      });
      if (res.ok) {
        const url = `${supabaseUrl}/storage/v1/object/public/ozon-images/${storagePath}`;
        console.log(`  ☁️  [Supabase] Image uploaded: slot ${slot}`);
        return url;
      }
      const errText = await res.text();
      // If quota exceeded, fall through silently
      if (errText.includes("exceed") || errText.includes("quota") || errText.includes("storage_limit")) {
        console.log(`  ⚠️  Supabase quota exceeded — tripping circuit and trying imgbb/catbox...`);
        supabaseUploadCircuitOpen = true;
      } else {
        console.warn(`  ⚠️  Supabase upload error (${res.status}): ${errText.slice(0, 80)}`);
      }
    } catch (e) {
      console.warn(`  ⚠️  Supabase upload failed: ${e.message}. Tripping circuit for session.`);
      supabaseUploadCircuitOpen = true;
    }
  }

  // ── BACKEND 2: imgbb (free, IMGBB_API_KEY in .env) ─────────────────────
  const imgbbKey = (typeof Bun !== "undefined" ? Bun.env.IMGBB_API_KEY : process.env.IMGBB_API_KEY) || null;
  if (imgbbKey) {
    try {
      const base64 = buffer.toString("base64");
      const form = new FormData();
      form.append("key", imgbbKey);
      form.append("name", fileName);
      form.append("image", base64);
      // imgbb free tier keeps images for 6 months by default
      const res = await fetch("https://api.imgbb.com/1/upload", {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(30_000)
      });
      if (res.ok) {
        const data = await res.json();
        const url = data?.data?.url;
        if (url) {
          console.log(`  🖼️  [imgbb] Image uploaded: slot ${slot}`);
          return url;
        }
      }
      console.warn(`  ⚠️  imgbb upload failed (${res.status}) — trying Uguu.se...`);
    } catch (e) {
      console.warn(`  ⚠️  imgbb error: ${e.message} — trying Uguu.se...`);
    }
  }

  // ── BACKEND 3: Uguu.se (anonymous host, no API key required) ──────────
  // Replaces Catbox because Ozon servers frequently block catbox.moe
  try {
    const form = new FormData();
    form.append("files[]", new Blob([buffer], { type: "image/jpeg" }), fileName);
    
    const res = await fetch("https://uguu.se/upload.php", {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(30_000)
    });
    if (res.ok) {
      const json = await res.json();
      if (json.success && json.files && json.files.length > 0) {
        const url = json.files[0].url;
        console.log(`  🦄 [Uguu.se] Image uploaded: slot ${slot} → ${url.slice(-40)}`);
        return url;
      }
    }
    console.warn(`  ⚠️  Uguu.se upload failed (${res.status})`);
  } catch (e) {
    console.warn(`  ⚠️  Uguu.se error: ${e.message}`);
  }

  console.warn(`  ❌  All image hosts failed for slot ${slot} — using original Amazon URL as fallback`);
  return null;
}
