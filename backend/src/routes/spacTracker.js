/**
 * SPAC Tracker Routes
 * Track SPAC IPOs, mergers, and deadlines with real data from FMP and Finnhub APIs
 */

const express = require('express');
const axios = require('axios');
const logger = require('../utils/logger');
const router = express.Router();
const { authenticate } = require('../middleware/auth');

// API Configuration
const FMP_API_KEY = process.env.FMP_API_KEY;
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
const FMP_BASE_URL = 'https://financialmodelingprep.com/api/v3';
const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';

// Cache configuration - SPAC data cached for 1 hour
const CACHE_DURATION_MS = 60 * 60 * 1000; // 1 hour
let spacCache = {
  data: null,
  timestamp: null
};

// Well-known SPAC symbols to track (curated list of active SPACs)
const CURATED_SPAC_SYMBOLS = [
  'IPOF', 'IPOD', 'PSTH', 'CCIV', 'DKNG', 'SOFI', 'LCID', 'GRAB', 'RIVN',
  'DWAC', 'MVST', 'DNA', 'BARK', 'IONQ', 'RKLB', 'GETY', 'HLAH', 'CHPT',
  'PAYO', 'ME', 'JOBY', 'LILM', 'ASTS', 'ORGN', 'MNTS', 'VORB', 'SPCE',
  'CLOV', 'HIMS', 'OPEN', 'PTRA', 'LAZR', 'VLDR', 'LIDR', 'INVZ', 'XPEV'
];

// SPAC ETF symbols for holdings-based discovery
const SPAC_ETFS = ['SPAK', 'SPXZ', 'SPCX'];

router.use(authenticate);

/**
 * Helper: Check if cache is valid
 */
function isCacheValid() {
  if (!spacCache.data || !spacCache.timestamp) {
    return false;
  }
  const now = Date.now();
  const cacheAge = now - spacCache.timestamp;
  return cacheAge < CACHE_DURATION_MS;
}

/**
 * Helper: Format date as YYYY-MM-DD
 */
function formatDate(date) {
  return date.toISOString().split('T')[0];
}

/**
 * Fetch SPAC list from FMP API
 */
async function fetchSPACsFromFMP() {
  if (!FMP_API_KEY) {
    logger.warn('FMP_API_KEY not configured');
    return null;
  }

  try {
    // FMP has a dedicated SPAC endpoint
    const url = `${FMP_BASE_URL}/spac?apikey=${FMP_API_KEY}`;
    logger.info('Fetching SPAC data from FMP API');

    const response = await axios.get(url, { timeout: 15000 });

    if (response.data && Array.isArray(response.data) && response.data.length > 0) {
      logger.info(`FMP returned ${response.data.length} SPACs`);
      return response.data;
    }

    return null;
  } catch (error) {
    logger.error('FMP SPAC API error:', error.message);
    return null;
  }
}

/**
 * Fetch company profile from FMP API for additional data
 */
async function fetchCompanyProfile(symbol) {
  if (!FMP_API_KEY) return null;

  try {
    const url = `${FMP_BASE_URL}/profile/${symbol}?apikey=${FMP_API_KEY}`;
    const response = await axios.get(url, { timeout: 10000 });

    if (response.data && Array.isArray(response.data) && response.data.length > 0) {
      return response.data[0];
    }
    return null;
  } catch (error) {
    logger.debug(`Failed to fetch profile for ${symbol}: ${error.message}`);
    return null;
  }
}

/**
 * Fetch real-time quote from FMP API
 */
async function fetchQuote(symbol) {
  if (!FMP_API_KEY) return null;

  try {
    const url = `${FMP_BASE_URL}/quote/${symbol}?apikey=${FMP_API_KEY}`;
    const response = await axios.get(url, { timeout: 10000 });

    if (response.data && Array.isArray(response.data) && response.data.length > 0) {
      return response.data[0];
    }
    return null;
  } catch (error) {
    logger.debug(`Failed to fetch quote for ${symbol}: ${error.message}`);
    return null;
  }
}

/**
 * Fetch batch quotes from FMP API
 */
async function fetchBatchQuotes(symbols) {
  if (!FMP_API_KEY || symbols.length === 0) return {};

  try {
    const symbolList = symbols.join(',');
    const url = `${FMP_BASE_URL}/quote/${symbolList}?apikey=${FMP_API_KEY}`;
    const response = await axios.get(url, { timeout: 15000 });

    if (response.data && Array.isArray(response.data)) {
      const quotes = {};
      response.data.forEach(quote => {
        quotes[quote.symbol] = quote;
      });
      return quotes;
    }
    return {};
  } catch (error) {
    logger.error('Failed to fetch batch quotes:', error.message);
    return {};
  }
}

