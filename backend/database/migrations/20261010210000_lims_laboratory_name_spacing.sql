-- Space and capital after a closing bracket or ampersand in LIMS laboratory names.
-- Apply when the app is idle.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

UPDATE public.laboratories
SET name = '(Deferred) Cotton Association of India, Cotton Testing and Research Laboratory, Ahmedabad',
    updated_at = now()
WHERE name = '(Deferred)cotton Association of India, Cotton Testing and Research Laboratory, Ahmedabad';

UPDATE public.laboratories
SET name = '(Deferred) Cotton Association of India, Cotton Testing and Research Laboratory, Bathinda',
    updated_at = now()
WHERE name = '(Deferred)cotton Association of India, Cotton Testing and Research Laboratory, Bathinda';

UPDATE public.laboratories
SET name = '(Deferred) Cotton Association of India, Cotton Testing and Research Laboratory, Khargone',
    updated_at = now()
WHERE name = '(Deferred)cotton Association of India, Cotton Testing and Research Laboratory, Khargone';

UPDATE public.laboratories
SET name = '(Deferred) Wakefield Inspection Services India Private Limited, Mumbai',
    updated_at = now()
WHERE name = '(Deferred)wakefield Inspection Services India Private Limited, Mumbai';

UPDATE public.laboratories
SET name = 'Aadishakti Testing & Research Laboratories LLP',
    updated_at = now()
WHERE name = 'Aadishakti Testing &research Laboratories LLP';

UPDATE public.laboratories
SET name = 'AA Electro Magnetic Laboratory Private Limited, Gurugram',
    updated_at = now()
WHERE name = 'Aa Electro Magnetic Laboratory Private Limited, Gurugram';

NOTIFY pgrst, 'reload schema';
