# Stage 1: Build web frontend
FROM node:24-slim AS web-builder
WORKDIR /app/web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# Stage 2: Build server backend
FROM node:24-slim AS server-builder
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci
COPY server/ ./
RUN npm run build

# Stage 3: Production runtime
FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

COPY server/package*.json ./server/
RUN npm --prefix server ci --omit=dev

COPY --from=server-builder /app/server/dist ./server/dist
COPY --from=web-builder /app/web/dist ./web/dist
COPY rules ./rules

EXPOSE 8080
CMD ["node", "server/dist/index.js"]
