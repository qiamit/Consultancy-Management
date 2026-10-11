-- Refresh PostgREST after the BIS application capacity columns were added.
NOTIFY pgrst, 'reload schema';
