-- Replaces client names and contact details, and removes sign-ins, secrets and mail, in a THROWAWAY copy of
-- the Consultancy Pro database (tc.sh fetch runs it inside a Postgres held in memory).
-- Prints counts only, never a value. -v test_password=... is the password every test account gets.
\set ON_ERROR_STOP on
\set VERBOSITY terse
\pset format unaligned
\pset tuples_only on
set client_min_messages = warning;
set search_path = public, extensions;
-- Audit triggers stay out of this: it is not real work.
set session_replication_role = replica;

create schema mask;
create table mask.map (real text primary key, fake text not null, kind text not null, strong boolean not null);
create table mask.rows_before (n bigint, t text);

-- Tables emptied below (secrets, mail, connector sign-ins): their row count is expected to change.
create table mask.emptied (t text primary key);

-- Row counts, to compare at the end.
do $$
declare r record; n bigint;
begin
  for r in select schemaname s, tablename t from pg_tables where schemaname in ('public','storage') loop
    execute format('select count(*) from %I.%I', r.s, r.t) into n;
    insert into mask.rows_before values (n, r.s||'.'||r.t);
  end loop;
end $$;

-- Values that are not client details, whatever column they are in.
create function mask.ignorable(v text) returns boolean language sql immutable as $f$
  select v is null or length(btrim(v)) < 3 or lower(btrim(v)) in
    ('n/a','nil','none','null','self','not applicable','na.','test','unknown','same','as above','other','partner')
$f$;

-- Safe to replace inside other text as well as in its own column? Short or one-word values and job titles are
-- replaced only when they are the whole cell: inside other text they would damage ordinary words.
create function mask.is_strong(v text, kind text) returns boolean language sql immutable as $f$
  select case kind
    when 'client'  then length(btrim(v)) >= 10 or (length(btrim(v)) >= 8 and btrim(v) like '% %')
    when 'contact' then length(btrim(v)) >= 8 and btrim(v) like '% %'
                        and lower(v) !~ '(manager|director|engineer|incharge|in-charge|head|officer|owner|proprietor|partner|quality|purchase|sales|account|department|supervisor|\yqc\y|\yqa\y)'
    when 'address' then length(btrim(v)) >= 12
    else length(btrim(v)) >= 6
  end
$f$;

create sequence mask.seq;
create function mask.fake(kind text, n bigint) returns text language sql immutable as $f$
  select case kind
    when 'client'  then 'Test Client '  || lpad(n::text, 4, '0')
    when 'contact' then 'Test Person ' || lpad(n::text, 4, '0')
    when 'address' then 'Test Address ' || lpad(n::text, 4, '0') || ', Test City'
    when 'email'   then 'client-' || lpad(n::text, 4, '0') || '@example.test'
    when 'mobile'  then '90000' || lpad(n::text, 5, '0')
    when 'gst'     then '27AAAAA' || lpad((n % 10000)::text, 4, '0') || 'A1Z5'
    when 'pan'     then 'AAAAA' || lpad((n % 10000)::text, 4, '0') || 'A'
    when 'ref'     then 'TEST-REF-' || lpad(n::text, 4, '0')
    -- A CM/L number is 10 digits from 6 to 9, like a mobile number. Each gets its own fake starting with 1, so
    -- the unique CM/L index and links between records still hold and the phone rule leaves it alone.
    when 'licence' then '1' || lpad(n::text, 9, '0')
  end
$f$;

-- Columns whose whole value is a client or person detail.
create table mask.cols as
  select c.table_schema s, c.table_name t, c.column_name col,
    case
      when c.column_name = 'cm_l_digits' then 'licence'
      when c.column_name ~ '^(client_name|customer_name|company_name|firm_name|party_name|applicant_name)$' then 'client'
      when c.table_name in ('clients', 'master_clients') and c.column_name = 'name' then 'client'
      when c.column_name ~ '^(contact_person|contact_person_name|ceo_name|person_name|branch_head_name|inspection_officer_name|dealing_officer_name|bis_desk_officer|bis_inspector_name|allotted_employee_name)$' then 'contact'
      when c.table_name in ('client_contacts', 'portal_customers') and c.column_name in ('name', 'full_name') then 'contact'
      when c.column_name ~ '^(address|client_address|billing_address|shipping_address)$' then 'address'
      when c.column_name ~ '^(email|contact_email|client_email|from_addr|to_addr|cc_addr)$' then 'email'
      when c.column_name ~ '^(mobile|phone|contact_mobile|whatsapp)$' then 'mobile'
      when c.column_name ~ '^(gst_number|client_gst_number|gstin)$' then 'gst'
      when c.column_name ~ '^(pan|pan_number)$' then 'pan'
      when c.column_name ~ '^(portal_user_id|manak_user_id)$' then 'ref'
    end kind
  from information_schema.columns c
  join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name
  where tb.table_type = 'BASE TABLE' and c.table_schema = 'public' and c.is_generated = 'NEVER'
    and c.data_type in ('text', 'character varying')
    -- Staff accounts are handled with the sign-ins below; Q Engineering's own details stay.
    and c.table_name not in ('user_profiles', 'profiles', 'company_settings', 'app_settings');