/**
 * Fetch ETF holdings to discover SPAC symbols
 */
async function fetchETFHoldings(etfSymbol) {
  if (!FMP_API_KEY) return [];

  try {
    const url = `${FMP_BASE_URL}/etf-holder/${etfSymbol}?apikey=${FMP_API_KEY}`;
    const response = await axios.get(url, { timeout: 10000 });

    if (response.data && Array.isArray(response.data)) {
      return response.data.map(holding => holding.asset).filter(Boolean);
    }
    return [];
  } catch (error) {
    logger.debug(`Failed to fetch ETF holdings for ${etfSymbol}: ${error.message}`);
    return [];
  }
}

/**
 * Search for SPACs using stock screener
 */
async function searchSPACsViaScreener() {
  if (!FMP_API_KEY) return [];

  try {
    // Search for companies with "Acquisition" in the name (common SPAC naming)
    const url = `${FMP_BASE_URL}/stock-screener?marketCapMoreThan=100000000&isActivelyTrading=true&limit=100&apikey=${FMP_API_KEY}`;
    const response = await axios.get(url, { timeout: 15000 });

    if (response.data && Array.isArray(response.data)) {
      // Filter for companies that look like SPACs
      return response.data.filter(stock =>
        stock.companyName &&
        (stock.companyName.toLowerCase().includes('acquisition') ||
         stock.companyName.toLowerCase().includes('spac') ||
         stock.companyName.toLowerCase().includes('blank check'))
      );
    }
    return [];
  } catch (error) {
    logger.debug('Failed to search SPACs via screener:', error.message);
    return [];
  }
}

/**
 * Determine SPAC status based on available data
 */
function determineSPACStatus(spac, profile) {
  const name = (spac.name || spac.companyName || '').toLowerCase();
  const description = (profile?.description || '').toLowerCase();

  // Check for completed mergers
  if (description.includes('formerly known as') ||
      description.includes('completed its business combination') ||
      description.includes('merged with')) {
    return 'completed';
  }

  // Check for announced mergers
  if (description.includes('announced') ||
      description.includes('definitive agreement') ||
      description.includes('business combination with')) {
    return 'announced';
  }

  // Check for liquidating SPACs
  if (description.includes('liquidat') ||
      description.includes('wind down') ||
      description.includes('dissolution')) {
    return 'liquidating';
  }

  // Default to searching
  return 'searching';
}

/**
 * Extract target company info from description
 */
function extractTargetInfo(profile) {
  if (!profile || !profile.description) {
    return { targetCompany: null, industry: null };
  }

  const description = profile.description;

  // Try to extract target company name
  let targetCompany = null;
  const mergerMatch = description.match(/business combination with ([^,\.]+)/i) ||
                      description.match(/merge[rd]? with ([^,\.]+)/i) ||
                      description.match(/acqui(?:re|sition of) ([^,\.]+)/i);

  if (mergerMatch) {
    targetCompany = mergerMatch[1].trim();
  }

  // Get industry from profile
  const industry = profile.industry || null;

  return { targetCompany, industry };
}

/**
 * Calculate premium/discount to NAV
 * SPACs typically have $10 NAV trust value
 */
function calculatePremiumDiscount(currentPrice, trustValue = 10.00) {
  if (!currentPrice || currentPrice <= 0) return 0;
  return ((currentPrice - trustValue) / trustValue * 100).toFixed(2);
}

/**
 * Transform raw SPAC data to standard format
 */
