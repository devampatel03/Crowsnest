# Crowsnest Next.js dashboard.
# Build context is packages/dashboard (see infra/docker-compose.yml).
FROM node:25-slim AS build

WORKDIR /app
COPY package.json package-lock.json* pnpm-lock.yaml* ./
RUN npm install

COPY . .
RUN npm run build
# The runtime image only needs production dependencies.
RUN npm prune --omit=dev

FROM node:25-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
# Pick up Debian security fixes published after the base image was built, and drop npm: the server
# starts with `next start` directly, so the package manager (and its bundled dependencies) is not needed.
RUN apt-get update \
  && apt-get upgrade -y --no-install-recommends \
  && rm -rf /var/lib/apt/lists/* /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
COPY --from=build --chown=node:node /app ./
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node_modules/.bin/next", "start"]
