FROM node:22.23-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.mjs ./
COPY lib ./lib
ENV NODE_ENV=production
EXPOSE 8090
USER node
CMD ["node", "server.mjs"]