function transformSPACData(rawSpac, quote, profile) {
  const currentPrice = quote?.price || rawSpac.price || null;
  const trustValue = 10.00; // Standard SPAC trust value
  const premiumDiscount = calculatePremiumDiscount(currentPrice, trustValue);

  const status = determineSPACStatus(rawSpac, profile);
  const { targetCompany, industry } = extractTargetInfo(profile);

  // Calculate deadline (24 months from IPO is typical)
  let mergerDeadline = null;
  if (profile?.ipoDate) {
    const deadline = new Date(profile.ipoDate);
    deadline.setMonth(deadline.getMonth() + 24);
    mergerDeadline = formatDate(deadline);
  }

  return {
    symbol: rawSpac.symbol || rawSpac.ticker,
    name: rawSpac.name || rawSpac.companyName || profile?.companyName || rawSpac.symbol,
    trustValue: trustValue,
    currentPrice: currentPrice,
    premiumDiscount: parseFloat(premiumDiscount),
    targetCompany: targetCompany,
    mergerDate: mergerDeadline,
    status: status,
    industry: industry || 'Not Announced',
    // Additional useful fields
    marketCap: quote?.marketCap || profile?.mktCap || null,
    volume: quote?.volume || null,
    change: quote?.change || null,
    changePercent: quote?.changesPercentage || null,
    exchange: profile?.exchange || quote?.exchange || 'NASDAQ',
    ipoDate: profile?.ipoDate || null,
    sector: profile?.sector || null,
    country: profile?.country || 'US',
    website: profile?.website || null,
    description: profile?.description?.substring(0, 500) || null
  };
}

/**
 * Fetch all SPAC data with multiple fallback strategies
 */
async function fetchAllSPACData() {
  // Check cache first
  if (isCacheValid()) {
    logger.info('Returning cached SPAC data');
    return spacCache.data;
  }

  logger.info('Fetching fresh SPAC data...');
  let spacSymbols = new Set();

  // Strategy 1: Try FMP SPAC endpoint
  const fmpSpacs = await fetchSPACsFromFMP();
  if (fmpSpacs && fmpSpacs.length > 0) {
    fmpSpacs.forEach(spac => {
      if (spac.symbol) spacSymbols.add(spac.symbol);
    });
    logger.info(`Found ${spacSymbols.size} SPACs from FMP endpoint`);
  }

  // Strategy 2: Add curated SPAC symbols
  CURATED_SPAC_SYMBOLS.forEach(symbol => spacSymbols.add(symbol));
  logger.info(`Added curated SPACs, total: ${spacSymbols.size}`);

  // Strategy 3: Try to get SPAC ETF holdings
  for (const etf of SPAC_ETFS) {
    const holdings = await fetchETFHoldings(etf);
    holdings.forEach(symbol => spacSymbols.add(symbol));
  }
  logger.info(`After ETF holdings, total: ${spacSymbols.size}`);

  // Strategy 4: Try screener search
  const screenerResults = await searchSPACsViaScreener();
  screenerResults.forEach(stock => {
    if (stock.symbol) spacSymbols.add(stock.symbol);
  });
  logger.info(`After screener, total: ${spacSymbols.size}`);

  // Convert to array and limit to prevent too many API calls
  const symbolsArray = Array.from(spacSymbols).slice(0, 100);

  if (symbolsArray.length === 0) {
    logger.warn('No SPAC symbols found');
    return [];
  }

  // Fetch batch quotes
  const quotes = await fetchBatchQuotes(symbolsArray);
  logger.info(`Fetched ${Object.keys(quotes).length} quotes`);

  // Build SPAC data with available information
  const spacData = [];

  // Process in batches to avoid overwhelming API
  const batchSize = 10;
  for (let i = 0; i < symbolsArray.length; i += batchSize) {
    const batch = symbolsArray.slice(i, i + batchSize);

    const batchPromises = batch.map(async (symbol) => {
      const quote = quotes[symbol];
      if (!quote) return null; // Skip if no quote data

      // Fetch profile for additional info (rate limited)
      const profile = await fetchCompanyProfile(symbol);

      // Create SPAC object
      const rawSpac = fmpSpacs?.find(s => s.symbol === symbol) || { symbol };

      return transformSPACData(rawSpac, quote, profile);
    });

    const batchResults = await Promise.all(batchPromises);
    batchResults.filter(Boolean).forEach(spac => spacData.push(spac));

    // Small delay between batches to respect rate limits
    if (i + batchSize < symbolsArray.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  // Sort by market cap (descending) and filter out invalid entries
  const validSpacs = spacData
    .filter(spac => spac.symbol && spac.name && spac.currentPrice)
    .sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0));

  // Update cache
  if (validSpacs.length > 0) {
    spacCache = {
      data: validSpacs,
      timestamp: Date.now()
    };
    logger.info(`Cached ${validSpacs.length} SPACs`);
  }

  return validSpacs;
}

/**
 * GET /api/spac-tracker/upcoming
 * Get upcoming SPAC mergers and IPOs
 */
