-- IS Code Master: Quality Engineering fee / manual / slab fields
-- (keep LIMS UI style; add missing IS-related data columns).

ALTER TABLE public.is_codes
  ADD COLUMN IF NOT EXISTS product_manual_number text,
  ADD COLUMN IF NOT EXISTS unit_of_is text,
  ADD COLUMN IF NOT EXISTS mmf_large_scale numeric(14, 2),
  ADD COLUMN IF NOT EXISTS mmf_medium_scale numeric(14, 2),
  ADD COLUMN IF NOT EXISTS mmf_small_scale numeric(14, 2),
  ADD COLUMN IF NOT EXISTS mmf_micro_scale numeric(14, 2),
  ADD COLUMN IF NOT EXISTS slab_1_quantity text,
  ADD COLUMN IF NOT EXISTS slab_1_rate numeric(14, 2),
  ADD COLUMN IF NOT EXISTS slab_2_quantity text,
  ADD COLUMN IF NOT EXISTS slab_2_rate numeric(14, 2),
  ADD COLUMN IF NOT EXISTS slab_3_quantity text,
  ADD COLUMN IF NOT EXISTS slab_3_rate numeric(14, 2);

UPDATE public.is_codes
SET
  unit_of_is = COALESCE(NULLIF(btrim(unit_of_is), ''), 'Tonne'),
  slab_1_quantity = COALESCE(NULLIF(btrim(slab_1_quantity), ''), 'All Quantities'),
  slab_2_quantity = COALESCE(NULLIF(btrim(slab_2_quantity), ''), 'N/A'),
  slab_3_quantity = COALESCE(NULLIF(btrim(slab_3_quantity), ''), 'N/A'),
  mmf_large_scale = COALESCE(mmf_large_scale, 0),
  mmf_medium_scale = COALESCE(mmf_medium_scale, 0),
  mmf_small_scale = COALESCE(mmf_small_scale, 0),
  mmf_micro_scale = COALESCE(mmf_micro_scale, 0),
  slab_1_rate = COALESCE(slab_1_rate, 0),
  slab_2_rate = COALESCE(slab_2_rate, 0),
  slab_3_rate = COALESCE(slab_3_rate, 0);

COMMENT ON COLUMN public.is_codes.product_manual_number IS
  'BIS Product Manual number (e.g. PM / 17425 / …)';
COMMENT ON COLUMN public.is_codes.unit_of_is IS
  'Unit used for marking fee / slab rates (Tonne, Pcs, …)';
COMMENT ON COLUMN public.is_codes.mmf_large_scale IS
  'Minimum marking fee — Large scale';
COMMENT ON COLUMN public.is_codes.mmf_medium_scale IS
  'Minimum marking fee — Medium scale';
COMMENT ON COLUMN public.is_codes.mmf_small_scale IS
  'Minimum marking fee — Small scale';
COMMENT ON COLUMN public.is_codes.mmf_micro_scale IS
  'Minimum marking fee — Micro scale';

NOTIFY pgrst, 'reload schema';
