
-- Public read for minimaps bucket (already public, but ensure SELECT policy exists)
CREATE POLICY "minimaps public read"
ON storage.objects FOR SELECT
USING (bucket_id = 'minimaps');

-- Allow service role / edge functions to write minimaps
CREATE POLICY "minimaps service write"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'minimaps');

CREATE POLICY "minimaps service update"
ON storage.objects FOR UPDATE
USING (bucket_id = 'minimaps');
