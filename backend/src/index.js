require('dotenv').config();

const express = require('express');
const http = require('http');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');
const WebSocketService = require('./services/websocket');

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const portfolioRoutes = require('./routes/portfolios');
const holdingRoutes = require('./routes/holdings');
const transactionRoutes = require('./routes/transactions');
const watchlistRoutes = require('./routes/watchlists');
const watchlistSimpleRoutes = require('./routes/watchlist'); // Simplified watchlist API
const alertRoutes = require('./routes/alerts');
const marketRoutes = require('./routes/market');
const analyticsRoutes = require('./routes/analytics');
const dividendRoutes = require('./routes/dividends');

// Investment selector routes with error handling
let investmentSelectorRoutes;
try {
  investmentSelectorRoutes = require('./routes/investmentSelector');
  console.log('[INDEX] Investment selector routes loaded successfully');
} catch (error) {
  console.error('[INDEX] Failed to load investment selector routes:', error.message);
  const expressRouter = require('express').Router;
  investmentSelectorRoutes = expressRouter();
  investmentSelectorRoutes.all('*', (req, res) => {
    res.status(500).json({ success: false, error: 'Investment selector routes failed to load' });
  });
}

// Sector rotation routes with error handling
let sectorRotationRoutes;
try {
  sectorRotationRoutes = require('./routes/sectorRotation');
  console.log('[INDEX] Sector rotation routes loaded successfully');
} catch (error) {
  console.error('[INDEX] Failed to load sector rotation routes:', error.message);
  const expressRouter = require('express').Router;
  sectorRotationRoutes = expressRouter();
  sectorRotationRoutes.all('*', (req, res) => {
    res.status(500).json({ success: false, error: 'Sector rotation routes failed to load' });
  });
}

// Sector heatmap routes with error handling
let sectorHeatmapRoutes;
try {
  sectorHeatmapRoutes = require('./routes/sectorHeatmap');
  console.log('[INDEX] Sector heatmap routes loaded successfully');
} catch (error) {
  console.error('[INDEX] Failed to load sector heatmap routes:', error.message);
  const expressRouter = require('express').Router;
  sectorHeatmapRoutes = expressRouter();
  sectorHeatmapRoutes.all('*', (req, res) => {
    res.status(500).json({ success: false, error: 'Sector heatmap routes failed to load' });
  });
}

// ETF analyzer routes with error handling
let etfAnalyzerRoutes;
try {
  etfAnalyzerRoutes = require('./routes/etfAnalyzer');
  console.log('[INDEX] ETF analyzer routes loaded successfully');
} catch (error) {
  console.error('[INDEX] Failed to load ETF analyzer routes:', error.message);
  const expressRouter = require('express').Router;
  etfAnalyzerRoutes = expressRouter();
  etfAnalyzerRoutes.all('*', (req, res) => {
    res.status(500).json({ success: false, error: 'ETF analyzer routes failed to load' });
  });
}

// Economic calendar routes with error handling
let economicCalendarRoutes;
try {
  economicCalendarRoutes = require('./routes/economicCalendar');
  console.log('[INDEX] Economic calendar routes loaded successfully');
} catch (error) {
  console.error('[INDEX] Failed to load economic calendar routes:', error.message);
  const expressRouter = require('express').Router;
  economicCalendarRoutes = expressRouter();
  economicCalendarRoutes.all('*', (req, res) => {
    res.status(500).json({ success: false, error: 'Economic calendar routes failed to load' });
  });
}

// Sentiment routes with error handling
let sentimentRoutes;
try {
  sentimentRoutes = require('./routes/sentiment');
  console.log('[INDEX] Sentiment routes loaded successfully');
} catch (error) {
  console.error('[INDEX] Failed to load sentiment routes:', error.message);
  const expressRouter = require('express').Router;
  sentimentRoutes = expressRouter();
  sentimentRoutes.all('*', (req, res) => {
    res.status(500).json({ success: false, error: 'Sentiment routes failed to load' });
  });
}

// Market breadth routes with error handling
let marketBreadthRoutes;
try {
  marketBreadthRoutes = require('./routes/marketBreadth');
  console.log('[INDEX] Market breadth routes loaded successfully');
} catch (error) {
  console.error('[INDEX] Failed to load market breadth routes:', error.message);
  const expressRouter = require('express').Router;
  marketBreadthRoutes = expressRouter();
  marketBreadthRoutes.all('*', (req, res) => {
    res.status(500).json({ success: false, error: 'Market breadth routes failed to load' });
  });
}

// Portfolio upload routes with error handling
let portfolioUploadRoutes;
try {
  portfolioUploadRoutes = require('./routes/portfolioUpload');
  console.log('[INDEX] Portfolio upload routes loaded successfully');
} catch (error) {
  console.error('[INDEX] Failed to load portfolio upload routes:', error.message);
  console.error('[INDEX] Stack:', error.stack);
  // Create fallback router
  const expressRouter = require('express').Router;
  portfolioUploadRoutes = expressRouter();
  portfolioUploadRoutes.all('*', (req, res) => {
    res.status(500).json({
      success: false,
      error: 'Portfolio upload routes failed to load',
      loadError: error.message
    });
  });
}

// Import services
const MarketDataService = require('./services/marketData');
const SnapshotService = require('./services/snapshot');
const logger = require('./utils/logger');

// Initialize
const app = express();
const { prisma } = require('./db/simpleDb');
const PORT = process.env.PORT || 4000;

