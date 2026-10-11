-- BIS Branch Offices master fields on the existing bis_offices table.
-- Apply when the app is idle. Do not edit the S8 migration.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

ALTER TABLE public.bis_offices
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS pin_code text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS country_code text,
  ADD COLUMN IF NOT EXISTS contact_name text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS mobile text,
  ADD COLUMN IF NOT EXISTS remark text,
  ADD COLUMN IF NOT EXISTS gst_number text,
  ADD COLUMN IF NOT EXISTS longitude text,
  ADD COLUMN IF NOT EXISTS latitude text,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

ALTER TABLE public.bis_offices DROP CONSTRAINT IF EXISTS bis_offices_type_chk;

CREATE UNIQUE INDEX IF NOT EXISTS bis_offices_name_lower_active_uidx
  ON public.bis_offices (lower(btrim(name)))
  WHERE archived_at IS NULL;

DROP POLICY IF EXISTS bis_offices_select ON public.bis_offices;
CREATE POLICY bis_offices_select ON public.bis_offices
  FOR SELECT TO authenticated
  USING (
    (SELECT public.app_is_admin())
    OR (SELECT public.app_can_view('/masters/bis-branch-offices'))
    OR (SELECT public.app_can_view('/bis/projects'))
  );

DROP POLICY IF EXISTS bis_offices_write ON public.bis_offices;
DROP POLICY IF EXISTS bis_offices_insert ON public.bis_offices;
CREATE POLICY bis_offices_insert ON public.bis_offices
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.app_is_admin())
    OR (SELECT public.app_can_edit('/masters/bis-branch-offices'))
  );

DROP POLICY IF EXISTS bis_offices_update ON public.bis_offices;
CREATE POLICY bis_offices_update ON public.bis_offices
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.app_is_admin())
    OR (SELECT public.app_can_edit('/masters/bis-branch-offices'))
  )
  WITH CHECK (
    (SELECT public.app_is_admin())
    OR (SELECT public.app_can_edit('/masters/bis-branch-offices'))
  );

DROP POLICY IF EXISTS bis_offices_delete ON public.bis_offices;
CREATE POLICY bis_offices_delete ON public.bis_offices
  FOR DELETE TO authenticated
  USING ((SELECT public.app_is_admin()));

INSERT INTO public.client_master_options (category, label, value)
SELECT 'bis_office_type', seed.label, seed.label
FROM (
  VALUES
    ('Headquarters'),
    ('Regional Office'),
    ('Branch Office')
) AS seed(label)
WHERE NOT EXISTS (
  SELECT 1 FROM public.client_master_options o
  WHERE o.category = 'bis_office_type'
    AND lower(o.label) = lower(seed.label)
);

INSERT INTO public.client_master_options (category, label, value)
SELECT 'city', src.label, src.label
FROM (
  SELECT DISTINCT btrim(city) AS label
  FROM public.bis_offices
  WHERE nullif(btrim(city), '') IS NOT NULL
) src
WHERE NOT EXISTS (
  SELECT 1 FROM public.client_master_options o
  WHERE o.category = 'city'
    AND lower(o.label) = lower(src.label)
);

INSERT INTO public.client_master_options (category, label, value)
SELECT 'bis_region', src.label, src.label
FROM (
  SELECT DISTINCT btrim(region) AS label
  FROM public.bis_offices
  WHERE nullif(btrim(region), '') IS NOT NULL
) src
WHERE NOT EXISTS (
  SELECT 1 FROM public.client_master_options o
  WHERE o.category = 'bis_region'
    AND lower(o.label) = lower(src.label)
);

INSERT INTO public.module_access_rules (subject_type, subject_key, subject_label, module_key, access_level)
SELECT r.subject_type, r.subject_key, r.subject_label, '/masters/bis-branch-offices', r.access_level
FROM public.module_access_rules r
WHERE r.module_key = '/masters/clients'
  AND NOT EXISTS (
    SELECT 1 FROM public.module_access_rules x
    WHERE x.subject_type = r.subject_type
      AND x.subject_key = r.subject_key
      AND x.module_key = '/masters/bis-branch-offices'
  );