delete from mask.cols where kind is null;

-- Staff sign-ins first, so that their addresses are mapped too.
create table mask.users as
  select id, email real_email, 'user-' || lpad(row_number() over (order by created_at, id)::text, 2, '0') || '@example.test' fake_email
    from auth.users;
insert into mask.map select real_email, fake_email, 'staff', true from mask.users where not mask.ignorable(real_email) on conflict do nothing;
do $$
begin
  if to_regclass('public.user_profiles') is not null then
    insert into mask.map select p.email, u.fake_email, 'staff', true from public.user_profiles p join mask.users u on u.id = p.id
      where not mask.ignorable(p.email) on conflict do nothing;
  end if;
end $$;

-- Build the map, then replace whole cells.
do $$
declare r record; v text;
begin
  for r in select * from mask.cols order by (t in ('clients','master_clients')) desc, t, col loop
    for v in execute format('select distinct %I from %I.%I where %I is not null', r.col, r.s, r.t, r.col) loop
      continue when mask.ignorable(v) or exists (select 1 from mask.map m where m.real = v);
      insert into mask.map values (v, mask.fake(r.kind, nextval('mask.seq')), r.kind, mask.is_strong(v, r.kind));
    end loop;
    execute format('update %I.%I x set %I = m.fake from mask.map m where x.%I = m.real', r.s, r.t, r.col, r.col);
  end loop;
end $$;

-- People named inside application sections (Top Management, Technical Staff, signatories, correspondence):
-- every string under a key that holds a person's name, email or phone.
create function mask.json_pairs(j jsonb) returns table (k text, v text) language sql immutable as $f$
  with recursive walk(node) as (
    select j
    union all
    select x.child from walk, lateral (
      select e.value from jsonb_each(case when jsonb_typeof(walk.node) = 'object' then walk.node else '{}'::jsonb end) e
      union all
      select a.value from jsonb_array_elements(case when jsonb_typeof(walk.node) = 'array' then walk.node else '[]'::jsonb end) a
    ) x(child)
  )
  select e.key, e.value #>> '{}' from walk, lateral jsonb_each(case when jsonb_typeof(walk.node) = 'object' then walk.node else '{}'::jsonb end) e
   where jsonb_typeof(e.value) = 'string'
$f$;
do $$
declare r record; kind text;
begin
  if to_regclass('public.bis_project_module_data') is null then return; end if;
  for r in select distinct p.k, p.v from public.bis_project_module_data d, lateral mask.json_pairs(d.payload) p
            where p.k ~* '^(personname|name|signatoryname|authorizedsignatoryname|authorizedby|submittername|contactperson|email|mobile|phone|authorizedsignatoryemail|authorizedsignatorymobile|din|pan)$' loop
    continue when mask.ignorable(r.v) or exists (select 1 from mask.map m where m.real = r.v);
    kind := case when r.k ~* 'email' then 'email' when r.k ~* '(mobile|phone)' then 'mobile' when r.k ~* '^(din|pan)$' then 'ref' else 'contact' end;
    -- A name here is a person's, so a two-word name is replaced inside other text as well.
    insert into mask.map values (r.v, mask.fake(kind, nextval('mask.seq')), kind,
      case when kind = 'contact' then length(btrim(r.v)) >= 6 and btrim(r.v) like '% %' else mask.is_strong(r.v, kind) end);
  end loop;
end $$;

-- Q Engineering's own bank details are not for a test copy either.
do $$
declare v text;
begin
  if to_regclass('public.company_settings') is null then return; end if;
  for v in select unnest(array[bank_account_number, bank_ifsc, bank_upi_id]) from public.company_settings loop
    if not mask.ignorable(v) then insert into mask.map values (v, 'TEST-BANK', 'bank', true) on conflict do nothing; end if;
  end loop;
  update public.company_settings set bank_account_number = 'TEST-BANK', bank_ifsc = 'TEST-BANK', bank_upi_id = 'test@upi',
    bank_account_holder_name = 'Test Account';
end $$;

