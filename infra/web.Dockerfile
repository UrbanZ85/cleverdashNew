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
FROM busybox:stable
COPY --from=build /repo/apps/web/www /src
CMD ["sh", "-c", "cp -r /src/. /out/ && echo 'Web build kopiran v /out'"]
