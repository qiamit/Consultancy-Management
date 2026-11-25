-- Required Tests (IS Code): the list opens in clause order by default (owner, 25 Nov 2026), but rows can now be moved
-- Up / Down by hand. custom_order = true keeps such a hand-made order (test_parameters.display_order) instead of
-- re-sorting by clause when the list is opened; clicking the Clause header sorts by clause again and clears it.
ALTER TABLE public.is_code_required_test_lists
  ADD COLUMN IF NOT EXISTS custom_order boolean NOT NULL DEFAULT false;
