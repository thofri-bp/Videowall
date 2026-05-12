FROM node:20-bookworm-slim AS build

WORKDIR /app
ENV npm_config_python=/usr/bin/python3

# Build toolchain for npm packages that may fall back to native builds.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    build-essential \
    g++ \
    make \
    poppler-utils \
    python3 \
    python3-dev \
    python3-distutils \
    python3-setuptools \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

FROM node:20-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    poppler-utils \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY public ./public
COPY server.js ./server.js
COPY data ./data

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000
VOLUME ["/app/data"]

CMD ["node", "server.js"]
