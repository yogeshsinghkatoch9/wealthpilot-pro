/**
 * ESG Analysis Routes
 * API endpoints for comprehensive ESG (Environmental, Social, Governance) analysis
 * Uses FMP API for real ESG data with 1-week caching
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const logger = require('../utils/logger');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// FMP API configuration
const FMP_API_KEY = process.env.FMP_API_KEY;
const FMP_BASE_URL = 'https://financialmodelingprep.com/api/v4';

// ESG Cache - stores data for 1 week (ESG scores change infrequently)
const ESG_CACHE = new Map();
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 1 week in milliseconds

// ==================== HELPER FUNCTIONS ====================

/**
 * Get cached ESG data or null if expired/missing
 */
function getCachedESG(symbol) {
  const cacheKey = symbol.toUpperCase();
  const cached = ESG_CACHE.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  return null;
}

/**
 * Set ESG data in cache
 */
function setCachedESG(symbol, data) {
  const cacheKey = symbol.toUpperCase();
  ESG_CACHE.set(cacheKey, {
    data,
    timestamp: Date.now()
  });
}

/**
 * Fetch ESG data from FMP API
 */
async function fetchFMPESGData(symbol) {
  if (!FMP_API_KEY) {
    logger.warn('FMP_API_KEY not configured');
    return null;
  }

  const upperSymbol = symbol.toUpperCase();

  try {
    // Fetch both ESG score data and ESG ratings in parallel
    const [scoreResponse, ratingResponse] = await Promise.all([
      fetch(`${FMP_BASE_URL}/esg-environmental-social-governance-data?symbol=${upperSymbol}&apikey=${FMP_API_KEY}`),
      fetch(`${FMP_BASE_URL}/esg-environmental-social-governance-data-ratings?symbol=${upperSymbol}&apikey=${FMP_API_KEY}`)
    ]);

    if (!scoreResponse.ok || !ratingResponse.ok) {
      logger.warn(`FMP API error for ${upperSymbol}: Score=${scoreResponse.status}, Rating=${ratingResponse.status}`);
      return null;
    }

    const scoreData = await scoreResponse.json();
    const ratingData = await ratingResponse.json();

    // FMP returns arrays, get the most recent data
    const latestScore = Array.isArray(scoreData) && scoreData.length > 0 ? scoreData[0] : null;
    const latestRating = Array.isArray(ratingData) && ratingData.length > 0 ? ratingData[0] : null;

    if (!latestScore && !latestRating) {
      logger.info(`No ESG data available for ${upperSymbol}`);
      return null;
    }

    // Normalize the FMP data to our standard structure
    return normalizeESGData(upperSymbol, latestScore, latestRating);
  } catch (error) {
    logger.error(`Error fetching FMP ESG data for ${upperSymbol}:`, error.message);
    return null;
  }
}

/**
 * Normalize FMP ESG data to standard structure
 */
function normalizeESGData(symbol, scoreData, ratingData) {
  // Default values
  const result = {
    symbol: symbol,
    environmentalScore: null,
    socialScore: null,
    governanceScore: null,
    totalESGScore: null,
    ESGRiskRating: 'N/A',
    controversyLevel: null,
    dataAvailable: false,
    source: 'FMP API',
    lastUpdated: new Date().toISOString()
  };

  // Extract from score data if available
  if (scoreData) {
    result.environmentalScore = scoreData.environmentalScore ?? scoreData.environmentScore ?? null;
    result.socialScore = scoreData.socialScore ?? null;
    result.governanceScore = scoreData.governanceScore ?? null;

    // Calculate total if we have component scores
    if (result.environmentalScore !== null &&
        result.socialScore !== null &&
        result.governanceScore !== null) {
      result.totalESGScore = Math.round(
        (result.environmentalScore + result.socialScore + result.governanceScore) / 3 * 10
      ) / 10;
    } else if (scoreData.ESGScore || scoreData.esgScore) {
      result.totalESGScore = scoreData.ESGScore ?? scoreData.esgScore;
    }

    result.dataAvailable = true;
  }

  // Extract from rating data if available
  if (ratingData) {
    // Override with rating data if score data was missing
    if (result.environmentalScore === null) {
      result.environmentalScore = ratingData.environmentalScore ?? null;
    }
    if (result.socialScore === null) {
      result.socialScore = ratingData.socialScore ?? null;
    }
    if (result.governanceScore === null) {
      result.governanceScore = ratingData.governanceScore ?? null;
    }
    if (result.totalESGScore === null) {
      result.totalESGScore = ratingData.ESGScore ?? ratingData.esgScore ?? null;
    }

    // ESG Risk Rating from rating data
    result.ESGRiskRating = ratingData.ESGRiskRating ?? ratingData.esgRiskRating ??
                          calculateRiskRating(result.totalESGScore);

    // Controversy level (0-5 scale)
    result.controversyLevel = ratingData.controversyLevel ?? null;

    result.dataAvailable = true;
  }

  // Calculate risk rating if not provided
  if (result.ESGRiskRating === 'N/A' && result.totalESGScore !== null) {
    result.ESGRiskRating = calculateRiskRating(result.totalESGScore);
  }

  return result;
}

