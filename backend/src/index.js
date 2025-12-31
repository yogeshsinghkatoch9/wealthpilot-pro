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
const calendarRoutes = require('./routes/calendar');
const technicalRoutes = require('./routes/technicals');
const fundamentalsRoutes = require('./routes/fundamentals');
const researchRoutes = require('./routes/research');
const tradingRoutes = require('./routes/trading');
const reportsRoutes = require('./routes/reports');
const settingsRoutes = require('./routes/settings');
const insightsRoutes = require('./routes/insights');
const dashboardRoutes = require('./routes/dashboard');
const simpleDashboardRoutes = require('./routes/simpleDashboard');
const exportsRoutes = require('./routes/exports');
const sharingRoutes = require('./routes/sharing');
const clientsRoutes = require('./routes/clients');
const monitoringRoutes = require('./routes/monitoring');
const notificationsRoutes = require('./routes/notifications');
const optionsRoutes = require('./routes/options');
const riskAnalysisRoutes = require('./routes/riskAnalysis');
const advancedAnalyticsRoutes = require('./routes/advancedAnalytics');
const marginsRoutes = require('./routes/margins');
const dividendAnalysisRoutes = require('./routes/dividendAnalysis');
const sectorsRoutes = require('./routes/sectors');
const sectorAnalysisRoutes = require('./routes/sectorAnalysis');
const portfolioToolsRoutes = require('./routes/portfolioTools');
const helpRoutes = require('./routes/help');
const twoFactorRoutes = require('./routes/twoFactor');
const extendedRoutes = require('./routes/extended');
const stockSearchRoutes = require('./routes/stockSearch');

// Broker integration routes with error handling
let brokerRoutes;
try {
  brokerRoutes = require('./routes/brokers');
  console.log('[INDEX] Broker routes loaded successfully');
} catch (error) {
  console.error('[INDEX] Failed to load broker routes:', error.message);
  const expressRouter = require('express').Router;
  brokerRoutes = expressRouter();
  brokerRoutes.all('*', (req, res) => {
    res.status(500).json({ success: false, error: 'Broker routes failed to load' });
  });
}

// ESG analysis routes with error handling
let esgRoutes;
try {
  esgRoutes = require('./routes/esg');
  console.log('[INDEX] ESG routes loaded successfully');
} catch (error) {
  console.error('[INDEX] Failed to load ESG routes:', error.message);
  const expressRouter = require('express').Router;
  esgRoutes = expressRouter();
  esgRoutes.all('*', (req, res) => {
    res.status(500).json({ success: false, error: 'ESG routes failed to load' });
  });
}

// Security management routes with error handling
let securityRoutes;
try {
  securityRoutes = require('./routes/security');
  console.log('[INDEX] Security routes loaded successfully');
} catch (error) {
  console.error('[INDEX] Failed to load security routes:', error.message);
  const expressRouter = require('express').Router;
  securityRoutes = expressRouter();
  securityRoutes.all('*', (req, res) => {
    res.status(500).json({ success: false, error: 'Security routes failed to load' });
  });
}

// Database management routes with error handling
let databaseRoutes;
try {
  databaseRoutes = require('./routes/database');
  console.log('[INDEX] Database routes loaded successfully');
} catch (error) {
  console.error('[INDEX] Failed to load database routes:', error.message);
  const expressRouter = require('express').Router;
  databaseRoutes = expressRouter();
  databaseRoutes.all('*', (req, res) => {
    res.status(500).json({ success: false, error: 'Database routes failed to load' });
  });
}

// OAuth routes for broker authentication
let oauthRoutes;
try {
  oauthRoutes = require('./routes/oauth');
  console.log('[INDEX] OAuth routes loaded successfully');
} catch (error) {
  console.error('[INDEX] Failed to load OAuth routes:', error.message);
  const expressRouter = require('express').Router;
  oauthRoutes = expressRouter();
  oauthRoutes.all('*', (req, res) => {
    res.status(500).json({ success: false, error: 'OAuth routes failed to load' });
  });
}

