# syntax=docker/dockerfile:1
FROM node:22-slim AS build
WORKDIR /repo
COPY package.json package-lock.json* ./
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN npm ci
COPY tsconfig.base.json ./
COPY apps/web apps/web
COPY packages/contracts packages/contracts
RUN npm run build --workspace apps/web

# Ni dolgo živečega strežnika (glej docker-compose.yml) — samo skopira build v /out in
# se izteče. Caddy streže datoteke neposredno iz deljenega volumna.
#
# POMEMBNO: Angular 20-ov builder `@angular/build:application` postavi statične datoteke
# v PODMAPO `browser/` znotraj outputPath (`www/browser/index.html`, ne `www/index.html`),
# ker isti izhod lahko nosi tudi `server/` za SSR. Odkrito pri pravem preverjanju iz
# quickstart.md (T129) — brez tega bi Caddy iskal `index.html`, ki ga na pričakovanem
# mestu ni, in `/` bi bil prazen, vsaka druga pot pa 404.
FROM busybox:stable
COPY --from=build /repo/apps/web/www/browser /src
CMD ["sh", "-c", "cp -r /src/. /out/ && echo 'Web build kopiran v /out'"]
