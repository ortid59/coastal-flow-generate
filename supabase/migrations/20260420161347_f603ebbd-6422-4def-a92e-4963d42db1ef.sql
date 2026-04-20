CREATE OR REPLACE FUNCTION public.set_campaign_portal_password(_campaign_id uuid, _password text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    _token := encode(extensions.gen_random_bytes(18), 'hex');
  END IF;
  UPDATE public.campaigns
     SET portal_password_hash = extensions.crypt(_password, extensions.gen_salt('bf', 10)),
         portal_password_set_at = now(),
         portal_token = _token
   WHERE id = _campaign_id;
  RETURN _token;
END;
$function$;

CREATE OR REPLACE FUNCTION public.verify_portal_password(_token text, _password text)
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _campaign_id uuid;
BEGIN
  SELECT id INTO _campaign_id
  FROM public.campaigns
  WHERE portal_token = _token
    AND portal_password_hash IS NOT NULL
    AND portal_password_hash = extensions.crypt(_password, portal_password_hash);
  RETURN _campaign_id;
END;
$function$;