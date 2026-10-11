-- Storage API deletes set storage.operation (for example storage.object.delete_many)
-- but do not set storage.allow_delete_query. protect_delete then raises 42501,
-- and the Storage client shows that as "new row violates row-level security policy".
-- Allow the Storage API's own delete operations. Direct SQL deletes stay blocked.
-- Apply when the app is idle.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE OR REPLACE FUNCTION storage.protect_delete()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  op text := coalesce(current_setting('storage.operation', true), '');
BEGIN
  IF coalesce(current_setting('storage.allow_delete_query', true), 'false') = 'true'
     OR op IN (
       'storage.object.delete',
       'storage.object.delete_many',
       'storage.s3.object.delete',
       'storage.s3.object.delete_many',
       'storage.bucket.delete',
       'storage.bucket.empty',
       'storage.s3.bucket.delete'
     )
  THEN
    RETURN NULL;
  END IF;

  RAISE EXCEPTION 'Direct deletion from storage tables is not allowed. Use the Storage API instead.'
    USING HINT = 'This prevents accidental data loss from orphaned objects.',
          ERRCODE = '42501';
END;
$function$;
