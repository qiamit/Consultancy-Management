-- Manak Online "Application General Information": landline (registration, proof of establishment and address proof come from the client's legal documents).
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS landline text;

-- City master options (managed like District via the + dialog). Seed from cities already on clients.
INSERT INTO public.client_master_options (category, label, value)
SELECT DISTINCT 'city', btrim(c.city), btrim(c.city)
FROM public.clients c
WHERE c.city IS NOT NULL AND btrim(c.city) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.client_master_options o
    WHERE o.category = 'city' AND lower(o.label) = lower(btrim(c.city))
  );

-- Legal Documents: cert_name is now the "Type of Document"; doc_title is the free-text "Name of the Document".
ALTER TABLE public.client_certificate_files ADD COLUMN IF NOT EXISTS doc_title text;

-- GST Number and PAN now live on their document rows, so make sure the "PAN Card" type exists.
INSERT INTO public.client_master_options (category, label, value)
SELECT 'document_name', 'PAN Card', 'PAN Card'
WHERE NOT EXISTS (
  SELECT 1 FROM public.client_master_options o
  WHERE o.category = 'document_name' AND lower(o.label) IN ('pan card', 'pan')
);

NOTIFY pgrst, 'reload schema';
