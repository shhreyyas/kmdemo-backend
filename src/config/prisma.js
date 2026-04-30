const { PrismaClient } = require("@prisma/client");

const globalForPrisma = globalThis;
const prisma =
  globalForPrisma.__kmPrismaClient ||
  new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__kmPrismaClient = prisma;
}

module.exports = prisma;