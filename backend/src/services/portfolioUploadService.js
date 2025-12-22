// Use Prisma for PostgreSQL on Railway, SQLite compat as fallback
const { prisma } = require('../db/simpleDb');
const db = require('../db/sqliteCompat');
const path = require('path');
const fs = require('fs');
const csv = require('csv-parser');
const XLSX = require('xlsx');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const MarketDataService = require('./marketData');

// Check if we're using PostgreSQL (Railway)
const isPostgres = process.env.DATABASE_TYPE === 'postgresql' ||
                   (process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith('postgres'));


class PortfolioUploadService {
  /**
   * Parse uploaded portfolio file and extract holdings
   * @param {string} filePath - Path to uploaded file
   * @param {string} fileFormat - File format (csv, xlsx, json)
   * @returns {Promise<Array>} - Array of holdings
   */
  static async parsePortfolioFile(filePath, fileFormat) {
    try {
      switch (fileFormat.toLowerCase()) {
        case 'csv':
          return await this.parseCSV(filePath);
        case 'xlsx':
        case 'xls':
          return await this.parseExcel(filePath);
        case 'json':
          return await this.parseJSON(filePath);
        default:
          throw new Error(`Unsupported file format: ${fileFormat}`);
      }
    } catch (error) {
      logger.error('Error parsing portfolio file:', error);
      throw error;
    }
  }

