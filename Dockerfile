FROM node:20-alpine AS base
WORKDIR /app

# openssl is required by Prisma's query engine on Alpine (OpenSSL 3.x)
RUN apk add --no-cache openssl

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Generate Prisma client
RUN npx prisma generate

# ─── Development stage ───────────────────────────────────────────────────────
FROM base AS development
ENV NODE_ENV=development
EXPOSE 3000
CMD ["npm", "run", "dev"]

# ─── Build stage ─────────────────────────────────────────────────────────────
FROM base AS builder
RUN npm run build

# ─── Production stage ────────────────────────────────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production

# openssl is required by Prisma's query engine on Alpine (OpenSSL 3.x)
RUN apk add --no-cache openssl

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY prisma ./prisma

EXPOSE 3000
CMD ["npm", "run", "start:prod"]
