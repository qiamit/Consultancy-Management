-- BIS own laboratories for Laboratory Master.
-- Apply when the app is idle. Depends on laboratory address and GST columns.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- BIS laboratories from bis.gov.in regional-branch-offices list, 20 August 2026.
-- Map points are the Google Maps search pin for each published address.

INSERT INTO public.laboratories (
  name, lab_type, address, pin_code, district, state, country, country_code,
  contact_name, email, mobile, gst_number, longitude, latitude, remark, balance_type
)
SELECT
  v.name, v.lab_type, v.address, v.pin_code, v.district, v.state, v.country, v.country_code,
  v.contact_name, v.email, v.mobile, v.gst_number, v.longitude, v.latitude, v.remark, 'Dr'
FROM (
  VALUES
    ('BIS Central Laboratory, Sahibabad', 'BIS', 'Plot No. 20/9, Site IV, Sahibabad Industrial Area', '201010', 'Ghaziabad', 'Uttar Pradesh', 'India', '+91', 'K Venkateswara Rao', 'cl@bis.gov.in', NULL::text, '09AAATB0431G5Z5', '77.3268575', '28.6475492', 'Tel: 0120-2811951'),
    ('BIS Eastern Regional Laboratory, Kolkata', 'BIS', 'P-230, C.I.T. Scheme VII M, Block W, Kankurgachi', '700054', 'Kolkata', 'West Bengal', 'India', '+91', 'Subhadip Basu', 'erol@bis.gov.in', NULL::text, '19AAATB0431G1Z8', '88.3911141', '22.581483', 'Tel: 033-23209474. Main building: 1/14 VIP Road, Kankurgachi.'),
    ('BIS Northern Regional Laboratory, Mohali', 'BIS', 'B-69, Phase VII, SAS Nagar Industrial Focal Point', '160051', 'Mohali', 'Punjab', 'India', '+91', 'Partha Sarthi Mandal', 'nrol@bis.gov.in', NULL::text, '03AAATB0431G1ZL', '76.6940251', '30.7138868', 'Tel: 0172-4671027'),
    ('BIS Western Regional Laboratory, Mumbai', 'BIS', 'E-9, M.I.D.C., Behind Marol Telephone Exchange, Andheri East', '400093', 'Mumbai', 'Maharashtra', 'India', '+91', 'Anil Kapri', 'wrol@bis.gov.in', NULL::text, '27AAATB0431G1ZB', '72.8693856', '19.119441', 'Tel: 022-28327856'),
    ('BIS Southern Regional Laboratory, Chennai', 'BIS', 'C.I.T. Campus, IV Cross Road', '600113', 'Chennai', 'Tamil Nadu', 'India', '+91', 'Surya Kalyani S', 'srol@bis.gov.in', NULL::text, '33AAATB0431G2ZH', '80.2441443', '12.9961169', 'Tel: 044-22541208'),
    ('BIS Bengaluru Branch Laboratory', 'BIS', 'Peenya Industrial Area, 1st Stage, Bengaluru-Tumkur Road', '560058', 'Bengaluru', 'Karnataka', 'India', '+91', 'S D Rane', 'bnbol@bis.gov.in', NULL::text, '29AAATB0431G1Z7', '77.5202964', '13.0381578', 'Tel: 080-23721442'),
    ('BIS Patna Branch Laboratory', 'BIS', 'Patliputra Industrial Estate', '800013', 'Patna', 'Bihar', 'India', '+91', 'Koushik Dutta', 'pbol@bis.gov.in', NULL::text, '10AAATB0431G1ZQ', '85.1042406', '25.6345571', 'Tel: 0612-2262808'),
    ('BIS Guwahati Branch Laboratory', 'BIS', '2nd Floor, West End Block, HOUSEFED Building Complex, Beltola, Dispur', '781006', 'Guwahati', 'Assam', 'India', '+91', 'Subhadip Basu', 'gbol@bis.gov.in', NULL::text, '18AAATB0431G1ZA', '91.7894335', '26.1369011', 'Tel: 0361-2525937'),
    ('BIS Hyderabad Branch Laboratory', 'BIS', 'Sy. No. 367/1, Industrial Development Park, Moula Ali', '500040', 'Hyderabad', 'Telangana', 'India', '+91', 'M Vinod Arul Jebanath', 'hybl@bis.gov.in', '9154843232', '36AAATB0431G1ZC', '78.5580772', '17.4546068', NULL::text),
    ('BIS Jammu Branch Laboratory', 'BIS', 'Lane No. 4, SIDCO Industrial Complex, Bari Brahmana', '181133', 'Jammu', 'Jammu and Kashmir', 'India', '+91', 'Partha Sarthi Mandal', 'jk-ral@bis.gov.in', NULL::text, '01AAATB0431G2ZO', '74.9211407', '32.6386783', 'Tel: 01923-222690')
) AS v(
  name, lab_type, address, pin_code, district, state, country, country_code,
  contact_name, email, mobile, gst_number, longitude, latitude, remark
)
WHERE NOT EXISTS (
  SELECT 1 FROM public.laboratories existing
  WHERE lower(btrim(existing.name)) = lower(btrim(v.name))
);

NOTIFY pgrst, 'reload schema';