-- The same values inside other text and inside JSON, where quotes and new lines are escaped.
insert into mask.map
  select substr(j, 2, length(j) - 2), m.fake, m.kind, true
    from mask.map m cross join lateral (select to_json(m.real)::text j) x
   where m.strong and substr(j, 2, length(j) - 2) <> m.real on conflict do nothing;
create table mask.strong as
  select row_number() over (order by length(real) desc, real) id, real, fake, lower(real) lreal, length(real) len,
         regexp_replace(real, '([.*+?^${}()|\[\]\\])', '\\\1', 'g') esc
    from mask.map where strong and length(btrim(real)) >= 3;
create index on mask.strong (id);

-- Is any strong value in the text? lower(t) is worked out once, not once per strong value (thousands on live).
create function mask.has_real(t text) returns boolean language plpgsql stable as $f$
declare lt text := lower(t);
begin
  return exists (select 1 from mask.strong where strpos(lt, lreal) > 0);
end $f$;

-- Ids of the strong values found in a text, longest first.
create function mask.ids(t text) returns bigint[] language plpgsql stable as $f$
declare lt text := lower(t);
begin
  return (select coalesce(array_agg(s.id order by s.len desc), '{}') from mask.strong s
           where s.fake in (select f.fake from mask.strong f where strpos(lt, f.lreal) > 0));
end $f$;
create function mask.needs(t text) returns boolean language sql stable as $f$
  select t is not null and (mask.has_real(t)
                            or t ~ '[A-Za-z0-9._%+-]+@(?!example\.test)[A-Za-z0-9.-]+\.[A-Za-z]{2,}|(?<![0-9A-Za-z._/-])(\+?91[- ]?)?(?!90000)[6-9][0-9]{9}(?![0-9A-Za-z._/-])|(?<![0-9A-Za-z])(?!AAAAA)[A-Z]{5}[0-9]{4}[A-Z](?![0-9A-Za-z])')
$f$;

create function mask.patterns(t text) returns text language plpgsql stable as $f$
begin
  if t is null or t !~ '[A-Za-z0-9._%+-]+@(?!example\.test)[A-Za-z0-9.-]+\.[A-Za-z]{2,}|(?<![0-9A-Za-z._/-])(\+?91[- ]?)?(?!90000)[6-9][0-9]{9}(?![0-9A-Za-z._/-])|(?<![0-9A-Za-z])(?!AAAAA)[A-Z]{5}[0-9]{4}[A-Z](?![0-9A-Za-z])' then return t; end if;
  t := regexp_replace(t, '[A-Za-z0-9._%+-]+@(?!example\.test)[A-Za-z0-9.-]+\.[A-Za-z]{2,}', 'masked@example.test', 'g');
  t := regexp_replace(t, '(?<![0-9A-Za-z._/-])(\+?91[- ]?)?(?!90000)[6-9][0-9]{9}(?![0-9A-Za-z._/-])', '9000000000', 'g');
  t := regexp_replace(t, '(?<![0-9A-Za-z])[0-9]{2}(?!AAAAA)[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z](?![0-9A-Za-z])', '27AAAAA0000A1Z5', 'g');
  t := regexp_replace(t, '(?<![0-9A-Za-z])(?!AAAAA)[A-Z]{5}[0-9]{4}[A-Z](?![0-9A-Za-z])', 'AAAAA0000A', 'g');
  return t;
end $f$;

create function mask.text(t text, ids bigint[]) returns text language plpgsql stable as $f$
declare r record;
begin
  if t is null then return null; end if;
  if cardinality(ids) > 0 then
    for r in select s.esc, s.fake from mask.strong s where s.id = any(ids) and strpos(lower(t), s.lreal) > 0 order by s.len desc loop
      t := regexp_replace(t, r.esc, r.fake, 'gi');
    end loop;
  end if;
  return mask.patterns(t);
end $f$;

-- JSON: keys, string values and numbers that look like phone numbers are changed one by one, never the
-- structure, so the result is always valid JSON.
create function mask.json(j jsonb, ids bigint[]) returns jsonb language plpgsql stable as $f$
declare s text; m text;
begin
  case jsonb_typeof(j)
    when 'object' then
      return coalesce((select jsonb_object_agg(mask.text(k, ids), mask.json(v, ids)) from jsonb_each(j) e(k, v)), '{}'::jsonb);
    when 'array' then
      return coalesce((select jsonb_agg(mask.json(v, ids) order by i) from jsonb_array_elements(j) with ordinality a(v, i)), '[]'::jsonb);
    when 'string' then
      s := j #>> '{}'; m := mask.text(s, ids);
      return case when m is distinct from s then to_jsonb(m) else j end;
    when 'number' then
      s := j::text; m := mask.patterns(s);
      return case when m is distinct from s then to_jsonb(m) else j end;
    else return j;
  end case;
