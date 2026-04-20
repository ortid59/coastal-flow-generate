-- 1. Enable pgcrypto for bcrypt-style password hashing (crypt + gen_salt)
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;

-- 2. Add password fields to campaigns
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS portal_password_hash text,
  ADD COLUMN IF NOT EXISTS portal_password_set_at timestamptz;

-- 3. Tighten the public portal RLS: require BOTH a token AND a password hash
DROP POLICY IF EXISTS "portal public read campaigns" ON public.campaigns;
CREATE POLICY "portal public read campaigns"
  ON public.campaigns
  FOR SELECT
  USING (portal_token IS NOT NULL AND portal_password_hash IS NOT NULL);

DROP POLICY IF EXISTS "portal public read units" ON public.units;
CREATE POLICY "portal public read units"
  ON public.units
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.campaigns c
    WHERE c.id = units.campaign_id
      AND c.portal_token IS NOT NULL
      AND c.portal_password_hash IS NOT NULL
  ));

-- 4. Verifier used by the public portal page (returns campaign id when password matches)
CREATE OR REPLACE FUNCTION public.verify_portal_password(_token text, _password text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _campaign_id uuid;
BEGIN
  SELECT id INTO _campaign_id
  FROM public.campaigns
  WHERE portal_token = _token
    AND portal_password_hash IS NOT NULL
    AND portal_password_hash = crypt(_password, portal_password_hash);
  RETURN _campaign_id;
END;
$$;

REVOKE ALL ON FUNCTION public.verify_portal_password(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.verify_portal_password(text, text) TO anon, authenticated;

-- 5. Set / rotate password (only campaign owner can call it)
CREATE OR REPLACE FUNCTION public.set_campaign_portal_password(_campaign_id uuid, _password text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _token text;
  _owner uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF _password IS NULL OR length(_password) < 4 THEN
    RAISE EXCEPTION 'Password must be at least 4 characters' USING ERRCODE = '22023';
  END IF;
  SELECT user_id, portal_token INTO _owner, _token
  FROM public.campaigns WHERE id = _campaign_id;
  IF _owner IS NULL OR _owner <> auth.uid() THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  IF _token IS NULL THEN
    _token := encode(gen_random_bytes(18), 'hex');
  END IF;
  UPDATE public.campaigns
     SET portal_password_hash = crypt(_password, gen_salt('bf', 10)),
         portal_password_set_at = now(),
         portal_token = _token
   WHERE id = _campaign_id;
  RETURN _token;
END;
$$;

REVOKE ALL ON FUNCTION public.set_campaign_portal_password(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.set_campaign_portal_password(uuid, text) TO authenticated;

-- 6. Revoke share link entirely
CREATE OR REPLACE FUNCTION public.revoke_campaign_portal(_campaign_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _owner uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  SELECT user_id INTO _owner FROM public.campaigns WHERE id = _campaign_id;
  IF _owner IS NULL OR _owner <> auth.uid() THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  UPDATE public.campaigns
     SET portal_token = NULL,
         portal_password_hash = NULL,
         portal_password_set_at = NULL
   WHERE id = _campaign_id;
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_campaign_portal(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.revoke_campaign_portal(uuid) TO authenticated;

-- 7. Helper: is current signed-in user on the allowlist?
CREATE OR REPLACE FUNCTION public.is_allowed_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.allowed_users a
    JOIN auth.users u ON lower(u.email) = lower(a.email)
    WHERE u.id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_allowed_admin() TO authenticated;

-- 8. Allowlist management (admin only)
CREATE OR REPLACE FUNCTION public.admin_add_allowed_user(_email text, _note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_allowed_admin() THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.allowed_users (email, note)
    VALUES (lower(trim(_email)), _note)
    ON CONFLICT (email) DO UPDATE SET note = EXCLUDED.note;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_remove_allowed_user(_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_allowed_admin() THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.allowed_users WHERE lower(email) = lower(trim(_email));
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_add_allowed_user(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_remove_allowed_user(text) TO authenticated;

-- 9. Allow signed-in admins to read the allowlist
ALTER TABLE public.allowed_users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins read allowlist" ON public.allowed_users;
CREATE POLICY "admins read allowlist"
  ON public.allowed_users
  FOR SELECT
  TO authenticated
  USING (public.is_allowed_admin());

-- 10. Ensure email is unique on allowed_users (needed for ON CONFLICT above)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'allowed_users_email_key'
  ) THEN
    ALTER TABLE public.allowed_users ADD CONSTRAINT allowed_users_email_key UNIQUE (email);
  END IF;
END $$;