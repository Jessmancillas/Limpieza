# Imagen de producción. Incluye poppler-utils (pdftoppm/pdfinfo) para convertir anexos
# al formato que exige VUCEM.
FROM node:22-bookworm-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends poppler-utils ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci

FROM deps AS build
COPY . .
RUN npx prisma generate && npm run build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app ./
# La base SQLite y los archivos viven en un volumen persistente.
ENV DATABASE_URL="file:/data/permisos.db" STORAGE_DIR="/data/storage"
VOLUME ["/data"]
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && npx prisma db seed && npx next start -p 3000"]