router.get('/upcoming', async (req, res) => {
  try {
    const { limit = 50, status } = req.query;

    let spacs = await fetchAllSPACData();

    // Filter by status if provided
    if (status) {
      const statusLower = status.toLowerCase();
      spacs = spacs.filter(spac => spac.status === statusLower);
    }

    // Filter to show SPACs that are still active (not completed)
    const upcomingSpacs = spacs.filter(spac =>
      spac.status === 'searching' || spac.status === 'announced'
    );

    // Apply limit
    const limitedSpacs = upcomingSpacs.slice(0, parseInt(limit));

    // Transform to expected format
    const spacData = limitedSpacs.map(spac => ({
      id: `spac-${spac.symbol}`,
      symbol: spac.symbol,
      name: spac.name,
      status: spac.status,
      ipoDate: spac.ipoDate,
      priceRange: spac.currentPrice ? `$${spac.currentPrice.toFixed(2)}` : 'TBD',
      trustSize: spac.marketCap || 0,
      sector: spac.industry || 'General Purpose',
      sponsor: 'TBD',
      deadline: spac.mergerDate,
      daysRemaining: calculateDaysRemaining(spac.mergerDate),
      // Additional SPAC-specific fields
      currentPrice: spac.currentPrice,
      trustValue: spac.trustValue,
      premiumDiscount: spac.premiumDiscount,
      targetCompany: spac.targetCompany,
      change: spac.change,
      changePercent: spac.changePercent
    }));

    // Return proper empty state when no SPACs found
    if (spacData.length === 0) {
      return res.json({
        success: true,
        data: [],
        count: 0,
        message: 'No upcoming SPACs found',
        cached: isCacheValid()
      });
    }

    res.json({
      success: true,
      data: spacData,
      count: spacData.length,
      totalAvailable: spacs.length,
      cached: isCacheValid()
    });
  } catch (error) {
    logger.error('SPAC Tracker error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch SPAC data',
      message: error.message
    });
  }
});

/**
 * GET /api/spac-tracker/stats
 * Get SPAC market statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const spacs = await fetchAllSPACData();

    // Calculate statistics
    const statusCounts = {
      searching: 0,
      announced: 0,
      completed: 0,
      liquidating: 0
    };

    let totalTrustValue = 0;
    let totalPremium = 0;
    let premiumCount = 0;

    spacs.forEach(spac => {
      statusCounts[spac.status] = (statusCounts[spac.status] || 0) + 1;
      totalTrustValue += spac.marketCap || 0;

      if (spac.premiumDiscount !== null && !isNaN(spac.premiumDiscount)) {
        totalPremium += spac.premiumDiscount;
        premiumCount++;
      }
    });

    // Industry distribution
    const industryDistribution = {};
    spacs.forEach(spac => {
      const industry = spac.industry || 'Not Announced';
      industryDistribution[industry] = (industryDistribution[industry] || 0) + 1;
    });

    res.json({
      success: true,
      data: {
        total: spacs.length,
        upcoming: statusCounts.searching + statusCounts.announced,
        searching: statusCounts.searching,
        announced: statusCounts.announced,
        completed: statusCounts.completed,
        liquidating: statusCounts.liquidating,
        thisMonth: spacs.filter(s => {
          if (!s.mergerDate) return false;
          const mergerMonth = new Date(s.mergerDate).getMonth();
          const currentMonth = new Date().getMonth();
          return mergerMonth === currentMonth;
        }).length,
        totalTrustValue,
        avgTrustSize: spacs.length > 0 ? totalTrustValue / spacs.length : 0,
        avgPremiumDiscount: premiumCount > 0 ? (totalPremium / premiumCount).toFixed(2) : 0,
        industryDistribution,
        statusDistribution: statusCounts
      },
      cached: isCacheValid()
    });
  } catch (error) {
    logger.error('SPAC stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch SPAC stats',
      message: error.message
    });
  }
});

/**
 * GET /api/spac-tracker/sector/:sector
 * Get SPACs by target sector/industry
 */
router.get('/sector/:sector', async (req, res) => {
  try {
    const { sector } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    const spacs = await fetchAllSPACData();

    const filtered = spacs
      .filter(spac =>
        spac.industry &&
        spac.industry.toLowerCase().includes(sector.toLowerCase())
      )
      .slice(parseInt(offset), parseInt(offset) + parseInt(limit));

    res.json({
      success: true,
      data: filtered,
      count: filtered.length
    });
  } catch (error) {
    logger.error('SPAC sector error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch SPAC sector data',
      message: error.message
    });
  }
});

