ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS cover_image_url text;

ALTER TABLE public.units
  ADD COLUMN IF NOT EXISTS geopath_id text,
  ADD COLUMN IF NOT EXISTS media_type text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS zip text;