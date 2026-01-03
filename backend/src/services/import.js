/**
 * WealthPilot Pro - Import Service
 * CSV/Excel import for transactions and holdings
 */

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

class ImportService {
  
  /**
   * Parse CSV content
   */
  static parseCSV(content, options = {}) {
    const { 
      delimiter = ',', 
      hasHeader = true,
      trimValues = true 
    } = options;

    const lines = content.split(/\r?\n/).filter(line => line.trim());
    if (lines.length === 0) {
      return { headers: [], rows: [], errors: ['Empty file'] };
    }

    const headers = hasHeader 
      ? this.parseCSVLine(lines[0], delimiter).map(h => this.normalizeHeader(h))
      : [];
    
    const dataLines = hasHeader ? lines.slice(1) : lines;
    const rows = [];
    const errors = [];

    dataLines.forEach((line, index) => {
      try {
        const values = this.parseCSVLine(line, delimiter);
        if (trimValues) {
          values.forEach((v, i) => values[i] = v.trim());
        }
        
        if (hasHeader) {
          const row = {};
          headers.forEach((header, i) => {
            row[header] = values[i] || '';
          });
          rows.push(row);
        } else {
          rows.push(values);
        }
      } catch (err) {
        errors.push(`Row ${index + 2}: ${err.message}`);
      }
    });

    return { headers, rows, errors };
  }

  /**
   * Parse a single CSV line (handles quoted values)
   */
  static parseCSVLine(line, delimiter = ',') {
    const values = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          current += '"';
          i++; // Skip next quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        values.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current);

    return values;
  }

  /**
   * Normalize header names
   */
  static normalizeHeader(header) {
    return header
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
  }

  /**
   * Map columns to our schema
   */
  static mapColumns(headers) {
    const columnMap = {
      // Symbol mappings
      symbol: ['symbol', 'ticker', 'stock', 'security', 'cusip'],
      
      // Transaction type mappings
      type: ['type', 'action', 'transaction_type', 'trans_type', 'activity'],
      
      // Quantity mappings
      shares: ['shares', 'quantity', 'qty', 'units', 'amount'],
      
      // Price mappings
      price: ['price', 'unit_price', 'cost', 'trade_price', 'execution_price'],
      
      // Total amount mappings
      amount: ['amount', 'total', 'value', 'net_amount', 'proceeds', 'cost_basis'],
      
      // Date mappings
      date: ['date', 'trade_date', 'transaction_date', 'settlement_date', 'exec_date'],
      
      // Optional fields
      fees: ['fees', 'commission', 'fee', 'commissions'],
      notes: ['notes', 'memo', 'description', 'comment', 'remarks'],
      account: ['account', 'portfolio', 'account_name', 'account_number']
    };

    const mapping = {};
    
    for (const [field, aliases] of Object.entries(columnMap)) {
      for (const header of headers) {
        if (aliases.includes(header)) {
          mapping[field] = header;
          break;
        }
      }
    }

    return mapping;
  }

  /**
   * Parse transaction type
   */
  static parseTransactionType(value) {
    const normalized = (value || '').toLowerCase().trim();
    
    const buyTypes = ['buy', 'bought', 'purchase', 'acquired', 'long', 'b'];
    const sellTypes = ['sell', 'sold', 'sale', 'disposed', 'short', 's'];
    const dividendTypes = ['dividend', 'div', 'distribution', 'income', 'd'];
    const splitTypes = ['split', 'stock_split', 'reverse_split'];
    const transferTypes = ['transfer', 'journal', 'move', 'acat'];

    if (buyTypes.includes(normalized)) return 'buy';
    if (sellTypes.includes(normalized)) return 'sell';
    if (dividendTypes.includes(normalized)) return 'dividend';
    if (splitTypes.includes(normalized)) return 'split';
    if (transferTypes.includes(normalized)) return 'transfer';
    
    return null;
  }

