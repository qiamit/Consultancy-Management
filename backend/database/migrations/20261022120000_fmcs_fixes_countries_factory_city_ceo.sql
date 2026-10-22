-- FMCS fixes A/B: countries and dial codes for foreign clients, a factory city, and the CEO on the client.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Factory city can differ from the office city (FMCS factory in another town).
ALTER TABLE public.client_sites ADD COLUMN IF NOT EXISTS city text;
-- Manak "CEO Name" is the firm's CEO / Managing Director, not the contact person.
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS ceo_name text;

INSERT INTO public.client_master_options (category, label, value)
SELECT 'country', v.name, v.name
FROM (VALUES
  ('Afghanistan'),
  ('Australia'),
  ('Austria'),
  ('Bangladesh'),
  ('Belgium'),
  ('Bhutan'),
  ('Brazil'),
  ('Canada'),
  ('China'),
  ('Czech Republic'),
  ('Denmark'),
  ('Egypt'),
  ('Finland'),
  ('France'),
  ('Germany'),
  ('Greece'),
  ('Hong Kong'),
  ('Hungary'),
  ('Indonesia'),
  ('Iran'),
  ('Ireland'),
  ('Israel'),
  ('Italy'),
  ('Japan'),
  ('Malaysia'),
  ('Mexico'),
  ('Nepal'),
  ('Netherlands'),
  ('New Zealand'),
  ('Norway'),
  ('Oman'),
  ('Philippines'),
  ('Poland'),
  ('Portugal'),
  ('Qatar'),
  ('Romania'),
  ('Russia'),
  ('Saudi Arabia'),
  ('Singapore'),
  ('Slovakia'),
  ('Slovenia'),
  ('South Africa'),
  ('South Korea'),
  ('Spain'),
  ('Sri Lanka'),
  ('Sweden'),
  ('Switzerland'),
  ('Taiwan'),
  ('Thailand'),
  ('Turkey'),
  ('Ukraine'),
  ('United Arab Emirates'),
  ('United Kingdom'),
  ('United States'),
  ('Vietnam')
) AS v(name)
WHERE NOT EXISTS (
  SELECT 1 FROM public.client_master_options o WHERE o.category = 'country' AND lower(o.label) = lower(v.name)
);

INSERT INTO public.client_master_options (category, label, value)
SELECT 'country_code', v.label, v.code
FROM (VALUES
  ('+1 (CA/US)', '+1'),
  ('+7 (RU)', '+7'),
  ('+20 (EG)', '+20'),
  ('+27 (ZA)', '+27'),
  ('+30 (GR)', '+30'),
  ('+31 (NL)', '+31'),
  ('+32 (BE)', '+32'),
  ('+33 (FR)', '+33'),
  ('+34 (ES)', '+34'),
  ('+36 (HU)', '+36'),
  ('+39 (IT)', '+39'),
  ('+40 (RO)', '+40'),
  ('+41 (CH)', '+41'),
  ('+43 (AT)', '+43'),
  ('+44 (GB)', '+44'),
  ('+45 (DK)', '+45'),
  ('+46 (SE)', '+46'),
  ('+47 (NO)', '+47'),
  ('+48 (PL)', '+48'),
  ('+49 (DE)', '+49'),
  ('+52 (MX)', '+52'),
  ('+55 (BR)', '+55'),
  ('+60 (MY)', '+60'),
  ('+61 (AU)', '+61'),
  ('+62 (ID)', '+62'),
  ('+63 (PH)', '+63'),
  ('+64 (NZ)', '+64'),
  ('+65 (SG)', '+65'),
  ('+66 (TH)', '+66'),
  ('+81 (JP)', '+81'),
  ('+82 (KR)', '+82'),
  ('+84 (VN)', '+84'),
  ('+86 (CN)', '+86'),
  ('+90 (TR)', '+90'),
  ('+93 (AF)', '+93'),
  ('+94 (LK)', '+94'),
  ('+98 (IR)', '+98'),
  ('+351 (PT)', '+351'),
  ('+353 (IE)', '+353'),
  ('+358 (FI)', '+358'),
  ('+380 (UA)', '+380'),
  ('+386 (SI)', '+386'),
  ('+420 (CZ)', '+420'),
  ('+421 (SK)', '+421'),
  ('+852 (HK)', '+852'),
  ('+880 (BD)', '+880'),
  ('+886 (TW)', '+886'),
  ('+966 (SA)', '+966'),
  ('+968 (OM)', '+968'),
  ('+971 (AE)', '+971'),
  ('+972 (IL)', '+972'),
  ('+974 (QA)', '+974'),
  ('+975 (BT)', '+975'),
  ('+977 (NP)', '+977')
) AS v(label, code)
WHERE NOT EXISTS (
  SELECT 1 FROM public.client_master_options o WHERE o.category = 'country_code' AND o.value = v.code
);

NOTIFY pgrst, 'reload schema';
