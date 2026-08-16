FROM node:20-alpine AS builder
WORKDIR /app

# install deps
COPY package.json package-lock.json* ./
COPY tsconfig.json ./
RUN npm ci --production=false

# copy source and build
COPY prisma ./prisma
COPY src ./src
RUN npm run prisma:generate || true
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# copy production deps
COPY package.json package-lock.json* ./
RUN npm ci --production

# copy build artifacts
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY prisma ./prisma

EXPOSE 3000
CMD ["node", "dist/main"]
