import { PrismaClient } from '@prisma/client';

// Singleton pattern: reuse the same PrismaClient instance across the app.
// In development with ts-node-dev, hot-reloads would otherwise create multiple
// connections and exhaust the connection pool.
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
