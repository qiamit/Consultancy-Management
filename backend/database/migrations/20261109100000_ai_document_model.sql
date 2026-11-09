-- AI Settings: a separate (cheaper) AI model for document checks: AI Conformity Check and the PDF extractions
-- (CMPF-311, undertakings, non-conformity, test parameters, process flow chart, plant layout). Empty = the
-- Default AI Model is used, as before. Chat and the Admin Agent always use the Default AI Model.

ALTER TABLE public.ai_settings
  ADD COLUMN IF NOT EXISTS document_model_id uuid REFERENCES public.ai_models(id) ON DELETE SET NULL;
