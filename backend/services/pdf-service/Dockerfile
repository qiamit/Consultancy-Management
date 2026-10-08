FROM mcr.microsoft.com/playwright:v1.62.1-noble

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.mjs ./

ENV NODE_ENV=production
ENV PDF_SERVICE_HOST=0.0.0.0
ENV PLAYWRIGHT_NO_SANDBOX=1

CMD ["node", "server.mjs"]
