# syntax=docker/dockerfile:1
FROM node:22-slim AS build
WORKDIR /repo
COPY package.json package-lock.json* ./
COPY apps/api/package.json apps/api/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN npm ci
COPY tsconfig.base.json ./
COPY apps/api apps/api
COPY packages/contracts packages/contracts
RUN npm run build --workspace apps/api

FROM node:22-slim
ENV NODE_ENV=production
# Sistemski Chromium namesto Puppeteerjevega prenosa (docs/env-reference.md, PUPPETEER_SKIP_DOWNLOAD) —
# uporablja ga 002; tukaj je nameščen zdaj, da postavitvenega sloja ni treba prezidati.
RUN apt-get update \
  && apt-get install -y --no-install-recommends chromium tzdata fonts-liberation ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
WORKDIR /app
COPY --from=build /repo/apps/api/dist ./dist
COPY --from=build /repo/apps/api/package.json ./package.json
COPY --from=build /repo/node_modules ./node_modules
# Chromiumov peskovnik (BROWSER_NO_SANDBOX=false, privzeto — docs/env-reference.md) zahteva
# uporabniške imenske prostore, kar Chromium izrecno zavrne, če teče kot root (T121:
# "Running as root without --no-sandbox is not supported"). Tek kot lasten neprivilegiran
# uporabnik omogoča privzeto varnejšo nastavitev (peskovnik VKLOPLJEN), namesto da bi bil
# BROWSER_NO_SANDBOX=true prisiljen privzetek za vsako postavitev.
RUN groupadd --gid 1001 cleverdash \
  && useradd --uid 1001 --gid cleverdash --home /app --no-create-home cleverdash \
  && mkdir -p /app/data/screenshots \
  && chown -R cleverdash:cleverdash /app
USER cleverdash
EXPOSE 3000
CMD ["node", "dist/main.js"]
