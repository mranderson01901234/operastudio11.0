import { PrismaClient } from "@prisma/client";

// Runtime check to prevent Prisma from being used in browser
if (typeof window !== "undefined") {
  throw new Error(
    "PrismaClient cannot be used in browser environment. " +
    "This module should only be imported in server-side code."
  );
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

