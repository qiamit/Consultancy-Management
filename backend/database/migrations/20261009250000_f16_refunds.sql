-- F16: refund vouchers are money returned to a client.
-- They are transactions with payment_flow out and extra.book = refund.
-- A refund is not a GST document. It names a payment receipt when one is chosen.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

INSERT INTO public.document_series (doc_type, prefix, next_number, pad_width) VALUES
  ('REFUND', 'QE/26-27/RF/', 1, 4)
ON CONFLICT (doc_type) DO NOTHING;

NOTIFY pgrst, 'reload schema';