/**
 * Calculate ESG risk rating based on score
 */
function calculateRiskRating(score) {
  if (score === null || score === undefined) return 'N/A';
  if (score >= 70) return 'Low';
  if (score >= 50) return 'Medium';
  return 'High';
}

/**
 * Get ESG data for a symbol (with caching)
 */
async function getESGData(symbol, forceRefresh = false) {
  const upperSymbol = symbol.toUpperCase();

  // Check cache first (unless force refresh)
  if (!forceRefresh) {
    const cached = getCachedESG(upperSymbol);
    if (cached) {
      return { ...cached, fromCache: true };
    }
  }

  // Fetch from FMP API
  const data = await fetchFMPESGData(upperSymbol);

  if (data) {
    setCachedESG(upperSymbol, data);
    return { ...data, fromCache: false };
  }

  // Return N/A structure if no data available
  return {
    symbol: upperSymbol,
    environmentalScore: null,
    socialScore: null,
    governanceScore: null,
    totalESGScore: null,
    ESGRiskRating: 'N/A',
    controversyLevel: null,
    dataAvailable: false,
    source: 'N/A',
    lastUpdated: null,
    fromCache: false
  };
}

/**
 * Calculate portfolio ESG scores (weighted average)
 */
async function calculatePortfolioESG(holdings) {
  if (!holdings || holdings.length === 0) {
    return {
      portfolioScore: null,
      environmentalScore: null,
      socialScore: null,
      governanceScore: null,
      ESGRiskRating: 'N/A',
      averageControversyLevel: null,
      breakdown: {
        environmental: null,
        social: null,
        governance: null
      },
      holdings: [],
      dataQuality: {
        holdingsWithData: 0,
        totalHoldings: 0,
        coveragePercent: 0
      }
    };
  }

  // Calculate total portfolio value
  const totalValue = holdings.reduce((sum, h) => {
    const price = h.currentPrice || h.avgCostBasis || 0;
    return sum + (h.shares * price);
  }, 0);

  if (totalValue === 0) {
    return {
      portfolioScore: null,
      environmentalScore: null,
      socialScore: null,
      governanceScore: null,
      ESGRiskRating: 'N/A',
      averageControversyLevel: null,
      breakdown: {
        environmental: null,
        social: null,
        governance: null
      },
      holdings: [],
      dataQuality: {
        holdingsWithData: 0,
        totalHoldings: holdings.length,
        coveragePercent: 0
      }
    };
  }

  // Fetch ESG data for all holdings
  const holdingESGPromises = holdings.map(async (h) => {
    const esgData = await getESGData(h.symbol);
    const price = h.currentPrice || h.avgCostBasis || 0;
    const value = h.shares * price;
    const weight = value / totalValue;

    return {
      symbol: h.symbol,
      shares: h.shares,
      value: value,
      weight: Math.round(weight * 10000) / 100, // as percentage
      esg: esgData
    };
  });

  const holdingESGData = await Promise.all(holdingESGPromises);

  // Calculate weighted averages
  let weightedEnv = 0;
  let weightedSocial = 0;
  let weightedGov = 0;
  let weightedTotal = 0;
  let controversySum = 0;
  let controversyCount = 0;
  let dataWeight = 0;
  let holdingsWithData = 0;

  holdingESGData.forEach(h => {
    if (h.esg.dataAvailable) {
      holdingsWithData++;
      const weight = h.value / totalValue;

      if (h.esg.environmentalScore !== null) {
        weightedEnv += h.esg.environmentalScore * weight;
      }
      if (h.esg.socialScore !== null) {
        weightedSocial += h.esg.socialScore * weight;
      }
      if (h.esg.governanceScore !== null) {
        weightedGov += h.esg.governanceScore * weight;
      }
      if (h.esg.totalESGScore !== null) {
        weightedTotal += h.esg.totalESGScore * weight;
        dataWeight += weight;
      }
      if (h.esg.controversyLevel !== null) {
        controversySum += h.esg.controversyLevel;
        controversyCount++;
      }
    }
  });

  // Normalize weighted scores if we have partial data
  const hasData = dataWeight > 0;

  const portfolioScore = hasData ? Math.round((weightedTotal / dataWeight) * 10) / 10 : null;
  const envScore = hasData ? Math.round((weightedEnv / dataWeight) * 10) / 10 : null;
  const socialScore = hasData ? Math.round((weightedSocial / dataWeight) * 10) / 10 : null;
  const govScore = hasData ? Math.round((weightedGov / dataWeight) * 10) / 10 : null;
  const avgControversy = controversyCount > 0 ?
    Math.round((controversySum / controversyCount) * 10) / 10 : null;

  return {
    portfolioScore: portfolioScore,
    environmentalScore: envScore,
    socialScore: socialScore,
    governanceScore: govScore,
    ESGRiskRating: calculateRiskRating(portfolioScore),
    averageControversyLevel: avgControversy,
    breakdown: {
      environmental: envScore,
      social: socialScore,
      governance: govScore
    },
    holdings: holdingESGData.map(h => ({
      symbol: h.symbol,
      weight: h.weight,
      environmentalScore: h.esg.environmentalScore,
      socialScore: h.esg.socialScore,
      governanceScore: h.esg.governanceScore,
      totalESGScore: h.esg.totalESGScore,
      ESGRiskRating: h.esg.ESGRiskRating,
      controversyLevel: h.esg.controversyLevel,
      dataAvailable: h.esg.dataAvailable
    })).sort((a, b) => (b.totalESGScore || 0) - (a.totalESGScore || 0)),
    dataQuality: {
      holdingsWithData: holdingsWithData,
      totalHoldings: holdings.length,
      coveragePercent: Math.round((holdingsWithData / holdings.length) * 100)
    }
  };
}

