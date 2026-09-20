# Stage 1: Build source code
FROM node:24-alpine AS builder

# Cập nhật và vá ngay các lỗ hổng hệ điều hành của Alpine
RUN apk update && apk upgrade --no-cache

RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm run build
RUN pnpm prune --prod

# Stage 2: Production runner
FROM node:24-alpine AS runner

# Vá lỗ hổng cho stage chạy thực tế
RUN apk update && apk upgrade --no-cache

WORKDIR /app
ENV NODE_ENV=production

# Chuyển sang user node để pass policy "Image runs as the root user"
USER node

COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

EXPOSE 3000
CMD ["node", "dist/main.js"]