-- Official BIS offices from bis.gov.in (branch list 31 Aug 2026 and address list 20 Aug 2026).
-- Map points are the Google Maps search pin for each published address.
INSERT INTO public.bis_offices (
  code, name, office_type, region, address, pin_code, city, state, country, country_code,
  contact_name, email, mobile, gst_number, longitude, latitude, remark
)
SELECT
  v.code, v.name, v.office_type, v.region, v.address, v.pin_code, v.city, v.state, v.country, v.country_code,
  v.contact_name, v.email, v.mobile, v.gst_number, v.longitude, v.latitude, v.remark
FROM (
  VALUES
    ('HQ', 'Bureau of Indian Standards, Manak Bhavan', 'HQ', NULL::text, '9 Bahadur Shah Zafar Marg', '110002', 'New Delhi', 'Delhi', 'India', '+91', NULL::text, 'info@bis.gov.in', NULL::text, '07AAATB0431G1ZD', '77.2405645', '28.6310012', 'Tel: 011-23230131'),
    ('CRO', 'Central Regional Office', 'RO', 'CRO', '601/A, Konnectus Tower-1, 6th Floor, DMRC Building, Bhavbhuti Marg', '110002', 'New Delhi', 'Delhi', 'India', '+91', 'Sneh Lata', 'cro@bis.gov.in', NULL::text, '07AAATB0431G3ZB', '77.2326241', '28.6367455', 'Tel: 011-23237401'),
    ('ERO', 'Eastern Regional Office', 'RO', 'ERO', '8th Floor, Plot No. 7/7 and 7/8, CP Block, Sector V, Salt Lake', '700091', 'Kolkata', 'West Bengal', 'India', '+91', 'Meenakshi Ganesan', 'ero@bis.gov.in', NULL::text, '19AAATB0431G1Z8', '88.4394056', '22.5758122', 'Tel: 033-23670012'),
    ('NRO', 'Northern Regional Office', 'RO', 'NRO', 'Plot No. 4-A, Sector 27-B, Madhya Marg', '160019', 'Chandigarh', 'Chandigarh', 'India', '+91', 'Deepak Kumar Singla', 'nro@bis.gov.in', NULL::text, '04AAATB0431G1ZJ', '76.8043829', '30.7253702', 'Tel: 0172-2659930'),
    ('SRO', 'Southern Regional Office', 'RO', 'SRO', 'C.I.T. Campus, IV Cross Road, Taramani', '600113', 'Chennai', 'Tamil Nadu', 'India', '+91', 'S K Kanogia', 'sro@bis.gov.in', NULL::text, '33AAATB0431G2ZH', '80.2441116', '12.9954972', 'Tel: 044-22542365'),
    ('WRO', 'Western Regional Office', 'RO', 'WRO', '5th Floor, MTNL CETTM Technology Street, Hiranandani Gardens, Powai', '400076', 'Mumbai', 'Maharashtra', 'India', '+91', 'V Gopinath', 'wro@bis.gov.in', NULL::text, '27AAATB0431G1ZB', '72.9140825', '19.119645', 'Tel: 022-25702716'),
    ('BPBO', 'Bhopal Branch Office', 'BO', 'CRO', 'Commercial cum Office Complex, Manakalya, Opp. Dushera Maidan, E-5, Arera Colony, Bittan Market', '462016', 'Bhopal', 'Madhya Pradesh', 'India', '+91', 'Mohammad Rizwan', 'hbpbo@bis.gov.in', NULL::text, '23AAATB0431G1ZJ', '77.4282134', '23.2166367', 'Tel: 0755-2423453'),
    ('GZBO', 'Ghaziabad Branch Office', 'BO', 'CRO', 'Central Laboratory, Chemical Lab Block, Plot No. 20/9, Site IV, Sahibabad Industrial Area', '201010', 'Ghaziabad', 'Uttar Pradesh', 'India', '+91', 'Govindaraju Bhavani', 'hgzbo@bis.gov.in', NULL::text, '09AAATB0431G3Z7', '77.3266378', '28.6477097', 'Tel: 0120-2771092'),
    ('FRBO', 'Faridabad Branch Office', 'BO', 'NRO', 'SCO 21, Sector 12', '121007', 'Faridabad', 'Haryana', 'India', '+91', 'Mahendra Kumar Paramanik', 'hfrbo@bis.gov.in', NULL::text, '06AAATB0431G1ZF', '77.3179609', '28.3873235', 'Tel: 0129-2292173'),
    ('JPBO', 'Jaipur Branch Office', 'BO', 'CRO', 'Ground Floor, Prithviraj Road, Opp. Bharat Overseas Bank Limited, C-Scheme', '302001', 'Jaipur', 'Rajasthan', 'India', '+91', 'Aditya Das', 'hjpbo@bis.gov.in', NULL::text, '08AAATB0431G1ZB', '75.802256', '26.9091353', 'Tel: 0141-2223286'),
    ('DLBO1', 'Delhi Branch Office I', 'BO', 'CRO', '601/A, Konnectus Tower-1, 6th Floor, DMRC Building, Bhavbhuti Marg', '110002', 'New Delhi', 'Delhi', 'India', '+91', 'V Ramesh', 'hdlbo1@bis.gov.in', NULL::text, '07AAATB0431G3ZB', '77.2326241', '28.6367455', 'Tel: 011-23237401'),
    ('DLBO2', 'Delhi Branch Office II', 'BO', 'CRO', '601/A, Konnectus Tower-1, 6th Floor, DMRC Building, Bhavbhuti Marg', '110002', 'New Delhi', 'Delhi', 'India', '+91', 'Ved Prakash', 'hdlbo2@bis.gov.in', NULL::text, '07AAATB0431G3ZB', '77.2326241', '28.6367455', 'Tel: 011-23232922'),
    ('LKBO', 'Lucknow Branch Office', 'BO', 'CRO', 'Regional Telecom Training Centre, BSNL Building, Sector-G, LDA Colony, Ashiana', '226012', 'Lucknow', 'Uttar Pradesh', 'India', '+91', 'Sudheer Bishnoi', 'hlkbo@bis.gov.in', NULL::text, '09AAATB0431G1Z9', '80.900583', '26.790504', 'Tel: 0522-2728808'),
    ('NOBO', 'Noida Branch Office', 'BO', 'CRO', 'NITS Campus, A-20 and 21, Institutional Area, Sector 62', '201309', 'Noida', 'Uttar Pradesh', 'India', '+91', 'Koushik Dutta', 'hnobo-bis@bis.gov.in', NULL::text, '09AAATB0431G2Z8', '77.3664031', '28.6285761', 'Tel: 0120-2979004'),
    ('NLBO', 'Parwanoo Branch Office', 'BO', 'NRO', 'Plot No. 4-A, Sector 27-B, Madhya Marg', '160019', 'Chandigarh', 'Chandigarh', 'India', '+91', 'S C Naik', 'hnlbo@bis.gov.in', NULL::text, '02AAATB0431G1ZN', '76.8038397', '30.7252125', 'Official directory lists the Chandigarh regional office address. Tel: 01792-2650206'),
    ('DHBO', 'Dehradun Branch Office', 'BO', 'NRO', 'UCF Sadan, Ground Floor, Block D, Deep Nagar Road, Vishnu Vihar', '248001', 'Dehradun', 'Uttarakhand', 'India', '+91', 'H B Ade', 'hdhbo@bis.gov.in', NULL::text, '05AAATB0431G1ZH', '78.0531795', '30.2908705', 'Tel: 0135-7617777281'),
    ('JKBO', 'Jammu and Kashmir Branch Office', 'BO', 'NRO', 'Lane No. 4, SIDCO Industrial Complex, Bari Brahmana', '181133', 'Jammu', 'Jammu and Kashmir', 'India', '+91', 'Jeevanandam D', 'hjkbo@bis.gov.in', NULL::text, '01AAATB0431G2ZO', '74.9281463', '32.6408348', 'Tel: 01923-222690'),
    ('CHBO', 'Chandigarh Branch Office', 'BO', 'NRO', 'Plot No. 4-A, Sector 27-B, Madhya Marg', '160019', 'Chandigarh', 'Chandigarh', 'India', '+91', 'Shalu Varshney', 'hchbo1@bis.gov.in', NULL::text, '04AAATB0431G1ZJ', '76.8043829', '30.7253702', 'Tel: 0172-2997494'),
    ('HRBO', 'Haryana Branch Office', 'BO', 'NRO', 'Plot No. 4-A, Sector 27-B, Madhya Marg', '160019', 'Chandigarh', 'Chandigarh', 'India', '+91', 'Madhurima Madhav', 'hhrbo@bis.gov.in', NULL::text, '06AAATB0431G1ZF', '76.8043829', '30.7253702', 'Tel: 0172-2659065'),
    ('PPBO', 'Panipat Branch Office', 'BO', 'NRO', 'Plot No. 4-A, Sector 27-B, Madhya Marg', '160019', 'Chandigarh', 'Chandigarh', 'India', '+91', 'Shyam Charan Dass', 'ppbo-bis@bis.gov.in', NULL::text, '06AAATB0431G1ZF', '76.8043829', '30.7253702', 'Official directory lists the Chandigarh regional office address.'),
    ('PTBO', 'Patna Branch Office', 'BO', 'ERO', 'Patliputra Industrial Estate', '800013', 'Patna', 'Bihar', 'India', '+91', 'Chandrakesh Singh', 'hptbo@bis.gov.in', NULL::text, '10AAATB0431G1ZQ', '85.1042406', '25.6345571', 'Tel: 0612-2275342'),
    ('BHBO', 'Bhubaneswar Branch Office', 'BO', 'ERO', '6th Floor, Gruha Nirman Bhawan, OSHB Building, Sachivalaya Marg', '751001', 'Bhubaneswar', 'Odisha', 'India', '+91', 'A K Purohit', 'hbhbo@bis.gov.in', NULL::text, '21AAATB0431G1ZN', '85.83579', '20.27831', 'Tel: 0674-2390847'),
    ('GHBO', 'Guwahati Branch Office', 'BO', 'ERO', '2nd Floor, West End Block, HOUSEFED Building Complex, Last Gate, Dispur', '781006', 'Guwahati', 'Assam', 'India', '+91', 'Shouvik Chanda', 'hghbo@bis.gov.in', NULL::text, '18AAATB0431G1ZA', '91.7894335', '26.1369011', 'Tel: 0361-2226508'),
    ('KKBO', 'Kolkata Branch Office', 'BO', 'ERO', '7th Floor, Plot No. 7/7 and 7/8, CP Block, Sector V, Salt Lake', '700091', 'Kolkata', 'West Bengal', 'India', '+91', 'Sabyasachi Dhar', 'hkkbo@bis.gov.in', NULL::text, '19AAATB0431G1Z8', '88.4394056', '22.5759985', 'Tel: 033-23670017'),
    ('RPBO', 'Raipur Branch Office', 'BO', 'ERO', 'Manakalaya, Plot No. 13-C, Sector 24, Nava Raipur Atal Nagar', '492101', 'Nava Raipur', 'Chhattisgarh', 'India', '+91', 'Anurita Jojo', 'hrpbo@bis.gov.in', NULL::text, '22AAATB0431G1ZL', '81.7799187', '21.1483947', 'Tel: 0771-2412236'),
    ('JDBO', 'Jamshedpur Branch Office', 'BO', 'ERO', '55 and 57, M Road, Bistupur', '831001', 'Jamshedpur', 'Jharkhand', 'India', '+91', 'Kunal Kumar', 'hjdbo@bis.gov.in', '9891830363', '20AAATB0431G1ZP', '86.1799301', '22.7933353', NULL::text),
    ('BNBO', 'Bengaluru Branch Office', 'BO', 'SRO', 'Peenya Industrial Area, 1st Stage, Bengaluru-Tumkur Road', '560058', 'Bengaluru', 'Karnataka', 'India', '+91', 'Sushma Rao M', 'hbnbo@bis.gov.in', NULL::text, '29AAATB0431G1Z7', '77.5202964', '13.0381578', 'Tel: 080-28395604'),
    ('HYBO', 'Hyderabad Branch Office', 'BO', 'SRO', 'Plot No. 1, Sy. No. 367/1, Industrial Development Park, Moula Ali', '500040', 'Hyderabad', 'Telangana', 'India', '+91', 'P Venkat Srikanth', 'hhybo@bis.gov.in', NULL::text, '36AAATB0431G1ZC', '78.5580772', '17.4546068', NULL::text),
    ('CTBO', 'Coimbatore Branch Office', 'BO', 'SRO', '5th Floor, Kovai Towers, 44 Bala Sundaram Road', '641018', 'Coimbatore', 'Tamil Nadu', 'India', '+91', 'Ramesh K', 'hctbo@bis.gov.in', NULL::text, '33AAATB0431G2ZH', '76.9781336', '11.0079665', 'Tel: 0422-2248892'),
    ('KOBO', 'Kochi Branch Office', 'BO', 'SRO', 'II Floor, Central Warehousing Corporation Office Complex, Maveli Road, Gandhi Nagar, Kadavanthara', '682020', 'Kochi', 'Kerala', 'India', '+91', 'Narender Reddy Beesu', 'hkobo@bis.gov.in', NULL::text, '32AAATB0431G1ZK', '76.2954555', '9.9709858', 'Tel: 0484-2207066'),
    ('VJBO', 'Vijayawada Branch Office', 'BO', 'SRO', 'First Floor, 56-2-11, AP MARKFED Building, APIIC Colony, Jawahar Auto Nagar', '520007', 'Vijayawada', 'Andhra Pradesh', 'India', '+91', 'Prem Sajani Patnala', 'hvjbo@bis.gov.in', NULL::text, '37AAATB0431G1ZA', '80.6709289', '16.5050601', 'Tel: 0866-3501605'),
    ('CNBO', 'Chennai Branch Office', 'BO', 'SRO', 'C.I.T. Campus, IV Cross Road, Taramani', '600113', 'Chennai', 'Tamil Nadu', 'India', '+91', 'S D Dayanand', 'cnbo@bis.gov.in', NULL::text, '33AAATB0431G2ZH', '80.2441116', '12.9954972', 'Tel: 044-22541220'),
    ('MDBO', 'Madurai Branch Office', 'BO', 'SRO', 'First Floor, SIDCO Centre of Excellence, Women Industrial Park, Thoppur, Kappalur', '625008', 'Madurai', 'Tamil Nadu', 'India', '+91', 'S D Dayanand', 'hmdbo-bis@bis.gov.in', NULL::text, '33AAATB0431G2ZH', '78.0167467', '9.836304', 'Tel: 0452-2910334'),
    ('HUBO', 'Hubli Branch Office', 'BO', 'SRO', '1st Floor, KSFC Building, Hubli-Dharwad Highway, Rayapur', '580009', 'Dharwad', 'Karnataka', 'India', '+91', 'P N Murali', 'hubo@bis.gov.in', NULL::text, '29AAATB0431G1Z7', '75.0703803', '15.4037837', 'Tel: 0836-2957898'),
    ('AHBO', 'Ahmedabad Branch Office I', 'BO', 'WRO', '3rd Floor, Navajivan Amrut Jayanti Bhavan, Behind Gujarat Vidyapith, Off Ashram Road', '380014', 'Ahmedabad', 'Gujarat', 'India', '+91', 'Ajay Kumar Lal', 'hahbo@bis.gov.in', NULL::text, '24AAATB0431G1ZH', '72.5660929', '23.043706', 'Tel: 079-27540314'),
    ('AHBO2', 'Ahmedabad Branch Office II', 'BO', 'WRO', '3rd Floor, Navajivan Amrut Jayanti Bhavan, Behind Gujarat Vidyapith, Off Ashram Road', '380014', 'Ahmedabad', 'Gujarat', 'India', '+91', 'Sumit Sengar', 'ahbo-2@bis.gov.in', NULL::text, '24AAATB0431G1ZH', '72.5660929', '23.043706', 'Tel: 079-27540323'),
    ('SUBO', 'Surat Branch Office', 'BO', 'WRO', 'First Floor, Doorsanchar Bhavan, Karimabad Admin Building, Ghod Dod Road', '395001', 'Surat', 'Gujarat', 'India', '+91', 'Vikrant', 'headsubo@bis.gov.in', NULL::text, '24AAATB0431G1ZH', '72.8146134', '21.1757682', 'Tel: 0261-2990071'),
    ('PNBO', 'Pune Branch Office', 'BO', 'WRO', '657-660, MIDC Building, Market Yard, Gultekdi', '411037', 'Pune', 'Maharashtra', 'India', '+91', 'Kaushelendra Kumar', 'hpnbo@bis.gov.in', NULL::text, '27AAATB0431G1ZB', '73.8701046', '18.4837454', 'Tel: 020-24264911'),
    ('RJBO', 'Rajkot Branch Office', 'BO', 'WRO', 'F.P. No. 364/P, Ward No. 13, Opposite Crystal Mall, Kalawad Road', '360005', 'Rajkot', 'Gujarat', 'India', '+91', 'Parijat Shukla', 'hrjbo@bis.gov.in', NULL::text, '24AAATB0431G1ZH', '70.7623742', '22.278101', 'Tel: 0281-2563978'),
    ('GDBO', 'Gandhidham Branch Office', 'BO', 'WRO', 'F.P. No. 364/P, Ward No. 13, Opposite Crystal Mall, Kalawad Road', '360005', 'Rajkot', 'Gujarat', 'India', '+91', 'Rituraj', 'rjbo-2@bis.gov.in', NULL::text, '24AAATB0431G1ZH', '70.7623742', '22.278101', 'Official directory and Google Maps both place this office at the Rajkot branch address. Tel: 0281-2563978'),
    ('NGBO', 'Nagpur Branch Office', 'BO', 'WRO', 'Indian Bureau of Mines, Block A and D, 8th Floor, Indira Bhavan, Civil Lines', '440001', 'Nagpur', 'Maharashtra', 'India', '+91', 'Manoj Kumar Rajak', 'hngbo@bis.gov.in', NULL::text, '27AAATB0431G1ZB', '79.058096', '21.1613546', 'Tel: 0712-2540807'),
    ('MUBO1', 'Mumbai Branch Office I', 'BO', 'WRO', '5th Floor, MTNL CETTM Technology Street, Hiranandani Gardens, Powai', '400076', 'Mumbai', 'Maharashtra', 'India', '+91', 'Rajeev Ranjan Singh', 'hmubo1@bis.gov.in', NULL::text, '27AAATB0431G1ZB', '72.9140825', '19.119645', 'Tel: 022-25702721')
) AS v(
  code, name, office_type, region, address, pin_code, city, state, country, country_code,
  contact_name, email, mobile, gst_number, longitude, latitude, remark
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  office_type = EXCLUDED.office_type,
  region = EXCLUDED.region,
  address = EXCLUDED.address,
  pin_code = EXCLUDED.pin_code,
  city = EXCLUDED.city,
  state = EXCLUDED.state,
  country = EXCLUDED.country,
  country_code = EXCLUDED.country_code,
  contact_name = EXCLUDED.contact_name,
  email = EXCLUDED.email,
  mobile = EXCLUDED.mobile,
  gst_number = EXCLUDED.gst_number,
  longitude = EXCLUDED.longitude,
  latitude = EXCLUDED.latitude,
  remark = EXCLUDED.remark,
  updated_at = now();

INSERT INTO public.client_master_options (category, label, value)
SELECT src.category, src.label, src.label
FROM (
  SELECT 'city' AS category, btrim(city) AS label FROM public.bis_offices
  UNION
  SELECT 'state', btrim(state) FROM public.bis_offices
  UNION
  SELECT 'pin_code', btrim(pin_code) FROM public.bis_offices
  UNION
  SELECT 'bis_region', btrim(region) FROM public.bis_offices
) src
WHERE nullif(src.label, '') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.client_master_options o
    WHERE o.category = src.category AND lower(o.label) = lower(src.label)
  );

NOTIFY pgrst, 'reload schema';
