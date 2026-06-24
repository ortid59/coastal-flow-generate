
CREATE TABLE public.vendor_crop_profiles (
  vendor text PRIMARY KEY,
  has_inset_map boolean NOT NULL DEFAULT false,
  photo_x double precision,
  photo_y double precision,
  photo_w double precision,
  photo_h double precision,
  map_x double precision,
  map_y double precision,
  map_w double precision,
  map_h double precision,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendor_crop_profiles TO authenticated;
GRANT ALL ON public.vendor_crop_profiles TO service_role;

ALTER TABLE public.vendor_crop_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read vendor crop profiles"
  ON public.vendor_crop_profiles FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert vendor crop profiles"
  ON public.vendor_crop_profiles FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update vendor crop profiles"
  ON public.vendor_crop_profiles FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.touch_vendor_crop_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER touch_vendor_crop_profiles_updated_at
BEFORE UPDATE ON public.vendor_crop_profiles
FOR EACH ROW EXECUTE FUNCTION public.touch_vendor_crop_profiles_updated_at();
