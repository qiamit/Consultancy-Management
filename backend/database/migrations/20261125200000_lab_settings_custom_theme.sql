-- Company Settings → Settings: the theme the admin saves now applies to every user (owner, 25 Nov 2026: "Jo Theme
-- Admin Select karo wo hi Sab par Apply ho"). Built-in themes are known to every app by their id, but a custom
-- theme (Create Custom Theme) lived only in the admin's browser. Its definition ({id, name, accent, mode}) is saved
-- here with the theme id, so staff apps can draw it too. Null when the saved theme is a built-in one.
ALTER TABLE public.lab_settings
  ADD COLUMN IF NOT EXISTS custom_theme jsonb;
