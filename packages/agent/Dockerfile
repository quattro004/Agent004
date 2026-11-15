# Max Height agent container for AgentCore Runtime (spec 003 T023, deviation C1).
#
# Build from the repository root, because the pnpm workspace lockfile lives
# there:
#   docker buildx build --platform linux/arm64 -f packages/agent/Dockerfile .
# The build context is filtered by packages/agent/Dockerfile.dockerignore.
#
# Always build with --platform linux/arm64: AgentCore Runtime requires an ARM64
# container that listens on 8080 and serves /ping and /invocations
# (contracts/runtime-config.md § Runtime resource settings).
#
# Dependencies come from a filtered `pnpm install --frozen-lockfile`, not
# `pnpm deploy`: pnpm 11 deploys only injected workspaces, and `deploy --legacy`
# resolves without the lockfile.

FROM node:24-alpine AS base
RUN corepack enable && corepack prepare pnpm@11.24.0 --activate
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc .pnpmfile.cjs ./
COPY packages/agent/package.json packages/agent/

FROM base AS build
RUN pnpm install --frozen-lockfile --filter @max-height/agent
COPY packages/agent/tsconfig.json packages/agent/
COPY packages/agent/src packages/agent/src
RUN pnpm --filter @max-height/agent run build

FROM base AS prod-deps
RUN pnpm install --frozen-lockfile --prod --filter @max-height/agent

FROM node:24-alpine

ENV NODE_ENV=production

RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup

WORKDIR /repo
COPY --from=prod-deps /repo/node_modules ./node_modules
COPY --from=prod-deps /repo/packages/agent/node_modules ./packages/agent/node_modules
COPY --from=build /repo/packages/agent/dist ./packages/agent/dist
COPY packages/agent/package.json ./packages/agent/

WORKDIR /repo/packages/agent
USER appuser

EXPOSE 8080

# The listener starts only after initialize() has loaded configuration and
# warmed Bedrock; until then /ping is unreachable (or 503), and a failed
# initialize() exits the process.
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:8080/ping || exit 1

CMD ["node", "dist/index.js"]
