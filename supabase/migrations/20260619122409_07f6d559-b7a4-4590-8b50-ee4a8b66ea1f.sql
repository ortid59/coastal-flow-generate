
CREATE TABLE public.proposal_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  company_name TEXT NOT NULL DEFAULT 'Coastal Maverick',
  company_email TEXT NOT NULL DEFAULT '',
  company_phone TEXT NOT NULL DEFAULT '',
  who_we_are_heading TEXT NOT NULL DEFAULT 'Who We Are',
  who_we_are_body_1 TEXT NOT NULL DEFAULT 'Coastal Maverick is a woman-owned boutique out-of-home (OOH) media agency specializing in high-impact, highly customized OOH campaigns. From concept to completion, we serve as a strategic partner for brands looking to make a bold visual statement in the physical world.',
  who_we_are_body_2 TEXT NOT NULL DEFAULT 'With 360-degree experience across media owner, client, and agency sides, we bring a unique perspective that fuels smarter strategy and greater impact.',
  meet_the_team_heading TEXT NOT NULL DEFAULT 'Meet the Team',
  next_steps_heading TEXT NOT NULL DEFAULT 'Next Steps',
  next_steps_body TEXT NOT NULL DEFAULT '',
  footer_tagline TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT proposal_settings_singleton CHECK (id = 1)
);

GRANT SELECT ON public.proposal_settings TO anon, authenticated;
GRANT INSERT, UPDATE ON public.proposal_settings TO authenticated;
GRANT ALL ON public.proposal_settings TO service_role;

ALTER TABLE public.proposal_settings ENABLE ROW LEVEL SECURITY;

-- Public can read (portal is public)
CREATE POLICY "Anyone can read proposal settings"
ON public.proposal_settings FOR SELECT
USING (true);

-- Only allowlist admins can write
CREATE POLICY "Admins can insert proposal settings"
ON public.proposal_settings FOR INSERT
TO authenticated
WITH CHECK (public.is_allowed_admin());

CREATE POLICY "Admins can update proposal settings"
ON public.proposal_settings FOR UPDATE
TO authenticated
USING (public.is_allowed_admin())
WITH CHECK (public.is_allowed_admin());

-- Seed the singleton row
INSERT INTO public.proposal_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Touch updated_at on update
CREATE OR REPLACE FUNCTION public.touch_proposal_settings_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER proposal_settings_set_updated_at
BEFORE UPDATE ON public.proposal_settings
FOR EACH ROW EXECUTE FUNCTION public.touch_proposal_settings_updated_at();