  /**
   * Parse date from various formats
   */
  static parseDate(value) {
    if (!value) return null;
    
    // Try ISO format first
    let date = new Date(value);
    if (!isNaN(date.getTime())) return date;
    
    // Try MM/DD/YYYY
    const usFormat = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (usFormat) {
      const [, month, day, year] = usFormat;
      const fullYear = year.length === 2 ? '20' + year : year;
      date = new Date(`${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
      if (!isNaN(date.getTime())) return date;
    }
    
    // Try DD/MM/YYYY (European)
    const euFormat = value.match(/^(\d{1,2})[-.](\d{1,2})[-.](\d{2,4})$/);
    if (euFormat) {
      const [, day, month, year] = euFormat;
      const fullYear = year.length === 2 ? '20' + year : year;
      date = new Date(`${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
      if (!isNaN(date.getTime())) return date;
    }
    
    return null;
  }

  /**
   * Parse numeric value
   */
  static parseNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    
    // Remove currency symbols and commas
    const cleaned = String(value)
      .replace(/[$€£¥,]/g, '')
      .replace(/\(([0-9.]+)\)/, '-$1') // Handle (100) as -100
      .trim();
    
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  }

  /**
   * Validate and transform a single row
   */
  static validateRow(row, columnMap, rowIndex) {
    const errors = [];
    const warnings = [];
    
    // Required: symbol
    const symbol = (row[columnMap.symbol] || '').toUpperCase().trim();
    if (!symbol) {
      errors.push('Missing symbol');
    } else if (!/^[A-Z]{1,5}$/.test(symbol)) {
      warnings.push(`Unusual symbol format: ${symbol}`);
    }
    
    // Required: type
    const rawType = row[columnMap.type];
    const type = this.parseTransactionType(rawType);
    if (!type) {
      errors.push(`Invalid transaction type: ${rawType}`);
    }
    
    // Required: date
    const rawDate = row[columnMap.date];
    const date = this.parseDate(rawDate);
    if (!date) {
      errors.push(`Invalid date: ${rawDate}`);
    }
    
    // Shares (required for buy/sell)
    const shares = this.parseNumber(row[columnMap.shares]);
    if ((type === 'buy' || type === 'sell') && (shares === null || shares <= 0)) {
      errors.push(`Invalid shares: ${row[columnMap.shares]}`);
    }
    
    // Price (optional, can be calculated)
    const price = this.parseNumber(row[columnMap.price]);
    
    // Amount (optional, can be calculated)
    const amount = this.parseNumber(row[columnMap.amount]);
    
    // If we have shares but no price, try to calculate from amount
    let finalPrice = price;
    let finalAmount = amount;
    
    if (shares && !price && amount) {
      finalPrice = Math.abs(amount / shares);
    }
    if (shares && price && !amount) {
      finalAmount = shares * price;
    }
    
    // Fees
    const fees = this.parseNumber(row[columnMap.fees]) || 0;
    
    // Notes
    const notes = row[columnMap.notes] || '';

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      data: {
        symbol,
        type,
        shares: shares || 0,
        price: finalPrice || 0,
        amount: finalAmount || 0,
        fees,
        date,
        notes,
        rowIndex: rowIndex + 2 // Account for header and 0-index
      }
    };
  }

  /**
   * Process CSV import
   */
  static processCSVImport(content, options = {}) {
    const { headers, rows, errors: parseErrors } = this.parseCSV(content, options);
    
    if (parseErrors.length > 0) {
      return {
        success: false,
        errors: parseErrors,
        transactions: []
      };
    }

    const columnMap = this.mapColumns(headers);
    
    // Check required columns
    const requiredColumns = ['symbol', 'type', 'date'];
    const missingColumns = requiredColumns.filter(col => !columnMap[col]);
    
    if (missingColumns.length > 0) {
      return {
        success: false,
        errors: [`Missing required columns: ${missingColumns.join(', ')}`],
        detectedColumns: columnMap,
        availableHeaders: headers,
        transactions: []
      };
    }

    const transactions = [];
    const errors = [];
    const warnings = [];

    rows.forEach((row, index) => {
      const result = this.validateRow(row, columnMap, index);
      
      if (result.valid) {
        transactions.push(result.data);
      } else {
        errors.push(`Row ${result.data.rowIndex}: ${result.errors.join(', ')}`);
      }
      
      if (result.warnings.length > 0) {
        warnings.push(`Row ${result.data.rowIndex}: ${result.warnings.join(', ')}`);
      }
    });

    return {
      success: errors.length === 0,
      totalRows: rows.length,
      validRows: transactions.length,
      invalidRows: errors.length,
      errors,
      warnings,
      detectedColumns: columnMap,
      transactions
    };
  }

