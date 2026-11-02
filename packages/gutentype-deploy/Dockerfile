# syntax=docker/dockerfile:1.7
#
# Gutentype production image. Build from the repo root:
#   docker build -f packages/gutentype-deploy/Dockerfile --build-arg GIT_SHA=$(git rev-parse --short HEAD) -t gutentype .
#
# Differences from Keybr's removed root Dockerfile, each on purpose:
# - installs with bun from bun.lock (Gutentype never maintains Keybr's package-lock.json);
# - never runs Keybr's devenv initdb, which seeds the login token "xyz" on every start (ISC-70);
# - GIT_SHA is a build arg, because the image has no .git (ISC-1, ISC-3);
# - Dockerfile.dockerignore keeps .env files, .git and local builds out of the build context.

FROM oven/bun:1.3.12 AS bun

FROM node:26 AS build
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /usr/src/app
ENV HUSKY=0
COPY . .
RUN bun install --frozen-lockfile
ARG GIT_SHA=dev
ENV GIT_SHA=${GIT_SHA}
RUN bun run compile && bun run build

FROM node:26
WORKDIR /usr/src/app
COPY --from=build /usr/src/app /usr/src/app
ENV NODE_ENV=production
EXPOSE 3000
# Data and config live on the mounted volume (compose.yaml). initdb creates Keybr's and Gutentype's tables,
# switches sqlite to WAL with a busy timeout, and seeds nothing. It runs under node, not bun, because Keybr's
# sqlite client needs node:sqlite. The server also creates the tables on its first request, so this is belt and braces.
CMD ["sh", "-c", "node --import @keybr/tsl packages/gutentype-server/lib/cli/initdb.ts && node --enable-source-maps ./root/index.js"]
