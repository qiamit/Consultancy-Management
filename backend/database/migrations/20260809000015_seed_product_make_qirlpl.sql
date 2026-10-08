-- Default product make
INSERT INTO public.product_makes (name)
VALUES ('QIRLPL')
ON CONFLICT (name) DO NOTHING;
