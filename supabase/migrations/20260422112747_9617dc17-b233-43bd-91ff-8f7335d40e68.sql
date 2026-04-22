-- Add unique constraint on (campaign_id, unit_number) so we can upsert units
-- without deleting existing rows (which previously wiped photo URLs and IDs).
-- Drop duplicates first if any exist (keep oldest).
DELETE FROM public.units a
USING public.units b
WHERE a.ctid > b.ctid
  AND a.campaign_id = b.campaign_id
  AND a.unit_number = b.unit_number;

ALTER TABLE public.units
  ADD CONSTRAINT units_campaign_unit_unique UNIQUE (campaign_id, unit_number);