/**
 * ETF Alternatives Service
 * Provides wash-sale-safe ETF alternatives for tax-loss harvesting
 */

const logger = require('../utils/logger');

// Fallback sector-to-ETF mappings if database is empty
const SECTOR_ETF_MAP = {
  'Technology': { primary: 'XLK', alternatives: ['QQQ', 'VGT', 'SOXX', 'SMH', 'IGV'] },
  'Health Care': { primary: 'XLV', alternatives: ['VHT', 'IBB', 'XBI', 'IHI', 'ARKG'] },
  'Healthcare': { primary: 'XLV', alternatives: ['VHT', 'IBB', 'XBI', 'IHI'] },
  'Financials': { primary: 'XLF', alternatives: ['VFH', 'KRE', 'KBE', 'IAI', 'IYF'] },
  'Financial Services': { primary: 'XLF', alternatives: ['VFH', 'KRE', 'KBE'] },
  'Consumer Discretionary': { primary: 'XLY', alternatives: ['VCR', 'FXD', 'RTH', 'FDIS', 'IBUY'] },
  'Consumer Cyclical': { primary: 'XLY', alternatives: ['VCR', 'FXD', 'RTH'] },
  'Communication Services': { primary: 'XLC', alternatives: ['VOX', 'FCOM', 'IYZ', 'NXTG'] },
  'Industrials': { primary: 'XLI', alternatives: ['VIS', 'IYJ', 'FIDU', 'ITA', 'XAR'] },
  'Consumer Staples': { primary: 'XLP', alternatives: ['VDC', 'FSTA', 'IYK', 'PBJ'] },
  'Consumer Defensive': { primary: 'XLP', alternatives: ['VDC', 'FSTA', 'IYK'] },
  'Energy': { primary: 'XLE', alternatives: ['VDE', 'OIH', 'XOP', 'IEO', 'FCG'] },
  'Utilities': { primary: 'XLU', alternatives: ['VPU', 'IDU', 'FUTY', 'JXI'] },
  'Real Estate': { primary: 'XLRE', alternatives: ['VNQ', 'IYR', 'RWR', 'SCHH', 'USRT'] },
  'Materials': { primary: 'XLB', alternatives: ['VAW', 'IYM', 'FMAT', 'MXI', 'GNR'] },
  'Basic Materials': { primary: 'XLB', alternatives: ['VAW', 'IYM', 'FMAT'] }
};