// Secrets management routes (admin only)
let secretsRoutes;
try {
  secretsRoutes = require('./routes/secrets');
  console.log('[INDEX] Secrets routes loaded successfully');
} catch (error) {
  console.error('[INDEX] Failed to load secrets routes:', error.message);
  const expressRouter = require('express').Router;
  secretsRoutes = expressRouter();
  secretsRoutes.all('*', (req, res) => {
    res.status(500).json({ success: false, error: 'Secrets routes failed to load' });
  });
}

// DDoS protection middleware
let ddosProtection;
try {
  ddosProtection = require('./middleware/ddosProtection');
  console.log('[INDEX] DDoS protection loaded successfully');
} catch (error) {
  console.error('[INDEX] Failed to load DDoS protection:', error.message);
  ddosProtection = null;
}

// Features routes (paper trading, goals, journal, etc.) with error handling
let featuresRoutes;
try {
  featuresRoutes = require('./routes/features');
  console.log('[INDEX] Features routes loaded successfully');
} catch (error) {
  console.error('[INDEX] Failed to load features routes:', error.message);
  const expressRouter = require('express').Router;
  featuresRoutes = expressRouter();
  featuresRoutes.all('*', (req, res) => {
    res.status(500).json({ success: false, error: 'Features routes failed to load' });
  });
}

// AI routes with error handling
let aiChatRoutes;
try {
  aiChatRoutes = require('./routes/aiChat');
  console.log('[INDEX] AI Chat routes loaded successfully');
} catch (error) {
  console.error('[INDEX] Failed to load AI Chat routes:', error.message);
  const expressRouter = require('express').Router;
  aiChatRoutes = expressRouter();
  aiChatRoutes.all('*', (req, res) => {
    res.status(500).json({ success: false, error: 'AI Chat routes failed to load' });
  });
}

let aiReportsRoutes;
try {
  aiReportsRoutes = require('./routes/aiReports');
  console.log('[INDEX] AI Reports routes loaded successfully');
} catch (error) {
  console.error('[INDEX] Failed to load AI Reports routes:', error.message);
  const expressRouter = require('express').Router;
  aiReportsRoutes = expressRouter();
  aiReportsRoutes.all('*', (req, res) => {
    res.status(500).json({ success: false, error: 'AI Reports routes failed to load' });
  });
}

// Earnings calendar routes with error handling
let earningsCalendarRoutes;
try {
  earningsCalendarRoutes = require('./routes/earningsCalendar');
  console.log('[INDEX] Earnings calendar routes loaded successfully');
} catch (error) {
  console.error('[INDEX] Failed to load earnings calendar routes:', error.message);
  const expressRouter = require('express').Router;
  earningsCalendarRoutes = expressRouter();
  earningsCalendarRoutes.all('*', (req, res) => {
    res.status(500).json({ success: false, error: 'Earnings calendar routes failed to load' });
  });
}

// Dividend calendar routes with error handling
let dividendCalendarRoutes;
try {
  dividendCalendarRoutes = require('./routes/dividendCalendar');
  console.log('[INDEX] Dividend calendar routes loaded successfully');
} catch (error) {
  console.error('[INDEX] Failed to load dividend calendar routes:', error.message);
  const expressRouter = require('express').Router;
  dividendCalendarRoutes = expressRouter();
  dividendCalendarRoutes.all('*', (req, res) => {
    res.status(500).json({ success: false, error: 'Dividend calendar routes failed to load' });
  });
}

// IPO calendar routes with error handling
let ipoCalendarRoutes;
try {
  ipoCalendarRoutes = require('./routes/ipoCalendar');
  console.log('[INDEX] IPO calendar routes loaded successfully');
} catch (error) {
  console.error('[INDEX] Failed to load IPO calendar routes:', error.message);
  const expressRouter = require('express').Router;
  ipoCalendarRoutes = expressRouter();
  ipoCalendarRoutes.all('*', (req, res) => {
    res.status(500).json({ success: false, error: 'IPO calendar routes failed to load' });
  });
}

