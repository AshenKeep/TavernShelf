# ── Stage 1: Build React frontend ─────────────────────────
FROM node:20-alpine AS frontend-build

WORKDIR /build
COPY frontend/package.json .
RUN npm install
COPY frontend/ .
RUN npm run build


# ── Stage 2: Backend ──────────────────────────────────────
FROM node:20-alpine

# sharp still needs native deps for cover thumbnail generation
RUN apk add --no-cache python3 make g++ vips-dev

WORKDIR /app

COPY backend/package.json .
RUN npm install --omit=dev

COPY backend/src/ ./src/
COPY --from=frontend-build /build/dist ./public

RUN mkdir -p /app/covers /app/uploads /app/data

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=5 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["node", "src/index.js"]