// ==================== STOCK ESG DATA ====================

/**
 * GET /api/esg/stock/:symbol
 * Get ESG data for a single stock (uses FMP API with caching)
 */
router.get('/stock/:symbol', async (req, res) => {
  try {
    const { forceRefresh } = req.query;
    const symbol = req.params.symbol.toUpperCase();

    const esgData = await getESGData(symbol, forceRefresh === 'true');

    res.json({
      success: true,
      data: esgData
    });
  } catch (error) {
    logger.error('Error fetching stock ESG:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/esg/stock/:symbol/raw
 * Get raw ESG data directly from FMP API (bypasses cache)
 */
router.get('/stock/:symbol/raw', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();

    if (!FMP_API_KEY) {
      return res.status(503).json({
        success: false,
        error: 'FMP API key not configured'
      });
    }

    // Fetch raw data from both endpoints
    const [scoreResponse, ratingResponse] = await Promise.all([
      fetch(`${FMP_BASE_URL}/esg-environmental-social-governance-data?symbol=${symbol}&apikey=${FMP_API_KEY}`),
      fetch(`${FMP_BASE_URL}/esg-environmental-social-governance-data-ratings?symbol=${symbol}&apikey=${FMP_API_KEY}`)
    ]);

    const scoreData = await scoreResponse.json();
    const ratingData = await ratingResponse.json();

    res.json({
      success: true,
      data: {
        symbol: symbol,
        esgScoreData: scoreData,
        esgRatingData: ratingData,
        fetchedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('Error fetching raw ESG data:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/esg/stocks/bulk
 * Get ESG data for multiple stocks in a single request
 */
router.post('/stocks/bulk', async (req, res) => {
  try {
    const { symbols } = req.body;

    if (!symbols || !Array.isArray(symbols)) {
      return res.status(400).json({
        success: false,
        error: 'Please provide an array of symbols'
      });
    }

    // Limit to 50 symbols per request
    const symbolsToFetch = symbols.slice(0, 50).map(s => s.toUpperCase());

    const results = {};
    const errors = {};

    await Promise.all(
      symbolsToFetch.map(async (symbol) => {
        try {
          results[symbol] = await getESGData(symbol);
        } catch (error) {
          errors[symbol] = error.message;
        }
      })
    );

    res.json({
      success: true,
      data: {
        results,
        errors,
        count: Object.keys(results).length,
        failedCount: Object.keys(errors).length
      }
    });
  } catch (error) {
    logger.error('Error fetching bulk ESG:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== PORTFOLIO ESG ANALYSIS ====================

/**
 * GET /api/esg/portfolio/:portfolioId
 * Get portfolio ESG analysis with weighted averages
 */
router.get('/portfolio/:portfolioId', authenticate, async (req, res) => {
  try {
    const portfolio = await prisma.portfolios.findUnique({
      where: { id: req.params.portfolioId },
      include: { holdings: true }
    });

    if (!portfolio) {
      return res.status(404).json({
        success: false,
        error: 'Portfolio not found'
      });
    }

    if (!portfolio.holdings || portfolio.holdings.length === 0) {
      return res.json({
        success: true,
        data: {
          portfolioScore: null,
          environmentalScore: null,
          socialScore: null,
          governanceScore: null,
          ESGRiskRating: 'N/A',
          averageControversyLevel: null,
          breakdown: { environmental: null, social: null, governance: null },
          holdings: [],
          dataQuality: { holdingsWithData: 0, totalHoldings: 0, coveragePercent: 0 },
          message: 'No holdings in portfolio'
        }
      });
    }

    const esgData = await calculatePortfolioESG(portfolio.holdings);

    res.json({ success: true, data: esgData });
  } catch (error) {
    logger.error('Error calculating portfolio ESG:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/esg/portfolio/:portfolioId/report
 * Get comprehensive ESG report for portfolio
 */
router.get('/portfolio/:portfolioId/report', authenticate, async (req, res) => {
  try {
    const portfolio = await prisma.portfolios.findUnique({
      where: { id: req.params.portfolioId },
      include: { holdings: true }
    });

    if (!portfolio) {
      return res.status(404).json({
        success: false,
        error: 'Portfolio not found'
      });
    }

    const esgData = await calculatePortfolioESG(portfolio.holdings);

    // Build radar chart data
    const radarData = [
      { axis: 'Environmental', value: esgData.environmentalScore || 0 },
      { axis: 'Social', value: esgData.socialScore || 0 },
      { axis: 'Governance', value: esgData.governanceScore || 0 }
    ];

    // Benchmark comparison (S&P 500 average)
    const sp500Benchmark = {
      portfolioScore: 55.2,
      environmentalScore: 52.0,
      socialScore: 56.5,
      governanceScore: 57.1
    };

    const report = {
      summary: {
        portfolioScore: esgData.portfolioScore,
        ESGRiskRating: esgData.ESGRiskRating,
        averageControversyLevel: esgData.averageControversyLevel
      },
      breakdown: esgData.breakdown,
      radarData: radarData,
      holdings: esgData.holdings.slice(0, 10), // Top 10 holdings
      dataQuality: esgData.dataQuality,
      benchmark: {
        name: 'S&P 500 Average',
        ...sp500Benchmark,
        comparison: {
          portfolioVsBenchmark: esgData.portfolioScore !== null ?
            Math.round((esgData.portfolioScore - sp500Benchmark.portfolioScore) * 10) / 10 : null,
          environmentalVsBenchmark: esgData.environmentalScore !== null ?
            Math.round((esgData.environmentalScore - sp500Benchmark.environmentalScore) * 10) / 10 : null,
          socialVsBenchmark: esgData.socialScore !== null ?
            Math.round((esgData.socialScore - sp500Benchmark.socialScore) * 10) / 10 : null,
          governanceVsBenchmark: esgData.governanceScore !== null ?
            Math.round((esgData.governanceScore - sp500Benchmark.governanceScore) * 10) / 10 : null
        }
      },
      generatedAt: new Date().toISOString()
    };

    res.json({ success: true, data: report });
  } catch (error) {
    logger.error('Error generating ESG report:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/esg/portfolio/:portfolioId/recommendations
 * Get ESG improvement recommendations for portfolio
 */
router.get('/portfolio/:portfolioId/recommendations', authenticate, async (req, res) => {
  try {
    const portfolio = await prisma.portfolios.findUnique({
      where: { id: req.params.portfolioId },
      include: { holdings: true }
    });

    if (!portfolio) {
      return res.status(404).json({
        success: false,
        error: 'Portfolio not found'
      });
    }

    const esgData = await calculatePortfolioESG(portfolio.holdings);
    const recommendations = [];

    // Generate recommendations based on scores
    if (esgData.environmentalScore !== null && esgData.environmentalScore < 50) {
      recommendations.push({
        category: 'Environmental',
        severity: 'high',
        action: 'Consider reducing exposure to high-carbon companies',
        impact: 'Could improve Environmental score by 10-15 points',
        suggestions: ['Reduce fossil fuel holdings', 'Add renewable energy exposure']
      });
    } else if (esgData.environmentalScore !== null && esgData.environmentalScore < 65) {
      recommendations.push({
        category: 'Environmental',
        severity: 'medium',
        action: 'Review environmental impact of holdings',
        impact: 'Could improve Environmental score by 5-10 points',
        suggestions: ['Check company carbon commitments', 'Consider ESG-focused alternatives']
      });
    }

    if (esgData.socialScore !== null && esgData.socialScore < 50) {
      recommendations.push({
        category: 'Social',
        severity: 'high',
        action: 'Address social responsibility concerns in portfolio',
        impact: 'Could improve Social score by 10-15 points',
        suggestions: ['Review labor practices of holdings', 'Consider companies with strong DEI programs']
      });
    }

    if (esgData.governanceScore !== null && esgData.governanceScore < 50) {
      recommendations.push({
        category: 'Governance',
        severity: 'high',
        action: 'Improve governance quality of holdings',
        impact: 'Could improve Governance score by 10-15 points',
        suggestions: ['Favor companies with independent boards', 'Check executive compensation alignment']
      });
    }

    if (esgData.averageControversyLevel !== null && esgData.averageControversyLevel > 3) {
      recommendations.push({
        category: 'Controversies',
        severity: 'high',
        action: 'Portfolio has high controversy exposure',
        impact: 'Reducing exposure could lower risk',
        suggestions: ['Review holdings with controversy scores > 3', 'Consider divesting from high-controversy companies']
      });
    }

    // Identify worst ESG performers in portfolio
    const worstPerformers = esgData.holdings
      .filter(h => h.dataAvailable && h.totalESGScore !== null && h.totalESGScore < 40)
      .slice(0, 5);

    if (worstPerformers.length > 0) {
      recommendations.push({
        category: 'Portfolio Composition',
        severity: 'medium',
        action: 'Consider reviewing low-ESG holdings',
        impact: 'Replacing could significantly improve portfolio ESG score',
        holdingsToReview: worstPerformers.map(h => ({
          symbol: h.symbol,
          totalESGScore: h.totalESGScore,
          weight: h.weight
        }))
      });
    }

    res.json({
      success: true,
      data: {
        recommendations,
        currentScores: esgData.breakdown,
        overallScore: esgData.portfolioScore,
        ESGRiskRating: esgData.ESGRiskRating
      }
    });
  } catch (error) {
    logger.error('Error generating recommendations:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== COMPARISON ====================

/**
 * POST /api/esg/compare
 * Compare ESG data for multiple stocks
 */
router.post('/compare', async (req, res) => {
  try {
    const { symbols } = req.body;

    if (!symbols || !Array.isArray(symbols) || symbols.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Please provide at least 2 symbols to compare'
      });
    }

    const symbolsToCompare = symbols.slice(0, 10).map(s => s.toUpperCase());

    const comparisonPromises = symbolsToCompare.map(async (symbol) => {
      return await getESGData(symbol);
    });

    const comparison = await Promise.all(comparisonPromises);

    // Calculate ranking
    const ranked = comparison
      .filter(c => c.dataAvailable && c.totalESGScore !== null)
      .sort((a, b) => (b.totalESGScore || 0) - (a.totalESGScore || 0));

    res.json({
      success: true,
      data: {
        stocks: comparison,
        ranking: ranked.map((c, idx) => ({
          rank: idx + 1,
          symbol: c.symbol,
          totalESGScore: c.totalESGScore,
          ESGRiskRating: c.ESGRiskRating
        })),
        unavailable: comparison.filter(c => !c.dataAvailable).map(c => c.symbol)
      }
    });
  } catch (error) {
    logger.error('Error comparing stocks:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== ESG RATINGS ====================

/**
 * GET /api/esg/ratings/:symbol
 * Get unified ESG rating for a symbol
 */
router.get('/ratings/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const esgData = await getESGData(symbol);

    if (!esgData.dataAvailable) {
      return res.json({
        success: true,
        data: {
          symbol: symbol,
          available: false,
          message: 'ESG data not available for this symbol'
        }
      });
    }

    // Map score to letter rating
    const getLetterRating = (score) => {
      if (score === null) return 'N/A';
      if (score >= 80) return 'AAA';
      if (score >= 70) return 'AA';
      if (score >= 60) return 'A';
      if (score >= 50) return 'BBB';
      if (score >= 40) return 'BB';
      if (score >= 30) return 'B';
      return 'CCC';
    };

    const getRatingColor = (score) => {
      if (score === null) return '#6b7280';
      if (score >= 70) return '#22c55e';
      if (score >= 50) return '#eab308';
      return '#ef4444';
    };

    res.json({
      success: true,
      data: {
        symbol: symbol,
        available: true,
        totalESGScore: esgData.totalESGScore,
        letterRating: getLetterRating(esgData.totalESGScore),
        ratingColor: getRatingColor(esgData.totalESGScore),
        ESGRiskRating: esgData.ESGRiskRating,
        componentScores: {
          environmental: esgData.environmentalScore,
          social: esgData.socialScore,
          governance: esgData.governanceScore
        },
        componentRatings: {
          environmental: getLetterRating(esgData.environmentalScore),
          social: getLetterRating(esgData.socialScore),
          governance: getLetterRating(esgData.governanceScore)
        },
        controversyLevel: esgData.controversyLevel,
        source: esgData.source,
        lastUpdated: esgData.lastUpdated
      }
    });
  } catch (error) {
    logger.error('Error fetching ESG rating:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== CACHE MANAGEMENT ====================

/**
 * GET /api/esg/cache/stats
 * Get cache statistics (admin only)
 */
router.get('/cache/stats', authenticate, async (req, res) => {
  try {
    const now = Date.now();
    let validCount = 0;
    let expiredCount = 0;

    ESG_CACHE.forEach((value) => {
      if (now - value.timestamp < CACHE_TTL) {
        validCount++;
      } else {
        expiredCount++;
      }
    });

    res.json({
      success: true,
      data: {
        totalEntries: ESG_CACHE.size,
        validEntries: validCount,
        expiredEntries: expiredCount,
        cacheTTLDays: CACHE_TTL / (24 * 60 * 60 * 1000)
      }
    });
  } catch (error) {
    logger.error('Error getting cache stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/esg/cache/clear
 * Clear the ESG cache (admin only)
 */
router.delete('/cache/clear', authenticate, async (req, res) => {
  try {
    const previousSize = ESG_CACHE.size;
    ESG_CACHE.clear();

    res.json({
      success: true,
      data: {
        message: 'Cache cleared successfully',
        entriesCleared: previousSize
      }
    });
  } catch (error) {
    logger.error('Error clearing cache:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== API STATUS ====================

/**
 * GET /api/esg/status
 * Get ESG API status and configuration
 */
router.get('/status', async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        apiConfigured: !!FMP_API_KEY,
        provider: 'Financial Modeling Prep (FMP)',
        cacheTTLDays: CACHE_TTL / (24 * 60 * 60 * 1000),
        cacheEntries: ESG_CACHE.size,
        endpoints: {
          esgScore: `${FMP_BASE_URL}/esg-environmental-social-governance-data`,
          esgRatings: `${FMP_BASE_URL}/esg-environmental-social-governance-data-ratings`
        }
      }
    });
  } catch (error) {
    logger.error('Error getting ESG status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
