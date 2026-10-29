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
# Chromium's own sandbox needs user namespaces, which Docker's default seccomp profile (and Ubuntu's AppArmor
# restriction on unprivileged user namespaces) block unless the container gets SYS_ADMIN or a custom seccomp
# profile. We keep --no-sandbox instead and contain the renderer another way: it runs as the unprivileged
# pwuser (below), and server.mjs lets the page load only data:/blob: URLs and the API's storage objects.
ENV PLAYWRIGHT_NO_SANDBOX=1

# Never run Chromium as root: the Playwright image ships the unprivileged pwuser account.
USER pwuser

CMD ["node", "server.mjs"]
