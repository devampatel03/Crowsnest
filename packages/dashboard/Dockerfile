# Crowsnest Next.js dashboard.
# Build context is the repository root (see infra/docker-compose.yml), so the build uses the same pnpm-lock.yaml as CI
# and installs exactly the versions that were tested.
FROM node:26-slim AS build

WORKDIR /app

# pnpm at the version the repository pins in package.json ("packageManager"). Node 25 and newer no longer ship corepack.
RUN npm install --global pnpm@9.0.0

# Dependency files first, so this layer is reused until a dependency changes. Only the dashboard's dependencies are
# installed, and --frozen-lockfile makes the build fail rather than pick a version that was not tested.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/dashboard/package.json packages/dashboard/
RUN pnpm install --frozen-lockfile --filter @crowsnest/dashboard...

COPY packages/dashboard packages/dashboard
WORKDIR /app/packages/dashboard
RUN pnpm run build
# The runtime image only needs production dependencies. `pnpm prune` leaves the workspace's shared store alone, so the
# dev tools (test runner, linter, TypeScript) stayed in the image; reinstalling with --prod from the same lockfile drops them.
WORKDIR /app
RUN rm -rf node_modules packages/dashboard/node_modules \
  && pnpm install --frozen-lockfile --prod --filter @crowsnest/dashboard...
WORKDIR /app/packages/dashboard

FROM node:26-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
# Pick up Debian security fixes published after the base image was built, and drop npm: the server
# starts with `next start` directly, so the package manager (and its bundled dependencies) is not needed.
RUN apt-get update \
  && apt-get upgrade -y --no-install-recommends \
  && rm -rf /var/lib/apt/lists/* /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
COPY --from=build --chown=node:node /app ./
WORKDIR /app/packages/dashboard
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node_modules/.bin/next", "start"]
