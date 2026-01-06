const express = require('express');
const logger = require('../utils/logger');
const router = express.Router();
const { authenticate } = require('../middleware/auth');

// Try to import Database, use mock if not available (for AWS/PostgreSQL deployment)
let Database;
try {
  Database = require('../db/database');
} catch (err) {
  logger.warn('SQLite database not available, using mock database for sector analysis routes');
  Database = {
    getPortfolioById: (id) => ({ id, user_id: null, name: 'Demo Portfolio' }),
    getHoldingsByPortfolio: () => [],
    getPortfoliosByUser: () => []
  };
}

/**
 * Stock Symbol to Sector Mapping
 * Based on common knowledge of major stocks and ETFs
 */
const SYMBOL_TO_SECTOR = {
  // Technology
  'AAPL': 'Technology',
  'MSFT': 'Technology',
  'GOOGL': 'Technology',
  'GOOG': 'Technology',
  'AMZN': 'Technology',
  'META': 'Technology',
  'NVDA': 'Technology',
  'TSLA': 'Technology',
  'NFLX': 'Technology',
  'ADBE': 'Technology',
  'CRM': 'Technology',
  'ORCL': 'Technology',
  'INTC': 'Technology',
  'AMD': 'Technology',
  'CSCO': 'Technology',
  'IBM': 'Technology',

  // Healthcare
  'JNJ': 'Healthcare',
  'UNH': 'Healthcare',
  'PFE': 'Healthcare',
  'ABBV': 'Healthcare',
  'TMO': 'Healthcare',
  'ABT': 'Healthcare',
  'MRK': 'Healthcare',
  'LLY': 'Healthcare',

  // Financials
  'JPM': 'Financials',
  'BAC': 'Financials',
  'WFC': 'Financials',
  'GS': 'Financials',
  'MS': 'Financials',
  'C': 'Financials',
  'AXP': 'Financials',
  'BLK': 'Financials',

  // Consumer Staples
  'PG': 'Consumer Staples',
  'KO': 'Consumer Staples',
  'PEP': 'Consumer Staples',
  'WMT': 'Consumer Staples',
  'COST': 'Consumer Staples',
  'PM': 'Consumer Staples',
  'MO': 'Consumer Staples',

  // Energy
  'XOM': 'Energy',
  'CVX': 'Energy',
  'COP': 'Energy',
  'SLB': 'Energy',
  'EOG': 'Energy',

  // Industrials
  'BA': 'Industrials',
  'CAT': 'Industrials',
  'GE': 'Industrials',
  'MMM': 'Industrials',
  'HON': 'Industrials',
  'UPS': 'Industrials',
  'LMT': 'Industrials',

  // Communication Services
  'T': 'Communication Services',
  'VZ': 'Communication Services',
  'CMCSA': 'Communication Services',
  'DIS': 'Communication Services',
  'TMUS': 'Communication Services',
  'NOK': 'Communication Services',

  // Consumer Discretionary
  'AMZN': 'Consumer Discretionary',
  'TSLA': 'Consumer Discretionary',
  'HD': 'Consumer Discretionary',
  'MCD': 'Consumer Discretionary',
  'NKE': 'Consumer Discretionary',
  'SBUX': 'Consumer Discretionary',

  // Real Estate
  'AMT': 'Real Estate',
  'PLD': 'Real Estate',
  'CCI': 'Real Estate',
  'SPG': 'Real Estate',

  // Materials
  'LIN': 'Materials',
  'APD': 'Materials',
  'SHW': 'Materials',
  'FCX': 'Materials',

  // Utilities
  'NEE': 'Utilities',
  'DUK': 'Utilities',
  'SO': 'Utilities',
  'D': 'Utilities',

  // Sector ETFs
  'SPY': 'Broad Market ETF',
  'QQQ': 'Technology ETF',
  'DIA': 'Broad Market ETF',
  'IWM': 'Small Cap ETF',
  'VTI': 'Broad Market ETF',
  'VOO': 'Broad Market ETF',
  'XLK': 'Technology ETF',
  'XLF': 'Financial ETF',
  'XLV': 'Healthcare ETF',
  'XLE': 'Energy ETF',
  'XLI': 'Industrial ETF',
  'XLP': 'Consumer Staples ETF',
  'XLY': 'Consumer Discretionary ETF',
  'XLC': 'Communication Services ETF',
  'XLRE': 'Real Estate ETF',
  'XLB': 'Materials ETF',
  'XLU': 'Utilities ETF',

  // Bond ETFs
  'AGG': 'Bonds',
  'BND': 'Bonds',
  'TLT': 'Bonds',
  'SHY': 'Bonds',
  'IEF': 'Bonds',

  // Commodity/Precious Metals
  'GLD': 'Commodities',
  'SLV': 'Commodities',
  'GDX': 'Commodities',

  // International
  'VEU': 'International',
  'EFA': 'International',
  'VWO': 'International',
  'EEM': 'International',
  'IEMG': 'International',
  'FXI': 'International',
  'EWJ': 'International',
  'EWG': 'International'
};

