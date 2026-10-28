-- M4 — Supabase schema migration
-- Run this in Supabase dashboard: SQL Editor → New Query → paste → Run
-- Or via psql: psql "postgresql://postgres:YOUR_DB_PASSWORD@db.YOUR_PROJECT_ID.supabase.co:5432/postgres" -f m4-schema.sql

-- ─── Enable UUID extension ────────────────────────────────────────────────────
create extension if not exists "pgcrypto";

-- ─── products ─────────────────────────────────────────────────────────────────
create table if not exists products (
  id                  uuid primary key default gen_random_uuid(),
  asin                text not null unique,
  amazon_url          text,
  name                text not null,
  feature_bullets     text[],
  product_category    text,
  price_inr           numeric,
  original_price_inr  numeric,
  rating              numeric,
  total_reviews       integer,
  image_urls          text[],
  weight_grams        integer,
  dimensions          text,
  net_quantity        text,
  volume_ml           integer,
  ingredients         text,
  directions          text,
  specifications      jsonb,
  raw_product_info    jsonb,
  description         text,
  manufacturer        text,
  country_of_origin   text,
  brand               text,           -- cleaned at insert time (no "Visit the X Store" / "Brand: X" junk)
  availability        text,
  parent_asin         text,           -- Link to parent product
  variant_type        text,           -- e.g., 'Color', 'Size', 'Shade'
  variant_value       text,           -- e.g., 'Ivory', '120', 'Large'
  scrape_status       text not null default 'enriched',  -- enriched | blocked_weight
  scraped_at          timestamptz,
  updated_at          timestamptz default now()
);


-- Migration for existing databases:
-- alter table products add column if not exists volume_ml integer;
-- alter table products add column if not exists ingredients text;
-- alter table products add column if not exists directions text;
-- alter table products add column if not exists specifications jsonb;
-- alter table products add column if not exists raw_product_info jsonb;
-- alter table products add column if not exists description text;
-- alter table products add column if not exists parent_asin text;
-- alter table products add column if not exists variant_type text;
-- alter table products add column if not exists variant_value text;


-- ─── ozon_accounts ────────────────────────────────────────────────────────────
create table if not exists ozon_accounts (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  client_id   text not null,
  api_key     text not null,
  is_active   boolean not null default true,
  created_at  timestamptz default now()
);

-- ─── product_listings (junction: product × ozon account) ─────────────────────
create table if not exists product_listings (
  id                uuid primary key default gen_random_uuid(),
  product_id        uuid not null references products(id) on delete cascade,
  ozon_account_id   uuid not null references ozon_accounts(id) on delete cascade,
  ozon_product_id   text,
  status            text not null default 'draft',       -- draft | pushing | live | failed
  title_ru          text,
  description_ru    text,
  markup_pct        numeric default 0,                   -- extra % on top of base price (dashboard tweakable)
  final_price_usd   numeric,                             -- base_usd × (1 + markup_pct/100)
  ozon_attributes   jsonb default '{}',
  error_message     text,
  pushed_at         timestamptz,
  created_at        timestamptz default now(),
  unique (product_id, ozon_account_id)
);

-- ─── scrape_jobs ──────────────────────────────────────────────────────────────
create table if not exists scrape_jobs (
  id                  uuid primary key default gen_random_uuid(),
  trigger_type        text not null,
  keyword             text,
  category_url        text,
  products_found      integer default 0,
  new_products        integer default 0,
  duplicates_skipped  integer default 0,
  status              text not null default 'running',
  started_at          timestamptz default now(),
  completed_at        timestamptz
);

-- ─── exchange_rates ───────────────────────────────────────────────────────────
create table if not exists exchange_rates (
  id              uuid primary key default gen_random_uuid(),
  from_currency   text not null,
  to_currency     text not null,
  rate            numeric not null,
  fetched_at      timestamptz default now()
);

-- ─── ozon_brands ─────────────────────────────────────────────────────────────
-- Populated once by m8-brands-fetch.js (full Ozon brand dictionary).
-- m9-ozon-push.js looks up brand name → ozon_id at push time.
-- Re-run m8-brands-fetch.js periodically if new brands need to be added.
create table if not exists ozon_brands (
  ozon_id     bigint primary key,   -- Ozon's dictionary_value_id for attr 85
  name        text not null,
  fetched_at  timestamptz default now()
);

-- ─── ozon_countries ───────────────────────────────────────────────────────────
-- Lazily populated by m5b-countries-sync.js after each scrape.
-- Only countries that appear in scraped products are ever fetched from Ozon.
-- m9-ozon-push.js looks up country_of_origin → ozon_id at push time.
create table if not exists ozon_countries (
  ozon_id     bigint primary key,   -- Ozon's dictionary_value_id for attr 4389
  name        text not null,        -- English name as it appears in products table
  fetched_at  timestamptz default now()
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────
create index if not exists idx_products_asin          on products(asin);
create index if not exists idx_products_rating        on products(rating);
create index if not exists idx_products_weight        on products(weight_grams);
create index if not exists idx_products_scrape_status on products(scrape_status);
create index if not exists idx_listings_product       on product_listings(product_id);
create index if not exists idx_listings_account       on product_listings(ozon_account_id);
create index if not exists idx_listings_status        on product_listings(status);
create index if not exists idx_ozon_brands_name       on ozon_brands(name);
create index if not exists idx_ozon_countries_name    on ozon_countries(name);

-- ─── Seed ozon accounts (update client_id and api_key later) ─────────────────
insert into ozon_accounts (name, client_id, api_key) values
  ('Account 1', 'PLACEHOLDER_CLIENT_ID_1', 'PLACEHOLDER_API_KEY_1'),
  ('Account 2', 'PLACEHOLDER_CLIENT_ID_2', 'PLACEHOLDER_API_KEY_2'),
  ('Account 3', 'PLACEHOLDER_CLIENT_ID_3', 'PLACEHOLDER_API_KEY_3')
on conflict do nothing;
