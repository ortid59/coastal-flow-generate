-- Allow campaign owners to UPDATE (upsert/replace) their files in the uploads bucket.
-- Without this policy, upsert: true on storage.from('uploads').upload(...) fails with
-- "new row violates row-level security policy" when replacing the photosheets PDF.
CREATE POLICY "owners update uploads"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'uploads'
  AND EXISTS (
    SELECT 1 FROM public.campaigns c
    WHERE c.id::text = (storage.foldername(objects.name))[1]
      AND c.user_id = auth.uid()
  )
)
WITH CHECK (
  bucket_id = 'uploads'
  AND EXISTS (
    SELECT 1 FROM public.campaigns c
    WHERE c.id::text = (storage.foldername(objects.name))[1]
      AND c.user_id = auth.uid()
  )
);

-- Same for photos bucket (consistency for any future upserts)
CREATE POLICY "owners update photos"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'photos'
  AND EXISTS (
    SELECT 1 FROM public.campaigns c
    WHERE c.id::text = (storage.foldername(objects.name))[1]
      AND c.user_id = auth.uid()
  )
)
WITH CHECK (
  bucket_id = 'photos'
  AND EXISTS (
    SELECT 1 FROM public.campaigns c
    WHERE c.id::text = (storage.foldername(objects.name))[1]
      AND c.user_id = auth.uid()
  )
);