  /**
   * Parse CSV file
   * Expected columns: symbol, quantity, costBasis (or purchasePrice), purchaseDate (optional)
   */
  static async parseCSV(filePath) {
    return new Promise((resolve, reject) => {
      const holdings = [];

      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (row) => {
          try {
            const holding = this.normalizeHoldingData(row);
            if (holding) {
              holdings.push(holding);
            }
          } catch (error) {
            logger.warn('Skipping invalid row:', row, error.message);
          }
        })
        .on('end', () => {
          logger.info(`Parsed ${holdings.length} holdings from CSV`);
          resolve(holdings);
        })
        .on('error', (error) => {
          reject(error);
        });
    });
  }

  /**
   * Parse Excel file
   */
  static async parseExcel(filePath) {
    try {
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0]; // Use first sheet
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet);

      const holdings = data
        .map(row => {
          try {
            return this.normalizeHoldingData(row);
          } catch (error) {
            logger.warn('Skipping invalid row:', row, error.message);
            return null;
          }
        })
        .filter(h => h !== null);

      logger.info(`Parsed ${holdings.length} holdings from Excel`);
      return holdings;
    } catch (error) {
      logger.error('Error parsing Excel file:', error);
      throw error;
    }
  }

  /**
   * Parse JSON file
   * Expected format: { "holdings": [ { "symbol": "AAPL", "quantity": 10, ... } ] }
   */
  static async parseJSON(filePath) {
    try {
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(fileContent);

      // Handle both array and object with holdings property
      const holdingsArray = Array.isArray(data) ? data : (data.holdings || []);

      const holdings = holdingsArray
        .map(row => {
          try {
            return this.normalizeHoldingData(row);
          } catch (error) {
            logger.warn('Skipping invalid holding:', row, error.message);
            return null;
          }
        })
        .filter(h => h !== null);

      logger.info(`Parsed ${holdings.length} holdings from JSON`);
      return holdings;
    } catch (error) {
      logger.error('Error parsing JSON file:', error);
      throw error;
    }
  }

  /**
   * Parse portfolio from buffer (for memory storage / Railway compatibility)
   * @param {Buffer} buffer - File buffer
   * @param {string} fileFormat - File format (csv, xlsx, json)
   * @returns {Promise<Array>} - Array of holdings
   */
  static async parsePortfolioFromBuffer(buffer, fileFormat) {
    try {
      switch (fileFormat.toLowerCase()) {
        case 'csv':
          return await this.parseCSVFromBuffer(buffer);
        case 'xlsx':
        case 'xls':
          return await this.parseExcelFromBuffer(buffer);
        case 'json':
          return await this.parseJSONFromBuffer(buffer);
        default:
          throw new Error(`Unsupported file format: ${fileFormat}`);
      }
    } catch (error) {
      logger.error('Error parsing portfolio from buffer:', error);
      throw error;
    }
  }

  /**
   * Parse CSV from buffer
   */
  static async parseCSVFromBuffer(buffer) {
    return new Promise((resolve, reject) => {
      const holdings = [];
      const csvString = buffer.toString('utf-8');
      const lines = csvString.split('\n');

      if (lines.length === 0) {
        resolve([]);
        return;
      }

      // Parse header
      const header = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));

      // Parse data rows
      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;

        const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
        const row = {};
        header.forEach((key, idx) => {
          row[key] = values[idx] || '';
        });

        try {
          const holding = this.normalizeHoldingData(row);
          if (holding) holdings.push(holding);
        } catch (error) {
          logger.warn('Skipping invalid CSV row:', { row: i, error: error.message });
        }
      }

      logger.info(`Parsed ${holdings.length} holdings from CSV buffer`);
      resolve(holdings);
    });
  }

  /**
   * Parse Excel from buffer
   */
  static async parseExcelFromBuffer(buffer) {
    try {
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet);

      const holdings = data
        .map(row => {
          try {
            return this.normalizeHoldingData(row);
          } catch (error) {
            logger.warn('Skipping invalid row:', { error: error.message });
            return null;
          }
        })
        .filter(h => h !== null);

      logger.info(`Parsed ${holdings.length} holdings from Excel buffer`);
      return holdings;
    } catch (error) {
      logger.error('Error parsing Excel from buffer:', error);
      throw error;
    }
  }

  /**
   * Parse JSON from buffer
   */
  static async parseJSONFromBuffer(buffer) {
    try {
      const fileContent = buffer.toString('utf-8');
      const data = JSON.parse(fileContent);

      const holdingsArray = Array.isArray(data) ? data : (data.holdings || []);

      const holdings = holdingsArray
        .map(row => {
          try {
            return this.normalizeHoldingData(row);
          } catch (error) {
            logger.warn('Skipping invalid JSON holding:', error.message);
            return null;
          }
        })
        .filter(h => h !== null);

      logger.info(`Parsed ${holdings.length} holdings from JSON buffer`);
      return holdings;
    } catch (error) {
      logger.error('Error parsing JSON from buffer:', error);
      throw error;
    }
  }

  /**
   * Normalize holding data from various formats
   * Handles different column names from Fidelity, Schwab, TD Ameritrade, etc.
   * Sample columns: Description, Symbol, Quantity, Price ($), Value ($), Principal ($)*, NFS Cost ($), etc.
   */
  static normalizeHoldingData(row) {
    // Skip header/account rows that don't have a valid symbol
    // Fidelity format: Symbol column contains ticker
    const symbol = (
      row.Symbol ||
      row.symbol ||
      row.Ticker ||
      row.ticker ||
      row.SYMBOL ||
      row.TICKER
    )?.toString().trim().toUpperCase();

    // Skip rows without valid symbols (like account header rows)
    if (!symbol || symbol.length > 10 || symbol.includes(' ') || symbol.includes('(')) {
      throw new Error('Missing or invalid symbol');
    }

    // Skip Total rows
    if (symbol === 'TOTAL' || row.Description?.toLowerCase().includes('total')) {
      throw new Error('Skipping total row');
    }

    // Skip cash sweep accounts (Fidelity SPAXX, FCASH, QPRMQ, etc.)
    const cashSweepSymbols = ['SPAXX', 'FCASH', 'QPRMQ', 'FDRXX', 'FZFXX', 'SPRXX', 'VMFXX', 'SWVXX'];
    if (cashSweepSymbols.includes(symbol)) {
      throw new Error(`Skipping cash sweep account: ${symbol}`);
    }

    // Skip options (symbols with numbers in them, or starting with call/put indicators)
    if (/^\d/.test(symbol) || symbol.length > 6 && /\d/.test(symbol)) {
      throw new Error(`Skipping options contract: ${symbol}`);
    }

    // Extract quantity (Fidelity uses "Quantity")
    const quantity = parseFloat(
      row.Quantity ||
      row.quantity ||
      row.Shares ||
      row.shares ||
      row.QUANTITY ||
      row.SHARES ||
      row['# of Shares'] ||
      0
    );

    if (!quantity || quantity <= 0 || isNaN(quantity)) {
      throw new Error(`Invalid quantity for ${symbol}: ${quantity}`);
    }

    // Extract cost basis - Fidelity uses "Principal ($)*" or "NFS Cost ($)"
    // These are TOTAL cost, so we need to divide by quantity to get per-share cost
    // Use flexible column matching to handle special characters
    const findColumnValue = (row, patterns) => {
      for (const key of Object.keys(row)) {
        const keyLower = key.toLowerCase().replace(/[^a-z]/g, '');
        for (const pattern of patterns) {
          if (keyLower.includes(pattern)) {
            return parseFloat(row[key]) || 0;
          }
        }
      }
      return 0;
    };

    const principalCost = findColumnValue(row, ['principal']);
    const nfsCost = findColumnValue(row, ['nfscost']);
    const directCostBasis = parseFloat(
      row.costBasis ||
      row.cost_basis ||
      row.CostBasis ||
      row['Cost Basis'] ||
      row['Avg Cost'] ||
      row.avgCost ||
      0
    ) || findColumnValue(row, ['costbasis', 'avgcost']);

    let finalCostBasis;

    // If we have direct cost basis (per share), use it
    if (directCostBasis > 0) {
      finalCostBasis = directCostBasis;
    }
    // Calculate per-share cost from total cost
    else if (principalCost > 0 && quantity > 0) {
      finalCostBasis = principalCost / quantity;
      logger.info(`Calculated cost basis for ${symbol}: $${finalCostBasis.toFixed(2)} (Total: $${principalCost} / ${quantity} shares)`);
    }
    else if (nfsCost > 0 && quantity > 0) {
      finalCostBasis = nfsCost / quantity;
      logger.info(`Calculated cost basis from NFS for ${symbol}: $${finalCostBasis.toFixed(2)}`);
    }
    // Fallback to current price if available
    else {
      const currentPrice = parseFloat(row['Price ($)'] || row.Price || row.price || 0) || findColumnValue(row, ['price']);
      if (currentPrice > 0) {
        finalCostBasis = currentPrice;
        logger.warn(`Using current price as cost basis for ${symbol}: $${finalCostBasis.toFixed(2)}`);
      }
    }

    if (!finalCostBasis || finalCostBasis <= 0 || isNaN(finalCostBasis)) {
      throw new Error(`Invalid cost basis for ${symbol}: ${finalCostBasis}`);
    }

    // Extract purchase date (Fidelity: "Initial Purchase Date" is Excel serial)
    let purchaseDate = row['Initial Purchase Date'] ||
                       row.purchaseDate ||
                       row.purchase_date ||
                       row.PurchaseDate ||
                       row.Date ||
                       row.date ||
                       row.PURCHASE_DATE;

    // Convert Excel serial date if needed (Excel dates are numbers > 30000)
    if (typeof purchaseDate === 'number' && purchaseDate > 30000) {
      purchaseDate = this.excelDateToJSDate(purchaseDate).toISOString();
    } else if (purchaseDate && typeof purchaseDate === 'string') {
      try {
        const parsed = new Date(purchaseDate);
        if (!isNaN(parsed.getTime())) {
          purchaseDate = parsed.toISOString();
        } else {
          purchaseDate = new Date().toISOString();
        }
      } catch (e) {
        logger.warn(`Invalid purchase date for ${symbol}: ${purchaseDate}`);
        purchaseDate = new Date().toISOString();
      }
    } else {
      purchaseDate = new Date().toISOString();
    }

    // Extract asset type (Fidelity: "Asset Type" = Equity, Mutual Fund, etc.)
    const assetType = row['Asset Type'] || row.asset_type || row.type || row.Type || 'Equity';
    const assetCategory = row['Asset Category'] || row.category || '';

    // Get company name from Description column
    const description = row.Description || row.description || row.Name || row.name || symbol;

    // Get current price if available
    const currentPrice = parseFloat(row['Price ($)'] || row.Price || row.price || 0);
    const currentValue = parseFloat(row['Value ($)'] || row.Value || row.value || 0);

    // Get gain/loss data
    const gainLossDollars = parseFloat(row['Principal G/L ($)*'] || row['NFS G/L ($)'] || 0);
    const gainLossPercent = parseFloat(row['Principal G/L (%)*'] || row['NFS G/L (%)'] || 0);

    // Get dividend info
    const annualIncome = parseFloat(row['Est Annual Income ($)'] || 0);
    const dividendYield = parseFloat(row['Current Yld/Dist Rate (%)'] || 0);

    // Determine asset type string
    let normalizedType = 'stock';
    const assetTypeLower = assetType.toLowerCase();
    if (assetTypeLower.includes('mutual fund')) {
      normalizedType = 'mutual_fund';
    } else if (assetTypeLower.includes('etf')) {
      normalizedType = 'etf';
    } else if (assetTypeLower.includes('bond')) {
      normalizedType = 'bond';
    } else if (assetTypeLower.includes('cash')) {
      normalizedType = 'cash';
    }

    return {
      symbol,
      name: description,
      quantity,
      costBasis: finalCostBasis,
      purchaseDate,
      type: normalizedType,
      category: assetCategory,
      // Store original data for reference
      metadata: {
        originalPrice: currentPrice,
        originalValue: currentValue,
        assetType: assetType,
        assetCategory: assetCategory,
        gainLossDollars: gainLossDollars,
        gainLossPercent: gainLossPercent,
        annualIncome: annualIncome,
        dividendYield: dividendYield,
        accountType: row['Account Type'] || '',
        dividendInstructions: row['Dividend Instructions'] || '',
        capGainInstructions: row['Cap Gain Instructions'] || ''
      }
    };
  }

  /**
   * Convert Excel serial date to JavaScript Date
   */
  static excelDateToJSDate(serial) {
    const utcDays = Math.floor(serial - 25569);
    const utcValue = utcDays * 86400;
    const dateInfo = new Date(utcValue * 1000);
    return new Date(dateInfo.getFullYear(), dateInfo.getMonth(), dateInfo.getDate());
  }

  /**
   * Create uploaded portfolio record
   */
  static createUploadRecord(userId, filename, fileFormat) {
    const uploadId = uuidv4();

    const stmt = db.prepare(`
      INSERT INTO uploaded_portfolios (
        id, user_id, original_filename, file_format,
        upload_date, status
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      uploadId,
      userId,
      filename,
      fileFormat,
      new Date().toISOString(),
      'processing'
    );

    logger.info(`Created upload record: ${uploadId}`);
    return uploadId;
  }

  /**
   * Update upload record status
   */
  static updateUploadStatus(uploadId, status, options = {}) {
    const {
      portfolioId,
      totalHoldings,
      totalValue,
      errorMessage,
      metadata
    } = options;

    const stmt = db.prepare(`
      UPDATE uploaded_portfolios
      SET status = ?,
          portfolio_id = COALESCE(?, portfolio_id),
          total_holdings = COALESCE(?, total_holdings),
          total_value = COALESCE(?, total_value),
          error_message = ?,
          metadata = COALESCE(?, metadata)
      WHERE id = ?
    `);

    stmt.run(
      status,
      portfolioId || null,
      totalHoldings || null,
      totalValue || null,
      errorMessage || null,
      metadata ? JSON.stringify(metadata) : null,
      uploadId
    );

    logger.info(`Updated upload ${uploadId} status to: ${status}`);
  }

  /**
   * Process uploaded portfolio and create holdings
   */
  static async processUpload(uploadId, userId, filePath, fileFormat, portfolioName) {
    try {
      // Parse the file
      const holdings = await this.parsePortfolioFile(filePath, fileFormat);

      if (holdings.length === 0) {
        throw new Error('No valid holdings found in file');
      }

      // Create portfolio
      const portfolioId = uuidv4();
      const createPortfolio = db.prepare(`
        INSERT INTO portfolios (id, user_id, name, description, created_at)
        VALUES (?, ?, ?, ?, ?)
      `);

      // Make portfolio name unique by appending timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const uniquePortfolioName = portfolioName
        ? `${portfolioName} (${timestamp})`
        : `Uploaded Portfolio - ${timestamp}`;

      createPortfolio.run(
        portfolioId,
        userId,
        uniquePortfolioName,
        `Uploaded from ${fileFormat.toUpperCase()} file`,
        new Date().toISOString()
      );

      logger.info(`Created portfolio: ${portfolioId}`);

      // Fetch current market prices for all symbols
      const symbols = holdings.map(h => h.symbol);
      const quotesMap = await MarketDataService.getQuotes(symbols);

      const prices = holdings.map(h => {
        const quote = quotesMap[h.symbol];
        if (quote && quote.price) {
          logger.info(`Fetched price for ${h.symbol}: $${quote.price}`);
          return quote;
        } else {
          logger.warn(`Failed to fetch price for ${h.symbol}`);
          return null;
        }
      });

      // Insert holdings and tax lots
      const insertHolding = db.prepare(`
        INSERT INTO holdings (
          id, portfolio_id, symbol, shares, avg_cost_basis, asset_type, name
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      const insertTaxLot = db.prepare(`
        INSERT INTO tax_lots (
          id, holding_id, shares, cost_basis, purchase_date
        ) VALUES (?, ?, ?, ?, ?)
      `);

      let totalValue = 0;
      let successfulHoldings = 0;
      const metadata = {
        originalHoldingsCount: holdings.length,
        pricesFetched: 0,
        pricesFailed: 0,
        taxLotsCreated: 0
      };

      for (let i = 0; i < holdings.length; i++) {
        const holding = holdings[i];
        const priceData = prices[i];
        const currentPrice = priceData?.price || holding.costBasis; // Fallback to cost basis

        if (priceData) {
          metadata.pricesFetched++;
        } else {
          metadata.pricesFailed++;
        }

        try {
          const holdingId = uuidv4();

          // Use name from parsed data, fallback to market data, then symbol
          const stockName = holding.name || priceData?.name || holding.symbol;

          // Insert holding
          insertHolding.run(
            holdingId,
            portfolioId,
            holding.symbol,
            holding.quantity, // This is the shares value
            holding.costBasis, // This is avg_cost_basis value
            holding.type || 'stock', // This is asset_type
            stockName // Stock name from file or API
          );

          // Create tax lot with purchase date
          try {
            insertTaxLot.run(
              uuidv4(),
              holdingId,
              holding.quantity,
              holding.costBasis,
              holding.purchaseDate
            );
            metadata.taxLotsCreated++;
            logger.info(`Created tax lot for ${holding.symbol}: ${holding.quantity} shares @ $${holding.costBasis} on ${holding.purchaseDate}`);
          } catch (taxLotError) {
            logger.warn(`Failed to create tax lot for ${holding.symbol}:`, taxLotError.message);
          }

          totalValue += currentPrice * holding.quantity;
          successfulHoldings++;
        } catch (error) {
          logger.error(`Failed to insert holding ${holding.symbol}:`, error.message);
          metadata[`error_${holding.symbol}`] = error.message;
        }
      }

      // Update upload record
      this.updateUploadStatus(uploadId, 'completed', {
        portfolioId,
        totalHoldings: successfulHoldings,
        totalValue,
        metadata
      });

      // Create initial snapshot
      await this.createPortfolioSnapshot(portfolioId);

      logger.info(`Upload ${uploadId} processed successfully: ${successfulHoldings} holdings, $${totalValue.toFixed(2)} total value`);

      return {
        success: true,
        portfolioId,
        uploadId,
        totalHoldings: successfulHoldings,
        totalValue,
        metadata
      };

    } catch (error) {
      logger.error(`Upload ${uploadId} failed:`, error);

      this.updateUploadStatus(uploadId, 'failed', {
        errorMessage: error.message
      });

      throw error;
    } finally {
      // Clean up uploaded file
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          logger.info(`Deleted uploaded file: ${filePath}`);
        }
      } catch (cleanupError) {
        logger.warn('Failed to delete uploaded file:', cleanupError);
      }
    }
  }

  /**
   * Process uploaded portfolio from buffer (Railway-compatible)
   * Uses memory storage instead of disk
   * Uses Prisma for PostgreSQL on Railway, SQLite for local
   */
  static async processUploadFromBuffer(uploadId, userId, buffer, fileFormat, portfolioName, existingPortfolioId = null) {
    try {
      // Parse the buffer
      const holdings = await this.parsePortfolioFromBuffer(buffer, fileFormat);

      if (holdings.length === 0) {
        throw new Error('No valid holdings found in file');
      }

      logger.info(`Parsed ${holdings.length} holdings from ${fileFormat} file`);

      // Use Prisma for PostgreSQL (Railway), SQLite for local
      if (isPostgres) {
        return await this.processUploadWithPrisma(uploadId, userId, holdings, fileFormat, portfolioName, existingPortfolioId);
      } else {
        return await this.processUploadWithSQLite(uploadId, userId, holdings, fileFormat, portfolioName, existingPortfolioId);
      }

    } catch (error) {
      logger.error(`Upload ${uploadId} failed:`, error);
      throw error;
    }
  }

  /**
   * Process upload using Prisma (for PostgreSQL on Railway)
   */
  static async processUploadWithPrisma(uploadId, userId, holdings, fileFormat, portfolioName, existingPortfolioId = null) {
    let portfolioId = existingPortfolioId;
    let uniquePortfolioName;

    // Create portfolio if not using existing one
    if (!portfolioId) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      uniquePortfolioName = portfolioName
        ? `${portfolioName} (${timestamp})`
        : `Uploaded Portfolio - ${timestamp}`;

      const portfolio = await prisma.portfolio.create({
        data: {
          userId,
          name: uniquePortfolioName,
          description: `Uploaded from ${fileFormat.toUpperCase()} file`,
          currency: 'USD',
          benchmark: 'SPY',
          isDefault: false,
          isPublic: false,
          cashBalance: 0
        }
      });
      portfolioId = portfolio.id;
      logger.info(`Created portfolio: ${portfolioId} - ${uniquePortfolioName}`);
    } else {
      // Verify ownership of existing portfolio
      const portfolio = await prisma.portfolio.findFirst({
        where: { id: portfolioId, userId }
      });
      if (!portfolio) {
        throw new Error('Portfolio not found or access denied');
      }
      uniquePortfolioName = portfolio.name;
      logger.info(`Adding holdings to existing portfolio: ${portfolioId} - ${uniquePortfolioName}`);
    }

    // Fetch current market prices for all symbols
    const symbols = holdings.map(h => h.symbol);
    let quotesMap = {};
    try {
      quotesMap = await MarketDataService.getQuotes(symbols);
    } catch (error) {
      logger.warn('Failed to fetch market prices:', error.message);
    }

    // Get existing holdings for aggregation
    const existingHoldings = await prisma.holding.findMany({
      where: { portfolioId }
    });
    const existingMap = new Map(existingHoldings.map(h => [h.symbol, h]));

    let totalValue = 0;
    let successfulHoldings = 0;
    const metadata = {
      originalHoldingsCount: holdings.length,
      pricesFetched: 0,
      pricesFailed: 0,
      taxLotsCreated: 0,
      holdingsUpdated: 0
    };

    for (const holding of holdings) {
      const priceData = quotesMap[holding.symbol];
      const currentPrice = priceData?.price || holding.costBasis;

      if (priceData) {
        metadata.pricesFetched++;
      } else {
        metadata.pricesFailed++;
      }

      try {
        const existing = existingMap.get(holding.symbol);
        let holdingId;

        if (existing) {
          // Update existing holding (aggregate shares and recalculate avg cost)
          const existingShares = Number(existing.shares);
          const existingCostBasis = Number(existing.avgCostBasis);
          const totalShares = existingShares + holding.quantity;
          const totalCost = (existingShares * existingCostBasis) + (holding.quantity * holding.costBasis);
          const newAvgCost = totalCost / totalShares;

          await prisma.holding.update({
            where: { id: existing.id },
            data: {
              shares: totalShares,
              avgCostBasis: newAvgCost
            }
          });

          holdingId = existing.id;
          metadata.holdingsUpdated++;
          logger.info(`Updated holding ${holding.symbol}: ${totalShares} shares @ $${newAvgCost.toFixed(2)} avg`);
        } else {
          // Create new holding
          const stockName = holding.name || priceData?.name || holding.symbol;

          const newHolding = await prisma.holding.create({
            data: {
              portfolioId,
              symbol: holding.symbol,
              shares: holding.quantity,
              avgCostBasis: holding.costBasis,
              assetType: holding.type || 'stock',
              notes: stockName !== holding.symbol ? stockName : null // Store name in notes if available
            }
          });
          holdingId = newHolding.id;
          successfulHoldings++;
          logger.info(`Created holding ${holding.symbol}: ${holding.quantity} shares @ $${holding.costBasis.toFixed(2)}`);
        }

        // Create tax lot for the new purchase
        try {
          await prisma.taxLot.create({
            data: {
              holdingId,
              shares: holding.quantity,
              costBasis: holding.costBasis,
              purchaseDate: holding.purchaseDate ? new Date(holding.purchaseDate) : new Date()
            }
          });
          metadata.taxLotsCreated++;
        } catch (taxLotError) {
          logger.warn(`Failed to create tax lot for ${holding.symbol}:`, taxLotError.message);
        }

        totalValue += currentPrice * holding.quantity;
      } catch (error) {
        logger.error(`Failed to process holding ${holding.symbol}:`, error.message);
        metadata[`error_${holding.symbol}`] = error.message;
      }
    }

    logger.info(`Upload ${uploadId} processed: ${successfulHoldings} new, ${metadata.holdingsUpdated} updated, $${totalValue.toFixed(2)} value`);

    return {
      success: true,
      portfolioId,
      portfolioName: uniquePortfolioName,
      uploadId,
      totalHoldings: successfulHoldings + metadata.holdingsUpdated,
      totalValue,
      metadata
    };
  }

  /**
   * Process upload using SQLite (for local development)
   */
  static async processUploadWithSQLite(uploadId, userId, holdings, fileFormat, portfolioName, existingPortfolioId = null) {
    let portfolioId = existingPortfolioId;
    let uniquePortfolioName;

    // Create portfolio if not using existing one
    if (!portfolioId) {
      portfolioId = uuidv4();
      const createPortfolio = db.prepare(`
        INSERT INTO portfolios (id, user_id, name, description, created_at)
        VALUES (?, ?, ?, ?, ?)
      `);

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      uniquePortfolioName = portfolioName
        ? `${portfolioName} (${timestamp})`
        : `Uploaded Portfolio - ${timestamp}`;

      createPortfolio.run(
        portfolioId,
        userId,
        uniquePortfolioName,
        `Uploaded from ${fileFormat.toUpperCase()} file`,
        new Date().toISOString()
      );

      logger.info(`Created portfolio: ${portfolioId} - ${uniquePortfolioName}`);
    } else {
      // Verify ownership of existing portfolio
      const portfolio = db.prepare('SELECT user_id, name FROM portfolios WHERE id = ?').get(portfolioId);
      if (!portfolio) {
        throw new Error('Portfolio not found');
      }
      if (portfolio.user_id !== userId) {
        throw new Error('Access denied to portfolio');
      }
      uniquePortfolioName = portfolio.name;
      logger.info(`Adding holdings to existing portfolio: ${portfolioId} - ${uniquePortfolioName}`);
    }

    // Fetch current market prices for all symbols
    const symbols = holdings.map(h => h.symbol);
    let quotesMap = {};
    try {
      quotesMap = await MarketDataService.getQuotes(symbols);
    } catch (error) {
      logger.warn('Failed to fetch market prices:', error.message);
    }

    // Insert holdings and tax lots
    const insertHolding = db.prepare(`
      INSERT INTO holdings (
        id, portfolio_id, symbol, shares, avg_cost_basis, asset_type, name
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const insertTaxLot = db.prepare(`
      INSERT INTO tax_lots (
        id, holding_id, shares, cost_basis, purchase_date
      ) VALUES (?, ?, ?, ?, ?)
    `);

    // Check for existing holdings to aggregate
    const existingHoldings = db.prepare(`
      SELECT id, symbol, shares, avg_cost_basis FROM holdings WHERE portfolio_id = ?
    `).all(portfolioId);
    const existingMap = new Map(existingHoldings.map(h => [h.symbol, h]));

    let totalValue = 0;
    let successfulHoldings = 0;
    const metadata = {
      originalHoldingsCount: holdings.length,
      pricesFetched: 0,
      pricesFailed: 0,
      taxLotsCreated: 0,
      holdingsUpdated: 0
    };

    for (const holding of holdings) {
      const priceData = quotesMap[holding.symbol];
      const currentPrice = priceData?.price || holding.costBasis;

      if (priceData) {
        metadata.pricesFetched++;
      } else {
        metadata.pricesFailed++;
      }

      try {
        const existing = existingMap.get(holding.symbol);
        let holdingId;

        if (existing) {
          // Update existing holding (aggregate shares and recalculate avg cost)
          const totalShares = existing.shares + holding.quantity;
          const totalCost = (existing.shares * existing.avg_cost_basis) + (holding.quantity * holding.costBasis);
          const newAvgCost = totalCost / totalShares;

          db.prepare(`
            UPDATE holdings SET shares = ?, avg_cost_basis = ? WHERE id = ?
          `).run(totalShares, newAvgCost, existing.id);

          holdingId = existing.id;
          metadata.holdingsUpdated++;
          logger.info(`Updated holding ${holding.symbol}: ${totalShares} shares @ $${newAvgCost.toFixed(2)} avg`);
        } else {
          // Create new holding
          holdingId = uuidv4();
          const stockName = holding.name || priceData?.name || holding.symbol;

          insertHolding.run(
            holdingId,
            portfolioId,
            holding.symbol,
            holding.quantity,
            holding.costBasis,
            holding.type || 'stock',
            stockName
          );
          successfulHoldings++;
        }

        // Always create tax lot for the new purchase
        try {
          insertTaxLot.run(
            uuidv4(),
            holdingId,
            holding.quantity,
            holding.costBasis,
            holding.purchaseDate || new Date().toISOString()
          );
          metadata.taxLotsCreated++;
        } catch (taxLotError) {
          logger.warn(`Failed to create tax lot for ${holding.symbol}:`, taxLotError.message);
        }

        totalValue += currentPrice * holding.quantity;
      } catch (error) {
        logger.error(`Failed to process holding ${holding.symbol}:`, error.message);
        metadata[`error_${holding.symbol}`] = error.message;
      }
    }

    // Update upload record
    this.updateUploadStatus(uploadId, 'completed', {
      portfolioId,
      portfolioName: uniquePortfolioName,
      totalHoldings: successfulHoldings + metadata.holdingsUpdated,
      totalValue,
      metadata
    });

    // Create snapshot
    try {
      await this.createPortfolioSnapshot(portfolioId);
    } catch (snapshotError) {
      logger.warn('Failed to create snapshot:', snapshotError.message);
    }

    logger.info(`Upload ${uploadId} processed: ${successfulHoldings} new, ${metadata.holdingsUpdated} updated, $${totalValue.toFixed(2)} value`);

    return {
      success: true,
      portfolioId,
      portfolioName: uniquePortfolioName,
      uploadId,
      totalHoldings: successfulHoldings + metadata.holdingsUpdated,
      totalValue,
      metadata
    };
  }

  /**
   * Create portfolio snapshot for historical tracking
   */
  static async createPortfolioSnapshot(portfolioId) {
    try {
      // Get all holdings
      const holdings = db.prepare(`
        SELECT symbol, shares as quantity, avg_cost_basis as cost_basis, asset_type as type
        FROM holdings
        WHERE portfolio_id = ?
      `).all(portfolioId);

      if (holdings.length === 0) {
        logger.warn(`No holdings found for portfolio ${portfolioId}`);
        return;
      }

      // Calculate totals
      let totalValue = 0;
      let totalCost = 0;

      holdings.forEach(h => {
        totalValue += (h.current_price || h.cost_basis) * h.quantity;
        totalCost += h.cost_basis * h.quantity;
      });

      const totalGain = totalValue - totalCost;
      const totalGainPct = ((totalValue - totalCost) / totalCost) * 100;

      // Insert snapshot
      const stmt = db.prepare(`
        INSERT INTO portfolio_snapshots_history (
          portfolio_id, snapshot_date, total_value, total_cost,
          total_gain, total_gain_pct, holdings_count, holdings_snapshot
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(portfolio_id, snapshot_date)
        DO UPDATE SET
          total_value = excluded.total_value,
          total_cost = excluded.total_cost,
          total_gain = excluded.total_gain,
          total_gain_pct = excluded.total_gain_pct,
          holdings_count = excluded.holdings_count,
          holdings_snapshot = excluded.holdings_snapshot
      `);

      stmt.run(
        portfolioId,
        new Date().toISOString().split('T')[0], // Date only
        totalValue,
        totalCost,
        totalGain,
        totalGainPct,
        holdings.length,
        JSON.stringify(holdings)
      );

      logger.info(`Created snapshot for portfolio ${portfolioId}: $${totalValue.toFixed(2)}`);
    } catch (error) {
      logger.error('Error creating portfolio snapshot:', error);
      throw error;
    }
  }

  /**
   * Update historical portfolio prices to current market values
   */
  static async updateHistoricalPortfolio(portfolioId) {
    try {
      logger.info(`Updating historical portfolio ${portfolioId} to current prices`);

      // Get all holdings
      const holdings = db.prepare(`
        SELECT id, symbol, shares as quantity, avg_cost_basis as cost_basis
        FROM holdings
        WHERE portfolio_id = ?
      `).all(portfolioId);

      if (holdings.length === 0) {
        return { success: true, updated: 0, message: 'No holdings to update' };
      }

      // Fetch current prices
      const pricePromises = holdings.map(h =>
        marketDataService.fetchQuote(h.symbol).catch(err => {
          logger.warn(`Failed to fetch price for ${h.symbol}:`, err.message);
          return null;
        })
      );

      const prices = await Promise.all(pricePromises);

      // Update holdings
      const updateStmt = db.prepare(`
        UPDATE holdings
        SET current_price = ?, last_updated = ?
        WHERE id = ?
      `);

      let updated = 0;
      let failed = 0;

      for (let i = 0; i < holdings.length; i++) {
        const holding = holdings[i];
        const priceData = prices[i];

        if (priceData && priceData.price) {
          updateStmt.run(
            priceData.price,
            new Date().toISOString(),
            holding.id
          );
          updated++;
          logger.info(`Updated ${holding.symbol}: $${priceData.price}`);
        } else {
          failed++;
          logger.warn(`No price data for ${holding.symbol}, keeping old value`);
        }
      }

      // Create new snapshot with updated prices
      await this.createPortfolioSnapshot(portfolioId);

      logger.info(`Updated ${updated} holdings, ${failed} failed`);

      return {
        success: true,
        updated,
        failed,
        total: holdings.length
      };

    } catch (error) {
      logger.error('Error updating historical portfolio:', error);
      throw error;
    }
  }

  /**
   * Get upload history for user
   */
  static getUserUploads(userId, limit = 50) {
    const stmt = db.prepare(`
      SELECT up.*, p.name as portfolio_name
      FROM uploaded_portfolios up
      LEFT JOIN portfolios p ON up.portfolio_id = p.id
      WHERE up.user_id = ?
      ORDER BY up.upload_date DESC
      LIMIT ?
    `);

    const uploads = stmt.all(userId, limit);

    return uploads.map(u => ({
      ...u,
      metadata: u.metadata ? JSON.parse(u.metadata) : null
    }));
  }

  /**
   * Get upload by ID
   */
  static getUpload(uploadId) {
    const stmt = db.prepare(`
      SELECT up.*, p.name as portfolio_name
      FROM uploaded_portfolios up
      LEFT JOIN portfolios p ON up.portfolio_id = p.id
      WHERE up.id = ?
    `);

    const upload = stmt.get(uploadId);

    if (upload) {
      upload.metadata = upload.metadata ? JSON.parse(upload.metadata) : null;
    }

    return upload;
  }
}

module.exports = PortfolioUploadService;