end $f$;
create function mask.fix_text(t text) returns text language sql stable as $f$ select mask.text(t, mask.ids(t)) $f$;
create function mask.fix_json(j jsonb) returns jsonb language sql stable as $f$ select mask.json(j, mask.ids(j::text)) $f$;

-- A text column whose CHECK rule is a fixed list of values holds settings, not free text: left out.
create function mask.has_check(s text, t text, col text) returns boolean language sql stable as $f$
  select exists (select 1 from pg_constraint k join pg_attribute a on a.attrelid = k.conrelid and a.attnum = any(k.conkey)
                   join information_schema.columns c on c.table_schema = s and c.table_name = t and c.column_name = col
                  where k.contype = 'c' and k.conrelid = format('%I.%I', s, t)::regclass and a.attname = col
                    and c.data_type in ('text', 'character varying')
                    and (pg_get_constraintdef(k.oid) ~ '= ANY \(\(?ARRAY\[' or pg_get_constraintdef(k.oid) ~ ' IN \('))
$f$;

-- Secrets, outside mail and connector sign-ins: emptied, never copied. Done before the scan so it is not wasted.
do $$
declare r record;
begin
  for r in select schemaname s, tablename t from pg_tables where schemaname = 'private' loop
    execute format('truncate %I.%I cascade', r.s, r.t);
  end loop;
  for r in select tablename t from pg_tables where schemaname = 'public'
            and tablename in ('assistant_mail_accounts', 'assistant_mail_messages', 'email_accounts', 'email_messages',
                              'mcp_oauth_clients', 'mcp_oauth_codes', 'mcp_oauth_tokens', 'portal_secret_access_log') loop
    execute format('truncate public.%I cascade', r.t);
    insert into mask.emptied values ('public.' || r.t) on conflict do nothing;
  end loop;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ai_models' and column_name = 'api_key') then
    update public.ai_models set api_key = null;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'bis_projects' and column_name = 'portal_password') then
    update public.bis_projects set portal_password = null;
  end if;
end $$;

-- Every other text, JSON and text-array column. Hash and path columns stay out where a changed value means
-- nothing. Numbers and dates are never touched.
create table mask.scan_log (t text, col text, changed bigint);
do $$
declare r record; q text; n bigint; expr text;
begin
  for r in
    select c.table_schema s, c.table_name t, c.column_name col, c.data_type dt, c.udt_name
      from information_schema.columns c
      join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name
     where tb.table_type = 'BASE TABLE' and c.is_generated = 'NEVER'
       and ((c.table_schema = 'public') or (c.table_schema = 'storage' and c.table_name in ('objects','prefixes') and c.column_name = 'name'))
       and (c.data_type in ('text','character varying','jsonb','json') or c.udt_name in ('_text','_varchar'))
       and c.column_name !~ '(_sha256|_hash)$'
       and not mask.has_check(c.table_schema, c.table_name, c.column_name)
  loop
    expr := case
      when r.dt = 'jsonb' then format('mask.fix_json(%I)', r.col)
      when r.dt = 'json'  then format('mask.fix_json(%I::jsonb)::json', r.col)
      when r.udt_name = '_text' then format('mask.fix_text(%I::text)::text[]', r.col)
      when r.udt_name = '_varchar' then format('mask.fix_text(%I::text)::varchar[]', r.col)
      else format('mask.fix_text(%I)', r.col)
    end;
    q := format('update %I.%I set %I = %s where mask.needs(%I::text)', r.s, r.t, r.col, expr, r.col);
    execute q;
    get diagnostics n = row_count;
    if n > 0 then insert into mask.scan_log values (r.s||'.'||r.t, r.col, n); end if;
  end loop;
end $$;

-- Sign-ins: test accounts only. No session, token or authenticator from the live app.
do $$
declare t text;
begin
  foreach t in array array['refresh_tokens','sessions','mfa_amr_claims','mfa_challenges','mfa_factors','one_time_tokens','flow_state',
                           'audit_log_entries','oauth_authorizations','oauth_consents','webauthn_challenges','webauthn_credentials'] loop
    if to_regclass('auth.'||t) is not null then execute format('truncate auth.%I cascade', t); end if;
  end loop;
end $$;
update auth.users u set email = m.fake_email, phone = null, phone_change = '', email_change = '',
    confirmation_token = '', recovery_token = '', email_change_token_new = '', email_change_token_current = '',
    reauthentication_token = '', phone_change_token = '',
    encrypted_password = crypt(:'test_password', gen_salt('bf', 10)),
    raw_user_meta_data = mask.fix_json(raw_user_meta_data)
  from mask.users m where m.id = u.id;
