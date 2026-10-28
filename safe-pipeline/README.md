# l98 — Amazon.in → Ozon.ru Pipeline

Scrapes products from Amazon.in, stores them in Supabase, and pushes them to Ozon.ru. Built with Bun. No framework, no monorepo — just standalone scripts that run in sequence.

These gates are a **proof of concept**. Once all 3 pass, they become the foundation for a full dashboard where everything currently configured in `l98.conf.json` or hardcoded in scripts gets replaced by UI controls and DB-backed settings.

---

## Gate status

| Gate   | Script(s)                             | Status         | What it proves                          |
| ------ | ------------------------------------- | -------------- | --------------------------------------- |
| Gate 1 | `m1-m3-scraper.js`                    | ✅ Passed      | Scraping works — 42 products, clean data |
| Gate 2 | `m4-schema.sql` + `m5-insert.js`      | ✅ Passed      | DB works — 42 rows, dedup confirmed     |
| Gate 3 | `m6-translate.js` + `m9-ozon-push.js` | ⏳ In progress | Product live on Ozon                    |

> Dashboard build starts only after all 3 gates pass and Chak explicitly says go.

---

## File structure

```
l98/
├── l98.conf.json         ← Pipeline config (keyword, target ASIN, pricing multipliers, etc.)
├── m1-m3-scraper.js      ← Gate 1: scrape Amazon.in
├── m4-schema.sql         ← Gate 2: create DB tables (run once in Supabase)
├── m5-insert.js          ← Gate 2: insert scraped products into Supabase
├── m5-verify.js          ← Gate 2: health check — row counts for all tables
├── m6-translate.js       ← Gate 3: EN→RU translation module (also standalone test)
├── m7-pricing.js         ← Gate 3: INR→USD pricing module (also standalone test)
├── m9-ozon-push.js       ← Gate 3: push product to Ozon, poll for status
├── .env.example          ← copy to .env and fill in keys
├── .gitignore
└── README.md

# Generated at runtime (gitignored):
├── m1-m3-output.json     ← scraper output, input for m5-insert
├── translate-cache.json  ← persistent translation cache
└── ozon-push-payload.json ← last push payload (for debugging)
```

---

## Prerequisites

