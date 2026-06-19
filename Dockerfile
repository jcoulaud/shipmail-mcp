FROM oven/bun:1.3.10-slim AS deps

WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --ignore-scripts

FROM deps AS build

COPY tsconfig.json tsup.config.ts ./
COPY src ./src
RUN bun run build

FROM oven/bun:1.3.10-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production --ignore-scripts
COPY --from=build /app/dist ./dist

USER bun
# Registry scanners need the server to start so they can introspect tools.
# Real API calls still require overriding this with a valid Shipmail API key.
ENTRYPOINT ["sh", "-c", "export SHIPMAIL_API_KEY=\"${SHIPMAIL_API_KEY:-sm_glama_introspection_only}\"; exec bun dist/index.js \"$@\"", "--"]
