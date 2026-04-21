ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS proposal_name text;
ALTER TABLE public.units ADD COLUMN IF NOT EXISTS highlights text;