- [Bun](https://bun.sh) — `curl -fsSL https://bun.sh/install | bash`
- ScraperAPI account + key
- Supabase project (free tier is fine) + service role key
- Ozon seller account + Client ID + API key

Install dependencies:

```bash
bun install @supabase/supabase-js
```

Set up env:

```bash
cp .env.example .env
# Fill in SCRAPER_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY, OZON_CLIENT_ID, OZON_API_KEY
```

---

## l98.conf.json — pipeline configuration

All non-secret runtime settings live here. Credentials (API keys) stay in `.env`.
When the dashboard is built, everything in this file gets replaced by DB-backed UI controls — the conf file goes away entirely.

```json
{
  "scraper": {
    "keyword": "hair oil",      ← Amazon.in search term
    "min_rating": 4.1,          ← minimum star rating to include
    "concurrency": 3,           ← parallel detail page fetches
    "delay_ms": 500             ← ms pause between batches
  },
  "push": {
    "target_asin": "B0918FHY6P", ← which product to push in Gate 3
    "ozon_client_id": "...",     ← Ozon seller Client ID (move to .env if preferred)
    "ozon_category": {
      "description_category_id": 17028992,   ← Ozon Hair Care Products
      "type_id": 93945,                       ← Ozon Hair Serum
      "type_label": "Hair Serum"
    },
    "pricing": {
      "old_price_multiplier": 2.0  ← see Pricing section below
    },
    "weight_gate_grams": 500,      ← products at or above this weight are blocked
    "dimensions_mm": { "depth": 47, "width": 47, "height": 150 }
  }
}
```

---

## Running the pipeline

### Gate 1 — Scrape

```bash
bun --env-file=.env m1-m3-scraper.js
```

Fetches Amazon.in search results for the keyword in `l98.conf.json → scraper.keyword`, filters out sponsored and low-rated products, fetches detail pages, and saves `m1-m3-output.json`.

**Checklist before moving on:**
- [ ] ASIN present on all products
- [ ] `name` + `feature_bullets` populated
- [ ] `price_inr` is numeric
- [ ] `rating` >= 4.1 on all
- [ ] `image_urls` non-empty
- [ ] `weight_grams` present on most
- [ ] No sponsored products in output

---

### Gate 2 — Store

**Step 1: Create DB tables** (run once, safe to re-run)

In the Supabase dashboard: SQL Editor → New Query → paste `m4-schema.sql` → Run.

Or via psql:
```bash
psql "postgresql://postgres:YOUR_DB_PASSWORD@db.YOUR_PROJECT_ID.supabase.co:5432/postgres" -f m4-schema.sql
```

**Step 2: Insert products**
```bash
bun --env-file=.env m5-insert.js
```

Products are inserted with one of two statuses:
- `enriched` — weight is known and < 500g — pushable to Ozon
- `blocked_weight` — weight is null or ≥ 500g — will be skipped at push time

Brand names are cleaned at insert time: `"Visit the X Store"` → `"X"`, `"Brand: X"` → `"X"`.

**Step 3: Sync countries**
```bash
bun --env-file=.env m5b-countries-sync.js
```

Reads distinct `country_of_origin` values from the products table, checks which are missing from `ozon_countries`, and fetches only the missing ones from Ozon. First run fetches all; subsequent runs only fetch new ones.

**Step 4: Verify**
```bash
bun --env-file=.env m5-verify.js
```

**Checklist before moving on:**
- [ ] Total rows in DB matches product count in `m1-m3-output.json`
- [ ] Second insert returned 0 new rows (dedup works)
- [ ] Brand column shows clean names (no "Visit the" / "Brand:" junk)
- [ ] `weight_grams` is numeric, not a string
- [ ] `enriched` vs `blocked_weight` counts look right
- [ ] `ozon_countries` table has entries for all countries in the batch

---

### Gate 3 — Push to Ozon

**Step 1: Test translation** (optional but fast)
```bash
bun m6-translate.js
```

**Step 2: Test pricing** (optional but fast)
```bash
bun m7-pricing.js
```

**Step 3: Push**

Set `push.target_asin` in `l98.conf.json` to the ASIN you want to push, then:

```bash
bun --env-file=.env m9-ozon-push.js
```

This loads the product from Supabase, translates it, prices it, and pushes to Ozon. After pushing it polls the import status and prints any attribute errors. A row is written to `product_listings` either way (status: `live` or `failed`).

**Checklist before Gate 3 clears:**
- [ ] Pre-flight check passed (credentials valid)
- [ ] Product loaded from DB with real data (not undefined)
- [ ] Title translated to Russian (Cyrillic present)
- [ ] Price is a valid USD number (not NaN)
- [ ] Ozon returns `task_id` (import accepted)
- [ ] Import status shows no attribute errors
- [ ] Product visible in Ozon seller panel
- [ ] Row written to `product_listings` with `status=live`

---

## Architecture

```
Amazon.in
    ↓  ScraperAPI (autoparse=true)
m1-m3-scraper.js   — search + filter + detail merge
    ↓
m1-m3-output.json
    ↓
m5-insert.js       — upsert to Supabase (dedup on ASIN, sets scrape_status)
    ↓
Supabase (products table)
    ↓  on push
m6-translate.js    — EN→RU (Google clients5, file cache)
m7-pricing.js      — INR×multiplier×rate → USD
m9-ozon-push.js    — POST /v3/product/import, poll status, write product_listings
    ↓
Ozon.ru
```

---

## Database schema

### `products`

| Column             | Type        | Notes                                      |
| ------------------ | ----------- | ------------------------------------------ |
| id                 | uuid PK     | auto                                       |
| asin               | text UNIQUE | dedup key                                  |
| amazon_url         | text        |                                            |
| name               | text        | English                                    |
| feature_bullets    | text[]      | English, translated at push time           |
| product_category   | text        |                                            |
| price_inr          | numeric     |                                            |
| original_price_inr | numeric     |                                            |
| rating             | numeric     |                                            |
| total_reviews      | integer     |                                            |
| image_urls         | text[]      | Amazon CDN URLs (permanent, no re-hosting) |
| weight_grams       | integer     | null if not on product page                |
| dimensions         | text        |                                            |
| net_quantity       | text        |                                            |
| manufacturer       | text        |                                            |
| country_of_origin  | text        |                                            |
| brand              | text        |                                            |
| availability       | text        |                                            |
| scrape_status      | text        | `enriched` / `blocked_weight`              |
| scraped_at         | timestamptz |                                            |
| updated_at         | timestamptz |                                            |

### `ozon_accounts`

| Column    | Type    | Notes                        |
| --------- | ------- | ---------------------------- |
| id        | uuid PK |                              |
| name      | text    | "Account 1" etc.             |
| client_id | text    | Ozon API credential          |
| api_key   | text    | Ozon API credential          |
| is_active | boolean |                              |

### `product_listings` (junction)

| Column          | Type                    | Notes                                                        |
| --------------- | ----------------------- | ------------------------------------------------------------ |
| id              | uuid PK                 |                                                              |
| product_id      | uuid FK → products      |                                                              |
| ozon_account_id | uuid FK → ozon_accounts |                                                              |
| ozon_product_id | text                    | task_id returned by Ozon after push                          |
| status          | text                    | `draft` / `pushing` / `live` / `failed`                     |
| title_ru        | text                    |                                                              |
| description_ru  | text                    |                                                              |
| markup_pct      | numeric                 | extra % markup on top of base price (0 = no extra markup)    |
| final_price_usd | numeric                 | base_usd × (1 + markup_pct / 100), written at push time      |
| ozon_attributes | jsonb                   |                                                              |
| error_message   | text                    |                                                              |
| pushed_at       | timestamptz             |                                                              |

### `ozon_brands`

| Column     | Type   | Notes                                    |
| ---------- | ------ | ---------------------------------------- |
| ozon_id    | bigint PK | Ozon dictionary_value_id for attr 85  |
| name       | text   | Brand name                               |
| fetched_at | timestamptz |                                     |

Populated once by `m8-brands-fetch.js`. ~50k rows. Indexed on `name`.

### `ozon_countries`

| Column     | Type   | Notes                                         |
| ---------- | ------ | --------------------------------------------- |
| ozon_id    | bigint PK | Ozon dictionary_value_id for attr 4389     |
| name       | text   | English country name (matches products table) |
| fetched_at | timestamptz |                                          |

Lazily populated by `m5b-countries-sync.js` after each scrape. Only countries that appear in your products are ever fetched.

### `scrape_jobs` + `exchange_rates`

Standard audit tables — see `m4-schema.sql` for full definition.

---

## Pricing (INR → USD)

Formula: `price_usd = price_inr × multiplier × inr_usd_rate`

Live rate fetched at push time from `api.exchangerate-api.com`.

| INR range  | Multiplier |
| ---------- | ---------- |
| ≤ 50       | ×20        |
| ≤ 100      | ×15        |
| ≤ 150      | ×13        |
| ≤ 200      | ×12        |
| ≤ 250      | ×10        |
| ≤ 300      | ×9         |
| ≤ 350      | ×8         |
| ≤ 400      | ×7.5       |
| ≤ 450      | ×7         |
| ≤ 500      | ×6.5       |
| ≤ 550      | ×6         |
| ≤ 600      | ×5.7       |
| ≤ 700      | ×5.5       |
| 700+       | ×5         |

### old_price (crossed-out "was" price on Ozon)

`old_price = final_usd_price × old_price_multiplier`

The `old_price_multiplier` lives in `l98.conf.json → push.pricing.old_price_multiplier` (default: `2.0`). This makes the listing appear as 50% off. Ozon requires `old_price >= price` — setting it equal would show no discount, so we always set it higher.

**Dashboard plan:** `old_price_multiplier` will be a per-account or per-listing setting in the dashboard, so different Ozon accounts can run different discount illusions.

### markup_pct (per-listing extra margin)

`final_price_usd = base_usd × (1 + markup_pct / 100)`

Currently always `0` (no extra markup beyond the base multiplier). Stored in `product_listings.markup_pct`. 

**Dashboard plan:** Users will be able to set a per-listing markup % from the dashboard — e.g. bump a specific product's price by 15% extra without changing the global tier table.

---

## Translation

- Endpoint: `https://clients5.google.com/translate_a/t?client=dict-chrome-ex`
- No API key required
- Direction: EN → RU at push time only (not at scrape time)
- File cache: `translate-cache.json` — commit this to avoid re-translating
- Concurrency: 5 parallel, 200ms delay between batches
- On failure: returns original text, never crashes pipeline
- Cache save failures are caught and warned — pipeline continues even if disk write fails

---

## Ozon push notes

- Endpoint: `POST /v3/product/import`
- Response is async — returns `task_id`, must poll `POST /v1/product/import/info`
- Currency: USD required (Ozon India seller accounts)
- Weight gate: products ≥ 500g or null weight are blocked at push time (marked `blocked_weight` in DB)
- `type_id` must be set both top-level AND as attribute 8229
- Mandatory attributes for Hair Care / Hair Serum:
  - `85` — Brand
  - `8229` — Product type
  - `9461` — Model name (listing)
  - `9048` — Model name (card grouping)
  - `4389` — Country of origin
  - `23487` — Manufacturer

---

## Key decisions

| Decision              | Choice                       | Reason                                                      |
| --------------------- | ---------------------------- | ----------------------------------------------------------- |
| Runtime               | Bun                          | Native `.env`, fast, no ts-node needed                      |
| Scraping              | ScraperAPI autoparse         | Returns clean JSON, no HTML parsing                         |
| Sponsored filter      | Remove via `sspa` in URL     | sspa = Sponsored Products Ad placement                      |
| Rating filter         | Remove < 4.1 at scrape time  | Only high-quality products in DB                            |
| Weight filter         | Block at push, not scrape    | Some products don't expose weight on search page            |
| scrape_status         | Set at insert time           | `blocked_weight` vs `enriched` tells dashboard what's pushable |
| Images                | Amazon CDN URLs directly     | `m.media-amazon.com` URLs are permanent, no expiry          |
| Translation           | Google clients5 endpoint     | No API key, rate-limit tolerant, file cache                 |
| Translation timing    | Push time only               | No point translating products that never get pushed         |
| Currency              | USD                          | Ozon India seller API requires USD, not RUB                 |
| old_price             | 2× final price (conf)        | Ozon requires old_price >= price; 2× shows 50% off          |
| markup_pct            | 0% default, stored in DB     | Wired up now so dashboard can expose it per-listing later   |
| DB key                | SUPABASE_SERVICE_KEY         | Service role needed for full read/write access              |
| Config file           | `l98.conf.json`              | All non-secret settings in one place; replaced by dashboard |
| OZON_CLIENT_ID        | Moved to `.env`              | Was hardcoded — credentials must never be in source         |

---

## TODOs / Known issues

- ✅ **Brand dictionary** — `ozon_brands` table populated by `m8-brands-fetch.js`. m9 does DB lookup.
- ✅ **Country dictionary** — `ozon_countries` table lazily populated by `m5b-countries-sync.js`.
- ✅ **Brand name cleaning** — `m5-insert.js` strips `"Visit the X Store"` and `"Brand: X"` at insert time.

---

## Dashboard — planned (post Gate 3)

The dashboard replaces `l98.conf.json` entirely. Everything below is planned — none of it is built yet.

### What moves from conf → dashboard

| Currently in conf / hardcoded      | Dashboard equivalent                              |
| ---------------------------------- | ------------------------------------------------- |
| `scraper.keyword`                  | "New scrape" form with keyword input              |
| `scraper.min_rating`               | Global scrape settings panel                      |
| `push.target_asin`                 | Per-product "Push to Ozon" button                 |
| `push.ozon_category`               | Per-product or per-category Ozon mapping          |
| `push.pricing.old_price_multiplier`| Per-account pricing settings                      |
| `product_listings.markup_pct`      | Per-listing markup % field (already in DB schema) |
| Ozon account credentials           | Ozon accounts management page (already in DB)     |

### Dashboard views (planned)

- **Products** — table of all scraped products, filterable by `scrape_status`. One-click push for `enriched` products.
- **Listings** — table of `product_listings`, showing live/failed/draft status, final_price_usd, markup_pct. Edit markup inline.
- **Accounts** — manage Ozon seller accounts (client_id, api_key, active toggle).
- **Scrape jobs** — trigger new scrapes, view history from `scrape_jobs` table.
- **Pricing settings** — edit `old_price_multiplier` and per-tier multipliers stored in DB (replaces the hardcoded `TIERS` array in `m7-pricing.js`).

---

## How to resume in a new session

1. Share this README with Claude
2. Share the active scripts listed in the file structure above
3. Share `l98.conf.json`
4. State the current gate and the last error seen
5. Claude will have full context — no re-explaining needed

---

## Testing from scratch (fresh Supabase account)

See the step-by-step section below for exactly how to reset and re-test all gates.

### Step 0 — Fresh environment

```bash
# Install Bun if not already installed
curl -fsSL https://bun.sh/install | bash

# Clone/copy project, install deps
bun install @supabase/supabase-js

# Set up .env
cp .env.example .env
# Fill in: SCRAPER_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY, OZON_CLIENT_ID, OZON_API_KEY
```

### Step 1 — Set up Supabase DB (Gate 2 prereq)

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to **Project Settings → API** and copy:
   - **Project URL** → `SUPABASE_URL` in `.env`
   - **service_role key** (not anon) → `SUPABASE_SERVICE_KEY` in `.env`
3. Go to **SQL Editor → New Query**, paste the contents of `m4-schema.sql`, and run it
4. Verify tables exist: you should see `products`, `ozon_accounts`, `product_listings`, `scrape_jobs`, `exchange_rates` in the Table Editor

### Step 2 — Gate 1: Scrape

```bash
bun --env-file=.env m1-m3-scraper.js
```

Expected output: `Saved → m1-m3-output.json (N products)`. Check the Gate 1 checklist printed at the end.

### Step 3 — Gate 2: Insert + verify

```bash
bun --env-file=.env m5-insert.js
bun --env-file=.env m5-verify.js
```

Expected: row counts match, second insert shows 0 new rows, `enriched` and `blocked_weight` split looks reasonable.

### Step 4 — Gate 3: Translate, price, push

```bash
# Optional smoke tests first
bun m6-translate.js     # tests translation on first product in m1-m3-output.json
bun m7-pricing.js       # prints tier table + real product prices

# Set your target product
# Edit l98.conf.json → push.target_asin to the ASIN you want to push

# Push
bun --env-file=.env m9-ozon-push.js
```

Expected: pre-flight passes, product loads from DB, translation shows Cyrillic, price is a valid USD number, Ozon returns a `task_id`, status poll shows no attribute errors, product visible in Ozon seller panel.

### Resetting for a clean re-test

To wipe all data and start over:

```sql
-- Run in Supabase SQL Editor
truncate table product_listings, products, scrape_jobs, exchange_rates restart identity cascade;
```

Then delete local generated files:
```bash
rm -f m1-m3-output.json translate-cache.json ozon-push-payload.json
```

Then re-run from Gate 1.
