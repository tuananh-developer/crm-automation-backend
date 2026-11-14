# Stage 1: Build source code and install production dependencies.
FROM node:24-alpine AS builder

RUN apk update && apk upgrade --no-cache
RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm run build
RUN pnpm prune --prod --ignore-scripts

# Stage 2: Non-root production runtime.
FROM node:24-alpine AS runner

RUN apk update && apk upgrade --no-cache

WORKDIR /app
ENV NODE_ENV=production

USER node

COPY --chown=node:node --from=builder /app/package.json ./package.json
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/dist ./dist
COPY --chown=node:node --from=builder /app/deploy/run-migrations.cjs ./deploy/run-migrations.cjs

EXPOSE 3000
CMD ["node", "dist/main.js"]