// SPAC tracker routes with error handling
let spacTrackerRoutes;
try {
  spacTrackerRoutes = require('./routes/spacTracker');
  console.log('[INDEX] SPAC tracker routes loaded successfully');
} catch (error) {
  console.error('[INDEX] Failed to load SPAC tracker routes:', error.message);
  const expressRouter = require('express').Router;
  spacTrackerRoutes = expressRouter();
  spacTrackerRoutes.all('*', (req, res) => {
    res.status(500).json({ success: false, error: 'SPAC tracker routes failed to load' });
  });
}

// Tax harvesting routes with error handling
let taxHarvestingRoutes;
try {
  taxHarvestingRoutes = require('./routes/taxHarvesting');
  console.log('[INDEX] Tax harvesting routes loaded successfully');
} catch (error) {
  console.error('[INDEX] Failed to load tax harvesting routes:', error.message);
  const expressRouter = require('express').Router;
  taxHarvestingRoutes = expressRouter();
  taxHarvestingRoutes.all('*', (req, res) => {
    res.status(500).json({ success: false, error: 'Tax harvesting routes failed to load' });
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

// Scanner routes with error handling
let scannerRoutes;
try {
  scannerRoutes = require('./routes/scanner');
  console.log('[INDEX] Scanner routes loaded successfully');
} catch (error) {
  console.error('[INDEX] Failed to load scanner routes:', error.message);
  const expressRouter = require('express').Router;
  scannerRoutes = expressRouter();
  scannerRoutes.all('*', (req, res) => {
    res.status(500).json({ success: false, error: 'Scanner routes failed to load' });
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

// DDoS protection - apply first
if (ddosProtection) {
  app.use(ddosProtection.ddosProtection);
  app.use(ddosProtection.requestSizeLimiter);
  app.use(ddosProtection.slowlorisProtection);
  logger.info('DDoS protection middleware active');
}

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
    } else if (process.env.NODE_ENV !== 'production') {
      // In development, allow but warn
      logger.warn(`CORS: Allowing unrecognized origin in development: ${origin}`);
      callback(null, true);
    } else {
      // In production, reject unknown origins
      logger.warn(`CORS: Blocking request from unauthorized origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
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
    userAgent: req.get('user-agent')
  });
  next();
});

// Health check - must work even before DB connection
let dbConnected = false;
const BUILD_VERSION = 'v31.0.0-live-market-data';
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

// Database readiness middleware - protect API routes from being called before DB is ready
app.use('/api', (req, res, next) => {
  if (!dbConnected) {
    logger.warn(`API request blocked - database not ready: ${req.method} ${req.path}`);
    return res.status(503).json({
      error: 'Service temporarily unavailable',
      message: 'Database is still connecting. Please try again in a few seconds.',
      retryAfter: 5
    });
  }
  next();
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
app.use('/api/calendar', calendarRoutes); // Calendar events (dividends, earnings)
app.use('/api/portfolio-upload', portfolioUploadRoutes); // Portfolio file upload
app.use('/api/sector-rotation', sectorRotationRoutes); // Sector rotation analysis
app.use('/api/sector-heatmap', sectorHeatmapRoutes); // Sector heatmap
app.use('/api/etf-analyzer', etfAnalyzerRoutes); // ETF analyzer
app.use('/api/economic-calendar', economicCalendarRoutes); // Economic calendar
app.use('/api/sentiment', sentimentRoutes); // Sentiment analysis
app.use('/api/scanner', scannerRoutes); // Stock scanner
app.use('/api/tax', taxHarvestingRoutes); // Tax-loss harvesting

// AI Routes
app.use('/api/ai/chat', aiChatRoutes); // AI chat with streaming
app.use('/api/ai-reports', aiReportsRoutes); // AI report generation

// Direct AI status endpoint at /api/ai/status for compatibility
app.get('/api/ai/status', (req, res) => {
  try {
    const unifiedAI = require('./services/unifiedAIService');
    const status = unifiedAI.getStatus();
    res.json({
      success: true,
      status,
      primaryProvider: process.env.AI_PRIMARY_PROVIDER || 'claude'
    });
  } catch (error) {
    console.error('[AI Status] Error:', error.message);
    res.json({
      success: true,
      status: {
        available: !!process.env.ANTHROPIC_API_KEY || !!process.env.OPENAI_API_KEY,
        providers: [
          process.env.ANTHROPIC_API_KEY ? 'claude' : null,
          process.env.OPENAI_API_KEY ? 'openai' : null
        ].filter(Boolean)
      },
      primaryProvider: process.env.AI_PRIMARY_PROVIDER || 'claude'
    });
  }
});

// Calendar-specific routes
app.use('/api/earnings-calendar', earningsCalendarRoutes); // Earnings calendar
app.use('/api/dividend-calendar', dividendCalendarRoutes); // Dividend calendar
app.use('/api/ipo-calendar', ipoCalendarRoutes); // IPO calendar
app.use('/api/spac-tracker', spacTrackerRoutes); // SPAC tracker

// Additional routes
app.use('/api/technicals', technicalRoutes); // Technical analysis
app.use('/api/fundamentals', fundamentalsRoutes); // Fundamental analysis
app.use('/api/research', researchRoutes); // Research routes
app.use('/api/trading', tradingRoutes); // Trading routes
app.use('/api/reports', reportsRoutes); // Report routes
app.use('/api/settings', settingsRoutes); // Settings routes
app.use('/api/insights', insightsRoutes); // Insights routes
app.use('/api/dashboard', dashboardRoutes); // Dashboard routes
app.use('/api/simple-dashboard', simpleDashboardRoutes); // Simple dashboard
app.use('/api/exports', exportsRoutes); // Export routes
app.use('/api/sharing', sharingRoutes); // Sharing routes
app.use('/api/clients', clientsRoutes); // Client routes (for advisors)
app.use('/api/monitoring', monitoringRoutes); // Monitoring routes
app.use('/api/notifications', notificationsRoutes); // Notification routes
app.use('/api/options', optionsRoutes); // Options analysis
app.use('/api/risk', riskAnalysisRoutes); // Risk analysis
app.use('/api/advanced-analytics', advancedAnalyticsRoutes); // Advanced analytics
app.use('/api/margins', marginsRoutes); // Margin analysis
app.use('/api/dividend-analysis', dividendAnalysisRoutes); // Dividend analysis
app.use('/api/sectors', sectorsRoutes); // Sector routes
app.use('/api/sector-analysis', sectorAnalysisRoutes); // Sector analysis
app.use('/api/portfolio-tools', portfolioToolsRoutes); // Portfolio tools
app.use('/api/help', helpRoutes); // Help routes
app.use('/api/auth/2fa', twoFactorRoutes); // Two-factor authentication
app.use('/api/extended', extendedRoutes); // Extended API routes
app.use('/api/stock-search', stockSearchRoutes); // Stock search
app.use('/api/brokers', brokerRoutes); // Broker integrations
app.use('/api/esg', esgRoutes); // ESG analysis
app.use('/api/security', securityRoutes); // Security management
app.use('/api/database', databaseRoutes); // Database management
app.use('/api/oauth', oauthRoutes); // OAuth for broker authentication
app.use('/api/secrets', secretsRoutes); // Secrets management (admin)

app.use('/api', featuresRoutes); // Paper trading, goals, journal, crypto, social, etc.

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
  res.status(404).json({ error: 'Not found' });
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
