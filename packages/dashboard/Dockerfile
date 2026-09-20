# Crowsnest Next.js dashboard.
# Build context is packages/dashboard (see infra/docker-compose.yml).
FROM node:20-slim AS build

WORKDIR /app
COPY package.json package-lock.json* pnpm-lock.yaml* ./
RUN npm install

COPY . .
RUN npm run build

FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app ./

EXPOSE 3000
CMD ["npm", "run", "start"]
