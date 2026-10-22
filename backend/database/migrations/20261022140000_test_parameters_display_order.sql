-- Test parameters of one IS keep the order the user drags them into (FTR Test Parameter dialog).
-- NULL = no manual order yet; the list then follows the clause number.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.test_parameters ADD COLUMN IF NOT EXISTS display_order integer;