update auth.identities i set identity_data = mask.fix_json(identity_data);
do $$
begin
  if to_regclass('public.user_profiles') is not null then
    update public.user_profiles p set mobile = null, email = (select fake_email from mask.users m where m.id = p.id);
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'mobile') then
    update public.profiles set mobile = null;
  end if;
end $$;

-- Proof. Counts only. Any "FAILED" line stops tc.sh from keeping the result.
create table mask.left_over (check_name text, n bigint);
do $$
declare r record; n bigint; total_real bigint := 0; total_mail bigint := 0; total_phone bigint := 0; total_tax bigint := 0; k bigint;
begin
  for r in
    select c.table_schema s, c.table_name t, c.column_name col
      from information_schema.columns c
      join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name
     where tb.table_type = 'BASE TABLE' and c.table_schema in ('public','auth')
       and (c.data_type in ('text','character varying','jsonb','json') or c.udt_name in ('_text','_varchar'))
       and c.column_name !~ '(_sha256|_hash|encrypted_password)$'
       and not (c.table_schema = 'public' and mask.has_check(c.table_schema, c.table_name, c.column_name))
  loop
    execute format('select count(*) from %I.%I x where mask.has_real(x.%I::text)', r.s, r.t, r.col) into n; total_real := total_real + n;
    execute format($q$select count(*) from %I.%I where %I::text ~ '[A-Za-z0-9._%%+-]+@(?!example\.test)[A-Za-z0-9.-]+\.[A-Za-z]{2,}'$q$, r.s, r.t, r.col) into n; total_mail := total_mail + n;
    if r.s = 'public' then
      execute format($q$select count(*) from %I.%I where %I::text ~ '(?<![0-9A-Za-z._/-])(\+?91[- ]?)?(?!90000)[6-9][0-9]{9}(?![0-9A-Za-z._/-])'$q$, r.s, r.t, r.col) into n; total_phone := total_phone + n;
      execute format($q$select count(*) from %I.%I where %I::text ~ '(?<![0-9A-Za-z])[0-9]{2}(?!AAAAA)[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z](?![0-9A-Za-z])'$q$, r.s, r.t, r.col) into n; total_tax := total_tax + n;
    end if;
  end loop;
  insert into mask.left_over values ('real names or details left', total_real), ('other email addresses left', total_mail),
    ('phone numbers left', total_phone), ('GST numbers left', total_tax);
  select count(*) into n from auth.mfa_factors; insert into mask.left_over values ('authenticators left', n);
  select count(*) into n from auth.refresh_tokens; insert into mask.left_over values ('sign-in tokens left', n);
  select count(*) into n from auth.users where email !~ '@example\.test$'; insert into mask.left_over values ('real sign-ins left', n);
  n := 0;
  for r in select schemaname s, tablename t from pg_tables where schemaname = 'private' loop
    execute format('select count(*) from %I.%I', r.s, r.t) into k; n := n + k;
  end loop;
  insert into mask.left_over values ('stored secrets left', n);
  n := 0;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ai_models' and column_name = 'api_key') then
    select count(*) into n from public.ai_models where api_key is not null;
  end if;
  insert into mask.left_over values ('AI keys left', n);
  n := 0;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'bis_projects' and column_name = 'portal_password') then
    select count(*) into n from public.bis_projects where portal_password is not null;
  end if;
  insert into mask.left_over values ('Manak passwords left', n);
  select count(*) into n from (select b.t from mask.rows_before b where b.t not in (select t from mask.emptied)) b
    where (select x.n from mask.rows_before x where x.t = b.t) <> (select (xpath('/row/c/text()', query_to_xml(format('select count(*) c from %s', b.t), false, true, '')))[1]::text::bigint);
  insert into mask.left_over values ('tables with a changed row count', n);
end $$;

select 'map: ' || kind || ' ' || count(*) from mask.map group by kind order by kind;
select 'setting columns left as they are (fixed list of values): ' || count(*)
  from information_schema.columns c where c.table_schema = 'public'
   and (c.data_type in ('text','character varying','jsonb','json') or c.udt_name in ('_text','_varchar'))
   and mask.has_check(c.table_schema, c.table_name, c.column_name);
select 'emptied: ' || t from mask.emptied order by t;
select 'changed: ' || t || '.' || col || ' ' || changed from mask.scan_log order by t, col;
select case when n = 0 then 'ok      ' else 'FAILED  ' end || check_name || ': ' || n from mask.left_over;
select 'test accounts: ' || count(*) from auth.users;
