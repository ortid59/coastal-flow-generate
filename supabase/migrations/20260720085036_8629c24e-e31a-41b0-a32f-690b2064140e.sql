
-- Campaigns
DROP POLICY IF EXISTS "own campaigns" ON public.campaigns;
CREATE POLICY "team manage campaigns" ON public.campaigns
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Units
DROP POLICY IF EXISTS "own units" ON public.units;
CREATE POLICY "team manage units" ON public.units
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Vendor files
DROP POLICY IF EXISTS "own files" ON public.vendor_files;
CREATE POLICY "team manage vendor_files" ON public.vendor_files
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Jobs
DROP POLICY IF EXISTS "own jobs" ON public.jobs;
CREATE POLICY "team manage jobs" ON public.jobs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Storage: photos bucket (private) — any authenticated user
DROP POLICY IF EXISTS "owners read photos" ON storage.objects;
DROP POLICY IF EXISTS "owners write photos" ON storage.objects;
DROP POLICY IF EXISTS "owners update photos" ON storage.objects;

CREATE POLICY "auth read photos" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'photos');
CREATE POLICY "auth write photos" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'photos');
CREATE POLICY "auth update photos" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'photos') WITH CHECK (bucket_id = 'photos');
CREATE POLICY "auth delete photos" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'photos');

-- Storage: uploads bucket (private) — any authenticated user
DROP POLICY IF EXISTS "owners read uploads" ON storage.objects;
DROP POLICY IF EXISTS "owners write uploads" ON storage.objects;
DROP POLICY IF EXISTS "owners update uploads" ON storage.objects;
DROP POLICY IF EXISTS "owners delete uploads" ON storage.objects;

CREATE POLICY "auth read uploads" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'uploads');
CREATE POLICY "auth write uploads" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'uploads');
CREATE POLICY "auth update uploads" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'uploads') WITH CHECK (bucket_id = 'uploads');
CREATE POLICY "auth delete uploads" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'uploads');