// Common stock to ETF mappings for major holdings
const STOCK_ETF_FALLBACK = {
  'AAPL': { sector: 'Technology', primary: 'XLK', thematic: ['QQQ', 'VGT', 'FTEC', 'IYW'] },
  'MSFT': { sector: 'Technology', primary: 'XLK', thematic: ['QQQ', 'VGT', 'IGV', 'WCLD'] },
  'GOOGL': { sector: 'Communication Services', primary: 'XLC', thematic: ['VOX', 'FCOM', 'QQQ'] },
  'GOOG': { sector: 'Communication Services', primary: 'XLC', thematic: ['VOX', 'FCOM', 'QQQ'] },
  'AMZN': { sector: 'Consumer Discretionary', primary: 'XLY', thematic: ['QQQ', 'IBUY', 'FDN', 'VCR'] },
  'NVDA': { sector: 'Technology', primary: 'XLK', thematic: ['SMH', 'SOXX', 'QQQ', 'AIQ'] },
  'META': { sector: 'Communication Services', primary: 'XLC', thematic: ['SOCL', 'FCOM', 'QQQ'] },
  'TSLA': { sector: 'Consumer Discretionary', primary: 'XLY', thematic: ['DRIV', 'KARS', 'IDRV', 'QQQ'] },
  'BRK.B': { sector: 'Financials', primary: 'XLF', thematic: ['VFH', 'IYF', 'FNCL'] },
  'UNH': { sector: 'Health Care', primary: 'XLV', thematic: ['VHT', 'IHI', 'FHLC'] },
  'JPM': { sector: 'Financials', primary: 'XLF', thematic: ['VFH', 'KBE', 'KRE', 'IYF'] },
  'V': { sector: 'Financials', primary: 'XLF', thematic: ['IPAY', 'FINX', 'VFH'] },
  'MA': { sector: 'Financials', primary: 'XLF', thematic: ['IPAY', 'FINX', 'VFH'] },
  'PG': { sector: 'Consumer Staples', primary: 'XLP', thematic: ['VDC', 'FSTA', 'IYK'] },
  'JNJ': { sector: 'Health Care', primary: 'XLV', thematic: ['VHT', 'FHLC', 'IHI'] },
  'HD': { sector: 'Consumer Discretionary', primary: 'XLY', thematic: ['VCR', 'ITB', 'XHB'] },
  'KO': { sector: 'Consumer Staples', primary: 'XLP', thematic: ['VDC', 'PBJ', 'FSTA'] },
  'PEP': { sector: 'Consumer Staples', primary: 'XLP', thematic: ['VDC', 'PBJ', 'FSTA'] },
  'ABBV': { sector: 'Health Care', primary: 'XLV', thematic: ['VHT', 'IBB', 'XBI'] },
  'CVX': { sector: 'Energy', primary: 'XLE', thematic: ['VDE', 'OIH', 'XOP'] },
  'XOM': { sector: 'Energy', primary: 'XLE', thematic: ['VDE', 'OIH', 'XOP'] },
  'DIS': { sector: 'Communication Services', primary: 'XLC', thematic: ['VOX', 'FCOM', 'PEJ'] },
  'NFLX': { sector: 'Communication Services', primary: 'XLC', thematic: ['VOX', 'FCOM', 'FDN', 'SOCL'] },
  'CRM': { sector: 'Technology', primary: 'XLK', thematic: ['IGV', 'WCLD', 'CLOU', 'SKYY'] },
  'ADBE': { sector: 'Technology', primary: 'XLK', thematic: ['IGV', 'WCLD', 'FDN', 'VGT'] },
  'INTC': { sector: 'Technology', primary: 'XLK', thematic: ['SMH', 'SOXX', 'PSI', 'VGT'] },
  'AMD': { sector: 'Technology', primary: 'XLK', thematic: ['SMH', 'SOXX', 'PSI', 'AIQ'] }
};

class ETFAlternativesService {
  constructor() {
    this.sectorMappings = null;
    this.stockMappings = null;
  }

  /**
   * Load sector mappings from database or use fallback
   */
  async loadSectorMappings() {
    if (this.sectorMappings) return this.sectorMappings;

    // Use hardcoded mappings (comprehensive and reliable)
    this.sectorMappings = SECTOR_ETF_MAP;
    logger.info('Loaded ETF sector mappings');

    return this.sectorMappings;
  }

  /**
   * Load stock-specific mappings from database or use fallback
   */
  async loadStockMappings() {
    if (this.stockMappings) return this.stockMappings;

    // Use hardcoded mappings (comprehensive and reliable)
    this.stockMappings = STOCK_ETF_FALLBACK;
    logger.info('Loaded stock ETF mappings');

    return this.stockMappings;
  }

