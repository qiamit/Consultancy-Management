-- Lab Settings → Settings tab saves an "Active Button – On & Off" switch (Generate Report Format /
-- Conduct Generate Report) into lab_settings.generate_report_enabled, but the column was never
-- created, so every Save on that tab failed with "column not found". Default true = feature on,
-- the same default the app assumes when the value is missing.
ALTER TABLE public.lab_settings
  ADD COLUMN IF NOT EXISTS generate_report_enabled boolean NOT NULL DEFAULT true;
