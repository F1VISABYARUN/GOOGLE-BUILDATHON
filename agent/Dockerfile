FROM mcr.microsoft.com/playwright:v1.52.0-noble
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

EXPOSE 8080
CMD ["node", "dist/index.js"]
