import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

// Incluimos 'log' para cumplir con los requisitos del constructor de la v7.8.0
export const prisma = globalForPrisma.prisma || new PrismaClient({
  log: ['warn', 'error'],
});

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;