-- Change 3 (3A): add three pricing-tier flags per unit
ALTER TABLE public.units
  ADD COLUMN IF NOT EXISTS tier_a boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tier_b boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tier_c boolean NOT NULL DEFAULT false;

-- Change 3 (3B): per-campaign master switches that decide whether each
-- tier appears in the client portal at all.
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS show_tier_a boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_tier_b boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_tier_c boolean NOT NULL DEFAULT false;

-- Change 2 storage: a campaign-level overview map extracted from a
-- vendor's Excel workbook. Stored even though we don't render it yet
-- (per Heather's instruction to extract now and surface later).
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS vendor_overview_map_url text;