  /**
   * Get ETF alternatives for a specific stock symbol
   * @param {string} symbol - Stock symbol
   * @param {string} sector - Stock sector (optional, will be looked up if not provided)
   * @returns {Object} ETF alternatives with recommendations
   */
  async getAlternatives(symbol, sector = null) {
    await this.loadSectorMappings();
    await this.loadStockMappings();

    const upperSymbol = symbol.toUpperCase();
    const result = {
      symbol: upperSymbol,
      sector: sector,
      recommended: null,
      sectorETF: null,
      thematicETFs: [],
      allAlternatives: [],
      washSaleSafe: true,
      notes: []
    };

    // Check for direct stock mapping first
    const stockMapping = this.stockMappings[upperSymbol];
    if (stockMapping) {
      result.sector = stockMapping.sector || sector;
      result.recommended = stockMapping.primary;
      result.sectorETF = stockMapping.sectorETF || stockMapping.primary;
      result.thematicETFs = stockMapping.thematic || [];
      result.correlationScore = stockMapping.correlationScore;
      result.allAlternatives = [
        stockMapping.primary,
        ...(stockMapping.thematic || [])
      ].filter((v, i, a) => a.indexOf(v) === i); // unique values
      result.notes.push(`Direct mapping found for ${upperSymbol}`);
    }

    // If no direct mapping or need sector alternatives, look up by sector
    const effectiveSector = result.sector || sector;
    if (effectiveSector && this.sectorMappings[effectiveSector]) {
      const sectorMapping = this.sectorMappings[effectiveSector];

      if (!result.recommended) {
        result.recommended = sectorMapping.primary;
      }
      if (!result.sectorETF) {
        result.sectorETF = sectorMapping.primary;
      }

      // Add sector alternatives to the list
      const sectorAlts = [sectorMapping.primary, ...sectorMapping.alternatives];
      result.allAlternatives = [
        ...result.allAlternatives,
        ...sectorAlts
      ].filter((v, i, a) => a.indexOf(v) === i);

      result.notes.push(`Sector (${effectiveSector}) alternatives included`);
    }

    // If still no alternatives, provide broad market ETFs
    if (result.allAlternatives.length === 0) {
      result.recommended = 'VTI';
      result.allAlternatives = ['VTI', 'SPY', 'VOO', 'IVV', 'SCHB'];
      result.notes.push('No specific mapping found, using broad market ETFs');
    }

    return result;
  }

  /**
   * Get ETFs for a specific sector
   * @param {string} sector - Sector name
   * @returns {Object} Primary ETF and alternatives for the sector
   */
  async getETFsForSector(sector) {
    await this.loadSectorMappings();

    const mapping = this.sectorMappings[sector];
    if (!mapping) {
      // Try case-insensitive match
      const sectorLower = sector.toLowerCase();
      for (const [key, value] of Object.entries(this.sectorMappings)) {
        if (key.toLowerCase() === sectorLower) {
          return {
            sector: key,
            primary: value.primary,
            alternatives: value.alternatives,
            correlationScore: value.correlationScore || 0.85
          };
        }
      }

      return {
        sector,
        primary: 'VTI',
        alternatives: ['SPY', 'VOO'],
        correlationScore: 0.5,
        note: 'Sector not found, returning broad market ETF'
      };
    }

    return {
      sector,
      primary: mapping.primary,
      alternatives: mapping.alternatives,
      correlationScore: mapping.correlationScore || 0.85
    };
  }

  /**
   * Check if two securities are substantially identical (wash sale risk)
   * @param {string} symbol1 - First security symbol
   * @param {string} symbol2 - Second security symbol
   * @returns {Object} Wash sale risk assessment
   */
  async checkWashSaleRisk(symbol1, symbol2) {
    const s1 = symbol1.toUpperCase();
    const s2 = symbol2.toUpperCase();

    // Same symbol is always a wash sale
    if (s1 === s2) {
      return {
        isRisk: true,
        riskLevel: 'high',
        reason: 'Same security',
        recommendation: 'Wait 31 days or use a different sector ETF'
      };
    }

    // Check if both are ETFs tracking similar indices
    const trackingSameIndex = this.checkSameIndexTracking(s1, s2);
    if (trackingSameIndex.isSame) {
      return {
        isRisk: true,
        riskLevel: 'high',
        reason: trackingSameIndex.reason,
        recommendation: 'Use ETF from a different index family'
      };
    }

    // Stock and its sector ETF - generally safe but review
    await this.loadStockMappings();
    const stockMapping = this.stockMappings[s1] || this.stockMappings[s2];
    if (stockMapping) {
      const isStockS1 = !!this.stockMappings[s1];
      const etfSymbol = isStockS1 ? s2 : s1;

      if (stockMapping.primary === etfSymbol) {
        return {
          isRisk: false,
          riskLevel: 'low',
          reason: 'Stock and sector ETF are not substantially identical',
          recommendation: 'Generally safe, but consult tax advisor for large positions'
        };
      }
    }

    return {
      isRisk: false,
      riskLevel: 'none',
      reason: 'Securities appear to be different',
      recommendation: 'Safe to proceed with replacement'
    };
  }

