-- Seed Quotation Number prefix for Lab Settings → Prefix's (auto numbering).
-- Uses QI/QTN/YYYY- style to align with Report Number / Equipment prefixes.
INSERT INTO public.lab_prefixes (name, prefix, last_number)
SELECT
  'Quotation Number',
  'QI/QTN/' || to_char(CURRENT_DATE, 'YYYY') || '-',
  0
WHERE NOT EXISTS (
  SELECT 1
  FROM public.lab_prefixes
  WHERE lower(trim(name)) IN ('quotation number', 'quotation', 'qtn')
);