// Trust proxy (required for rate limiting behind reverse proxy)
app.set('trust proxy', 1);

// Middleware - Allow multiple origins for CORS
const allowedOrigins = [
  'http://localhost:3000',
  process.env.FRONTEND_URL
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      callback(null, true);
    } else {
      callback(null, true); // Be permissive for now
    }
  },
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs
  message: { error: 'Too many requests, please try again later.' }
});
app.use('/api', limiter);

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('user-agent'),
    auth: req.headers.authorization ? 'Bearer ...' + req.headers.authorization.slice(-10) : 'none'
  });
  // Log POST requests body for debugging
  if (req.method === 'POST' && req.path.includes('portfolio')) {
    logger.info(`[DEBUG] POST to ${req.path} body:`, JSON.stringify(req.body));
  }
  next();
});

// Health check - must work even before DB connection
let dbConnected = false;
const BUILD_VERSION = 'v32.0.0-portfolio-fix';
const BUILD_TIME = new Date().toISOString(); // Captured at server start
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    version: BUILD_VERSION,
    buildTime: BUILD_TIME,
    timestamp: new Date().toISOString(),
    database: dbConnected ? 'connected' : 'connecting',
    portfolioUploadLoaded: !!portfolioUploadRoutes,
    dbType: process.env.DATABASE_TYPE || 'auto'
  });
});

// Debug endpoint to check portfolio routes
app.get('/debug/routes', (req, res) => {
  const portfolioStack = portfolioRoutes.stack || [];
  const routes = portfolioStack
    .filter(layer => layer.route)
    .map(layer => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods).filter(m => layer.route.methods[m])
    }));
  res.json({
    portfolioRoutesLoaded: !!portfolioRoutes,
    portfolioRoutesCount: routes.length,
    routes
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/portfolios', portfolioRoutes);
app.use('/api/holdings', holdingRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/watchlists', watchlistRoutes);
app.use('/api/watchlist', watchlistSimpleRoutes); // Simplified watchlist API (singular)
app.use('/api/alerts', alertRoutes);
app.use('/api/market', marketRoutes);
app.use('/api/market-breadth', marketBreadthRoutes); // Market breadth indicators
app.use('/api/analytics', analyticsRoutes);
app.use('/api/dividends', dividendRoutes);
app.use('/api/investment-selector', investmentSelectorRoutes); // Investment selector tool
app.use('/api/portfolio-upload', portfolioUploadRoutes); // Portfolio file upload
app.use('/api/sector-rotation', sectorRotationRoutes); // Sector rotation analysis
app.use('/api/sector-heatmap', sectorHeatmapRoutes); // Sector heatmap
app.use('/api/etf-analyzer', etfAnalyzerRoutes); // ETF analyzer
app.use('/api/economic-calendar', economicCalendarRoutes); // Economic calendar
app.use('/api/sentiment', sentimentRoutes); // Sentiment analysis

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);

  if (err.name === 'ValidationError') {
    return res.status(400).json({ error: err.message });
  }

  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({ error: 'Invalid token' });
  }

  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON in request body' });
  }

  res.status(500).json({
    error: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message
  });
});

// 404 handler
app.use((req, res) => {
  logger.warn(`[404] Route not found: ${req.method} ${req.path}`);
  res.status(404).json({
    error: 'Not found',
    path: req.path,
    method: req.method,
    hint: 'This endpoint does not exist. Check available routes at /debug/routes'
  });
});

// Scheduled jobs
// Update stock quotes every 5 minutes during market hours
cron.schedule('*/5 9-16 * * 1-5', async () => {
  logger.info('Running scheduled quote update');
  try {
    await MarketDataService.updateAllQuotes();
  } catch (err) {
    logger.error('Quote update failed:', err);
  }
}, {
  timezone: 'America/New_York'
});

// Take daily portfolio snapshots at 4:30 PM ET
cron.schedule('30 16 * * 1-5', async () => {
  logger.info('Running daily portfolio snapshots');
  try {
    await SnapshotService.takeAllSnapshots();
  } catch (err) {
    logger.error('Snapshot failed:', err);
  }
}, {
  timezone: 'America/New_York'
});

// Start server
async function main() {
  // Create HTTP server for WebSocket support
  const server = http.createServer(app);

  // Initialize WebSocket service
  let wsService = null;
  try {
    wsService = new WebSocketService(server);
    logger.info('✅ WebSocket service initialized on /ws');
  } catch (err) {
    logger.error('Failed to initialize WebSocket:', err.message);
  }

  // Start listening FIRST so health check works during DB connection
  server.listen(PORT, '0.0.0.0', () => {
    logger.info(`Server listening on 0.0.0.0:${PORT}`);
    logger.info(`Health endpoint: http://0.0.0.0:${PORT}/health`);
    logger.info(`WebSocket endpoint: ws://0.0.0.0:${PORT}/ws`);
    logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  });

  // Then connect to database
  try {
    logger.info('Connecting to database...');
    await prisma.$connect();
    dbConnected = true;
    logger.info('Database connected successfully');
  } catch (err) {
    logger.error('Failed to connect to database:', { error: err.message });
    // Don't exit - let the server keep running for health checks
    // API routes will fail gracefully
  }

  // Store references for graceful shutdown
  global.server = server;
  global.wsService = wsService;
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  await prisma.$disconnect();
  process.exit(0);
});

main();

module.exports = app;
