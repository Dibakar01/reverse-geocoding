# Stage 1 builds the GeoNames extract so curl/unzip never reach the final image.
FROM node:22-alpine AS data
RUN apk add --no-cache curl unzip
WORKDIR /app
COPY package.json ./
COPY scripts/ ./scripts/
RUN sh scripts/build-data.sh

FROM node:22-alpine
WORKDIR /app
COPY package.json core.js geocode.js server.js ./
COPY --from=data /app/data ./data
ENV PORT=3000 CACHE_FILE=/tmp/cache.json
EXPOSE 3000
# Shell form, so ${PORT} expands at runtime rather than baking in 3000.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s \
  CMD wget -qO- "http://127.0.0.1:${PORT}/health" || exit 1
USER node
CMD ["node", "server.js"]
