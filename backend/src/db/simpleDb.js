const { PrismaClient } = require('@prisma/client');

// Use process.stdout for early initialization logging (before logger is available)
const logInit = (msg) => process.stdout.write(`[DB] ${msg}\n`);
const logError = (msg) => process.stderr.write(`[DB] ${msg}\n`);

let prisma = null;
let initializationError = null;
let initAttempts = 0;
const MAX_INIT_ATTEMPTS = 3;

logInit('Initializing Prisma client...');
logInit(`DATABASE_URL exists: ${!!process.env.DATABASE_URL}`);
logInit(`DATABASE_URL prefix: ${process.env.DATABASE_URL ? process.env.DATABASE_URL.substring(0, 20) + '...' : 'not set'}`);

/**
 * Initialize Prisma with retry logic
 */
function initializePrisma() {
  initAttempts++;

  try {
    prisma = new PrismaClient({
      log: process.env.NODE_ENV === 'production' ? ['warn', 'error'] : ['query', 'info', 'warn', 'error']
    });
    logInit(`Prisma client created successfully (attempt ${initAttempts})`);
    initializationError = null;
    return true;
  } catch (err) {
    initializationError = err;
    logError(`Failed to initialize Prisma client (attempt ${initAttempts}/${MAX_INIT_ATTEMPTS}): ${err.message}`);

    if (initAttempts < MAX_INIT_ATTEMPTS) {
      logInit(`Retrying Prisma initialization in 2 seconds...`);
      // For sync initialization, just return false and let caller retry
      return false;
    }

    logError(`Prisma initialization failed after ${MAX_INIT_ATTEMPTS} attempts`);
    return false;
  }
}

// Initial attempt
if (!initializePrisma()) {
  // If first attempt fails, try again synchronously
  setTimeout(() => {
    if (!prisma && initAttempts < MAX_INIT_ATTEMPTS) {
      initializePrisma();
    }
  }, 2000);
}

/**
 * Get Prisma client with lazy initialization fallback
 */
function getPrisma() {
  if (prisma) return prisma;

  // Try to initialize if not already done
  if (initAttempts < MAX_INIT_ATTEMPTS) {
    initializePrisma();
  }

  if (!prisma) {
    throw new Error(`Prisma not available: ${initializationError?.message || 'Unknown error'}`);
  }

  return prisma;
}

// Export prisma getter that ensures initialization
module.exports = {
  get prisma() {
    return getPrisma();
  },
  PrismaClient,
  getPrisma,
  isInitialized: () => prisma !== null,
  getInitError: () => initializationError
};