/**
 * GET /api/spac-tracker/status/:status
 * Get SPACs by status
 */
router.get('/status/:status', async (req, res) => {
  try {
    const { status } = req.params;
    const { limit = 50 } = req.query;
    const validStatuses = ['searching', 'announced', 'completed', 'liquidating'];

    if (!validStatuses.includes(status.toLowerCase())) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Valid values: ${validStatuses.join(', ')}`
      });
    }

    const spacs = await fetchAllSPACData();

    const filtered = spacs
      .filter(spac => spac.status === status.toLowerCase())
      .slice(0, parseInt(limit));

    res.json({
      success: true,
      data: filtered,
      count: filtered.length
    });
  } catch (error) {
    logger.error('SPAC status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch SPACs by status',
      message: error.message
    });
  }
});

/**
 * GET /api/spac-tracker/symbol/:symbol
 * Get details for a specific SPAC
 */
router.get('/symbol/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;

    // Fetch fresh data for single symbol
    const quote = await fetchQuote(symbol.toUpperCase());
    const profile = await fetchCompanyProfile(symbol.toUpperCase());

    if (!quote && !profile) {
      return res.status(404).json({
        success: false,
        error: 'SPAC not found'
      });
    }

    const spacData = transformSPACData({ symbol: symbol.toUpperCase() }, quote, profile);

    res.json({
      success: true,
      data: spacData
    });
  } catch (error) {
    logger.error('SPAC symbol error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch SPAC details',
      message: error.message
    });
  }
});

/**
 * GET /api/spac-tracker/search
 * Search SPACs by name or symbol
 */
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    const limit = parseInt(req.query.limit) || 20;

    if (!q) {
      return res.status(400).json({
        success: false,
        error: 'Search query is required'
      });
    }

    const spacs = await fetchAllSPACData();

    const searchTerm = q.toLowerCase();
    const results = spacs
      .filter(spac =>
        spac.symbol.toLowerCase().includes(searchTerm) ||
        spac.name.toLowerCase().includes(searchTerm) ||
        (spac.targetCompany && spac.targetCompany.toLowerCase().includes(searchTerm)) ||
        (spac.industry && spac.industry.toLowerCase().includes(searchTerm))
      )
      .slice(0, limit);

    res.json({
      success: true,
      data: results,
      count: results.length
    });
  } catch (error) {
    logger.error('SPAC search error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search SPACs',
      message: error.message
    });
  }
});

/**
 * POST /api/spac-tracker/refresh
 * Force refresh SPAC data (clears cache)
 */
router.post('/refresh', async (req, res) => {
  try {
    // Clear cache
    spacCache = {
      data: null,
      timestamp: null
    };

    logger.info('Force refreshing SPAC data...');

    const spacs = await fetchAllSPACData();

    res.json({
      success: true,
      message: 'SPAC data refreshed successfully',
      count: spacs.length
    });
  } catch (error) {
    logger.error('Error refreshing SPAC data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to refresh SPAC data',
      message: error.message
    });
  }
});

/**
 * GET /api/spac-tracker/premiums
 * Get SPACs sorted by premium/discount to NAV
 */
router.get('/premiums', async (req, res) => {
  try {
    const { order = 'asc', limit = 50 } = req.query;

    const spacs = await fetchAllSPACData();

    // Sort by premium/discount
    const sorted = [...spacs]
      .filter(spac => spac.premiumDiscount !== null && !isNaN(spac.premiumDiscount))
      .sort((a, b) =>
        order === 'asc'
          ? a.premiumDiscount - b.premiumDiscount
          : b.premiumDiscount - a.premiumDiscount
      )
      .slice(0, parseInt(limit));

    res.json({
      success: true,
      data: sorted,
      count: sorted.length,
      order: order
    });
  } catch (error) {
    logger.error('SPAC premiums error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch SPAC premiums',
      message: error.message
    });
  }
});

// Helper functions
function calculateDeadline(ipoDate) {
  if (!ipoDate) return null;
  // SPACs typically have 24-month deadline from IPO
  const deadline = new Date(ipoDate);
  deadline.setMonth(deadline.getMonth() + 24);
  return deadline.toISOString().split('T')[0];
}

function calculateDaysRemaining(deadlineDate) {
  if (!deadlineDate) return null;
  const deadline = new Date(deadlineDate);
  const today = new Date();
  const diffTime = deadline - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}

module.exports = router;
