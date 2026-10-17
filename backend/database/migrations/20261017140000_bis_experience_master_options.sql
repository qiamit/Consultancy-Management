-- Experience (in years) drop-down for technical staff: 1 Year … 25 Years (more can be added with the + button).
INSERT INTO public.lab_master_options (category, label, value)
SELECT 'experience',
       n || CASE WHEN n = 1 THEN ' Year' ELSE ' Years' END,
       n || CASE WHEN n = 1 THEN '-year' ELSE '-years' END
  FROM generate_series(1, 25) AS n
 WHERE NOT EXISTS (
   SELECT 1
     FROM public.lab_master_options existing
    WHERE existing.category = 'experience'
      AND lower(existing.label) = lower(n || CASE WHEN n = 1 THEN ' Year' ELSE ' Years' END)
 );
