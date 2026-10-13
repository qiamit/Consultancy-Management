-- AUD-08: client-specific optional seal/sign image for BIS Form 1.
-- The image remains in the existing private client-certificates bucket.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS seal_sign_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS seal_sign_image_path text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'clients_seal_sign_path_length_ck'
      AND conrelid = 'public.clients'::regclass
  ) THEN
    ALTER TABLE public.clients
      ADD CONSTRAINT clients_seal_sign_path_length_ck
      CHECK (seal_sign_image_path IS NULL OR length(seal_sign_image_path) <= 500) NOT VALID;
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'clients_seal_sign_enabled_has_image_ck'
      AND conrelid = 'public.clients'::regclass
  ) THEN
    ALTER TABLE public.clients
      ADD CONSTRAINT clients_seal_sign_enabled_has_image_ck
      CHECK (NOT seal_sign_enabled OR seal_sign_image_path IS NOT NULL) NOT VALID;
  END IF;
END;
$$;

COMMENT ON COLUMN public.clients.seal_sign_enabled IS
  'When true, include this client''s uploaded seal/sign image in Form 1; false leaves the physical-stamp box blank.';
COMMENT ON COLUMN public.clients.seal_sign_image_path IS
  'Private client-certificates bucket path for the optional Form 1 seal/sign image.';
