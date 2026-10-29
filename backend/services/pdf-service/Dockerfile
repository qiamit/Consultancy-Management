FROM mcr.microsoft.com/playwright:v1.63.0-noble

# Fonts the generated documents ask for, so the PDF lays out like the browser preview:
# - fonts-liberation: Liberation Sans / Serif, metric-compatible with Arial / Times New Roman (page splits match)
# - fonts-dejavu-core: wide Unicode fallback (₹, symbols)
# - fonts-noto-core: Noto Sans Devanagari and other Indic scripts (Hindi text on BIS documents)
# - fonts-urw-base35: Z003 (Zapf Chancery clone), the cursive fallback for typed quotation signatures
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    fonts-liberation \
    fonts-dejavu-core \
    fonts-noto-core \
    fonts-urw-base35 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.mjs ./

ENV NODE_ENV=production
ENV PDF_SERVICE_HOST=0.0.0.0
ENV PLAYWRIGHT_NO_SANDBOX=1

CMD ["node", "server.mjs"]
