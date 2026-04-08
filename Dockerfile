# ── Stage 1: Build React frontend ─────────────────────────
FROM node:20-alpine AS frontend-build

WORKDIR /build

COPY frontend/package.json .
RUN npm install

COPY frontend/ .

# API_URL is always /api since the backend serves everything
RUN VITE_API_URL=/api npm run build


# ── Stage 2: Backend + serve built frontend ────────────────
FROM node:20-alpine

# Native deps for sharp (cover generation) and better-sqlite3
RUN apk add --no-cache python3 make g++ vips-dev

WORKDIR /app

COPY backend/package.json .
RUN npm install --omit=dev

COPY backend/src/ ./src/

# Pull in the built frontend from stage 1
COPY --from=frontend-build /build/dist ./public

RUN mkdir -p /app/covers /app/uploads /app/data

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=5 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["node", "src/index.js"]