/**
 * Get sector for a symbol
 */
function getSectorForSymbol(symbol) {
  return SYMBOL_TO_SECTOR[symbol.toUpperCase()] || 'Other';
}

/**
 * GET /api/sector-analysis-fixed/portfolio/:portfolioId
 * Calculate sector allocation from actual portfolio holdings
 */
router.get('/portfolio/:portfolioId', authenticate, async (req, res) => {
  try {
    const { portfolio_id } = req.params;

    // Verify user owns this portfolio
    const portfolio = Database.getPortfolioById(portfolioId);
    if (!portfolio || portfolio.user_id !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    // Get holdings
    const holdings = Database.getHoldingsByPortfolio(portfolioId);

    if (holdings.length === 0) {
      return res.json({
        success: true,
        data: {
          allocations: [],
          totalValue: 0,
          portfolioName: portfolio.name
        }
      });
    }

    // Calculate sector allocation
    const sectorMap = {};
    let totalPortfolioValue = 0;

    for (const holding of holdings) {
      const sector = getSectorForSymbol(holding.symbol);
      const currentPrice = Number(holding.avg_cost_basis) || 0; // Using cost basis as placeholder
      const value = Number(holding.shares) * currentPrice;

      totalPortfolioValue += value;

      if (!sectorMap[sector]) {
        sectorMap[sector] = {
          sector,
          value: 0,
          holdings: []
        };
      }

      sectorMap[sector].value += value;
      sectorMap[sector].holdings.push({
        symbol: holding.symbol,
        shares: holding.shares,
        value
      });
    }

    // Convert to array and calculate percentages
    const allocations = Object.values(sectorMap).map(sector => ({
      sectorName: sector.sector,
      sectorValue: sector.value,
      percentAlloc: totalPortfolioValue > 0 ? (sector.value / totalPortfolioValue) * 100 : 0,
      returnPct: 0, // Will be calculated with real-time prices
      holdingsCount: sector.holdings.length,
      holdings: sector.holdings
    }));

    // Sort by value descending
    allocations.sort((a, b) => b.sectorValue - a.sectorValue);

    res.json({
      success: true,
      data: {
        allocations,
        totalValue: totalPortfolioValue,
        portfolioName: portfolio.name,
        holdingsCount: holdings.length
      }
    });

  } catch (error) {
    logger.error('Error calculating sector allocation:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/sector-analysis-fixed/all-portfolios
 * Calculate sector allocation across ALL user portfolios
 */
router.get('/all-portfolios', authenticate, async (req, res) => {
  try {
    // Get all user portfolios
    const portfolios = Database.getPortfoliosByUser(req.user.id);

    if (portfolios.length === 0) {
      return res.json({
        success: true,
        data: { allocations: [], totalValue: 0 }
      });
    }

    // Aggregate holdings from all portfolios
    const allHoldings = [];
    for (const portfolio of portfolios) {
      const holdings = Database.getHoldingsByPortfolio(portfolio.id);
      holdings.forEach(h => {
        h.portfolioName = portfolio.name;
        allHoldings.push(h);
      });
    }

    if (allHoldings.length === 0) {
      return res.json({
        success: true,
        data: { allocations: [], totalValue: 0 }
      });
    }

    // Calculate sector allocation
    const sectorMap = {};
    let totalValue = 0;

    for (const holding of allHoldings) {
      const sector = getSectorForSymbol(holding.symbol);
      const currentPrice = Number(holding.avg_cost_basis) || 0;
      const value = Number(holding.shares) * currentPrice;

      totalValue += value;

      if (!sectorMap[sector]) {
        sectorMap[sector] = {
          sector,
          value: 0,
          holdings: [],
          portfolios: new Set()
        };
      }

      sectorMap[sector].value += value;
      sectorMap[sector].holdings.push({
        symbol: holding.symbol,
        shares: holding.shares,
        value,
        portfolioName: holding.portfolioName
      });
      sectorMap[sector].portfolios.add(holding.portfolioName);
    }

    // Convert to array and calculate percentages
    const allocations = Object.values(sectorMap).map(sector => ({
      sectorName: sector.sector,
      sectorValue: sector.value,
      percentAlloc: totalValue > 0 ? (sector.value / totalValue) * 100 : 0,
      returnPct: 0, // Will be calculated with real-time prices
      holdingsCount: sector.holdings.length,
      portfoliosCount: sector.portfolios.size,
      holdings: sector.holdings
    }));

    // Sort by value descending
    allocations.sort((a, b) => b.sectorValue - a.sectorValue);

    res.json({
      success: true,
      data: {
        allocations,
        totalValue,
        portfoliosCount: portfolios.length,
        totalHoldings: allHoldings.length
      }
    });

  } catch (error) {
    logger.error('Error calculating all-portfolios sector allocation:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
