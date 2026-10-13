-- Weekly leaflet offers from ShelfAtlas (free plan, personal use).
--
-- Offers live in public.promotional_offers (shared catalogue, read-only for
-- signed-in users, written only by the sync job with the owner role). These
-- columns add what the offer pages show: a per-kg/l/piece price as published,
-- when ShelfAtlas last saw the offer, and when our sync last saw it (offers
-- that disappear from a complete sync are removed).

alter table public.promotional_offers
  add column unit_price_ore integer check (unit_price_ore > 0),
  add column unit_price_unit text check (unit_price_unit in ('kg', 'l', 'stk')),
  add column source_ingested_at timestamptz,
  add column last_seen_at timestamptz not null default now(),
  add constraint promotional_offers_unit_price_pair
    check ((unit_price_ore is null) = (unit_price_unit is null));

create index promotional_offers_title_search_idx on public.promotional_offers
  using gin ((lower(title)) extensions.gin_trgm_ops);

-- Chains that are not reference rows yet are added by the sync job, using
-- the feed's own slug and name.

-- RLS: promotional_offers and retailers already have RLS enabled with a
-- read-only policy for authenticated users (20261012000002). Nothing here
-- grants writes to anon or authenticated.
