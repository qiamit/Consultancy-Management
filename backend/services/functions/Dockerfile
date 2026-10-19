FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY server.mjs qiAssistant.mjs renewalReminders.mjs ./
ENV NODE_MODE=production
ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "server.mjs"]
