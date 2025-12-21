const { PrismaClient } = require('@prisma/client');

// Use process.stdout for early initialization logging (before logger is available)
const logInit = (msg) => process.stdout.write(`[DB] ${msg}\n`);

let prisma;

logInit('Initializing Prisma client...');
logInit(`DATABASE_URL exists: ${!!process.env.DATABASE_URL}`);
logInit(`DATABASE_URL prefix: ${process.env.DATABASE_URL ? process.env.DATABASE_URL.substring(0, 20) + '...' : 'not set'}`);

try {
  prisma = new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['warn', 'error'] : ['query', 'info', 'warn', 'error']
  });
  logInit('Prisma client created successfully');
} catch (err) {
  process.stderr.write(`[DB] Failed to initialize Prisma client: ${err.message}\n`);
  throw new Error(`Prisma client initialization failed: ${err.message}`);
}

module.exports = {
  prisma,
  PrismaClient
};