  /**
   * Generate sample CSV template
   */
  static generateTemplate() {
    const headers = ['Date', 'Symbol', 'Type', 'Shares', 'Price', 'Amount', 'Fees', 'Notes'];
    const sampleRows = [
      ['2024-01-15', 'AAPL', 'Buy', '100', '185.50', '18550.00', '4.95', 'Initial position'],
      ['2024-02-01', 'MSFT', 'Buy', '50', '410.25', '20512.50', '4.95', ''],
      ['2024-02-15', 'AAPL', 'Dividend', '', '', '96.00', '', 'Q1 dividend'],
      ['2024-03-10', 'AAPL', 'Sell', '25', '175.00', '4375.00', '4.95', 'Partial sale']
    ];

    const csv = [
      headers.join(','),
      ...sampleRows.map(row => row.join(','))
    ].join('\n');

    return csv;
  }

  /**
   * Detect file format from content
   */
  static detectFormat(content, filename = '') {
    const ext = path.extname(filename).toLowerCase();
    
    if (ext === '.csv') return 'csv';
    if (ext === '.tsv') return 'tsv';
    if (['.xls', '.xlsx'].includes(ext)) return 'excel';
    
    // Try to detect from content
    const firstLine = content.split('\n')[0];
    if (firstLine.includes('\t')) return 'tsv';
    if (firstLine.includes(',')) return 'csv';
    
    return 'unknown';
  }

  /**
   * Process holdings import (for initial portfolio setup)
   */
  static processHoldingsImport(content, options = {}) {
    const { headers, rows, errors: parseErrors } = this.parseCSV(content, options);
    
    if (parseErrors.length > 0) {
      return { success: false, errors: parseErrors, holdings: [] };
    }

    const holdingColumnMap = {
      symbol: ['symbol', 'ticker', 'stock'],
      shares: ['shares', 'quantity', 'qty', 'units'],
      cost_basis: ['cost_basis', 'avg_cost', 'cost', 'purchase_price', 'basis'],
      purchase_date: ['purchase_date', 'date', 'acquired_date'],
      sector: ['sector', 'industry', 'category']
    };

    const columnMap = {};
    for (const [field, aliases] of Object.entries(holdingColumnMap)) {
      for (const header of headers) {
        if (aliases.includes(header)) {
          columnMap[field] = header;
          break;
        }
      }
    }

    const holdings = [];
    const errors = [];

    rows.forEach((row, index) => {
      const symbol = (row[columnMap.symbol] || '').toUpperCase().trim();
      const shares = this.parseNumber(row[columnMap.shares]);
      const costBasis = this.parseNumber(row[columnMap.cost_basis]);
      const purchaseDate = this.parseDate(row[columnMap.purchase_date]);
      const sector = row[columnMap.sector] || '';

      if (!symbol) {
        errors.push(`Row ${index + 2}: Missing symbol`);
        return;
      }
      if (!shares || shares <= 0) {
        errors.push(`Row ${index + 2}: Invalid shares`);
        return;
      }

      holdings.push({
        symbol,
        shares,
        costBasis: costBasis || 0,
        purchaseDate: purchaseDate || new Date(),
        sector
      });
    });

    return {
      success: errors.length === 0,
      totalRows: rows.length,
      validRows: holdings.length,
      errors,
      holdings
    };
  }
}

module.exports = ImportService;