  /**
   * Check if two ETFs track substantially the same index
   */
  checkSameIndexTracking(etf1, etf2) {
    // ETFs that track the same or very similar indices
    const sameIndexGroups = [
      ['SPY', 'IVV', 'VOO', 'SPLG'], // S&P 500
      ['QQQ', 'QQQM', 'ONEQ'],        // Nasdaq 100
      ['VTI', 'ITOT', 'SCHB', 'SPTM'], // Total Market
      ['VEA', 'IEFA', 'EFA', 'SCHF'],  // Developed International
      ['VWO', 'IEMG', 'EEM', 'SCHE'],  // Emerging Markets
      ['AGG', 'BND', 'SCHZ'],          // Total Bond
      ['XLK', 'VGT', 'FTEC'],          // Tech Sector
      ['XLF', 'VFH', 'FNCL'],          // Financial Sector
      ['XLE', 'VDE', 'FENY'],          // Energy Sector
      ['XLV', 'VHT', 'FHLC'],          // Healthcare Sector
      ['XLY', 'VCR', 'FDIS'],          // Consumer Disc Sector
      ['XLP', 'VDC', 'FSTA'],          // Consumer Staples Sector
      ['XLI', 'VIS', 'FIDU'],          // Industrial Sector
      ['XLU', 'VPU', 'FUTY'],          // Utilities Sector
      ['XLB', 'VAW', 'FMAT'],          // Materials Sector
      ['XLRE', 'VNQ', 'FREL']          // Real Estate Sector
    ];

    for (const group of sameIndexGroups) {
      if (group.includes(etf1) && group.includes(etf2)) {
        return {
          isSame: true,
          reason: `Both ${etf1} and ${etf2} track substantially the same index`
        };
      }
    }

    return { isSame: false };
  }

  /**
   * Get all available sector mappings
   */
  async getAllSectorMappings() {
    await this.loadSectorMappings();
    return this.sectorMappings;
  }

  /**
   * Recommend best replacement for tax-loss harvesting
   * @param {string} symbol - Symbol being sold
   * @param {string} sector - Sector of the symbol
   * @param {Array} excludeSymbols - Symbols to exclude (already owned)
   * @returns {Object} Best replacement recommendation
   */
  async recommendReplacement(symbol, sector, excludeSymbols = []) {
    const alternatives = await this.getAlternatives(symbol, sector);
    const excluded = new Set(excludeSymbols.map(s => s.toUpperCase()));
    excluded.add(symbol.toUpperCase());

    // Filter out excluded symbols
    const validAlternatives = alternatives.allAlternatives.filter(
      alt => !excluded.has(alt.toUpperCase())
    );

    if (validAlternatives.length === 0) {
      return {
        symbol: symbol,
        recommendation: 'VTI',
        type: 'broad_market',
        reason: 'All sector alternatives excluded, recommending broad market ETF',
        washSaleRisk: 'none',
        alternatives: ['VTI', 'VOO', 'SPY'].filter(s => !excluded.has(s))
      };
    }

    const recommended = validAlternatives[0];
    const washSaleCheck = await this.checkWashSaleRisk(symbol, recommended);

    return {
      symbol: symbol,
      recommendation: recommended,
      type: recommended === alternatives.sectorETF ? 'sector_etf' : 'thematic_etf',
      reason: `Best wash-sale-safe alternative for ${symbol}`,
      washSaleRisk: washSaleCheck.riskLevel,
      alternatives: validAlternatives.slice(1, 4),
      correlationScore: alternatives.correlationScore || 0.8
    };
  }
}

module.exports = new ETFAlternativesService();
