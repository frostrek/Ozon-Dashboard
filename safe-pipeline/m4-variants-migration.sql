-- ─── Cosmetic Variant Columns Migration ───────────────────────────────────────
-- Run this ONCE in Supabase SQL Editor to add variant support to existing DBs.
-- Safe to re-run — each statement uses IF NOT EXISTS / ignores existing columns.

-- 1. parent_asin: links a shade child to its Amazon parent product
ALTER TABLE products ADD COLUMN IF NOT EXISTS parent_asin text;

-- 2. variant_type: the dimension being varied, e.g. 'Color/Shade', 'Size'
ALTER TABLE products ADD COLUMN IF NOT EXISTS variant_type text;

-- 3. variant_value: the specific value, e.g. '115 Ivory', 'Light Beige'
ALTER TABLE products ADD COLUMN IF NOT EXISTS variant_value text;

-- Index for fast parent-group lookups
CREATE INDEX IF NOT EXISTS idx_products_parent_asin ON products(parent_asin);

-- Verify
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'products'
  AND column_name IN ('parent_asin', 'variant_type', 'variant_value')
ORDER BY column_name;
