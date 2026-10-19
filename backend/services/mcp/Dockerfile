FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.mjs ./
COPY lib ./lib
ENV NODE_ENV=production
EXPOSE 8090
CMD ["node", "server.mjs"]
