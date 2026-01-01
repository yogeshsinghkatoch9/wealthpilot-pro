/**
 * File Analysis Service
 * Parses and analyzes uploaded financial documents (PDF, CSV, Excel)
 */

const pdf = require('pdf-parse');
const XLSX = require('xlsx');
const unifiedAI = require('./unifiedAIService');
const { fileAnalysisPrompt } = require('./prompts/assistantPrompts');

class FileAnalysisService {
  /**
   * Analyze an uploaded file
   * @param {Buffer} buffer - File buffer
   * @param {string} mimeType - MIME type
   * @param {string} filename - Original filename
   * @returns {Promise<{text: string, analysis: string, metadata: object}>}
   */
  async analyzeFile(buffer, mimeType, filename) {
    try {
      // Extract text content based on file type
      const { text, metadata } = await this.extractContent(buffer, mimeType, filename);

      // Get AI analysis of the content
      const analysis = await this.getAIAnalysis(filename, mimeType, text);

      return {
        text: text.substring(0, 50000), // Limit stored text
        analysis,
        metadata
      };
    } catch (error) {
      console.error('[FileAnalysis] Error analyzing file:', error);
      throw new Error(`Failed to analyze file: ${error.message}`);
    }
  }

  /**
   * Extract text content from file
   */
  async extractContent(buffer, mimeType, filename) {
    const ext = filename.toLowerCase().split('.').pop();

    switch (mimeType) {
      case 'application/pdf':
        return this.parsePDF(buffer);

      case 'text/csv':
      case 'application/csv':
        return this.parseCSV(buffer);

      case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
      case 'application/vnd.ms-excel':
        return this.parseExcel(buffer);

      case 'application/json':
        return this.parseJSON(buffer);

      case 'text/plain':
        return this.parseText(buffer);

      default:
        // Try to detect by extension
        if (ext === 'pdf') return this.parsePDF(buffer);
        if (ext === 'csv') return this.parseCSV(buffer);
        if (ext === 'xlsx' || ext === 'xls') return this.parseExcel(buffer);
        if (ext === 'json') return this.parseJSON(buffer);
        return this.parseText(buffer);
    }
  }

  /**
   * Parse PDF file
   */
  async parsePDF(buffer) {
    try {
      const data = await pdf(buffer);

      return {
        text: data.text,
        metadata: {
          pages: data.numpages,
          info: data.info,
          type: 'pdf'
        }
      };
    } catch (error) {
      console.error('[FileAnalysis] PDF parse error:', error);
      throw new Error('Failed to parse PDF file');
    }
  }

  /**
   * Parse CSV file
   */
  parseCSV(buffer) {
    try {
      const text = buffer.toString('utf-8');
      const lines = text.split('\n').filter(line => line.trim());
      const headers = lines[0]?.split(',').map(h => h.trim().replace(/"/g, ''));

      // Parse rows
      const rows = [];
      for (let i = 1; i < Math.min(lines.length, 1000); i++) {
        const values = this.parseCSVLine(lines[i]);
        if (values.length === headers.length) {
          const row = {};
          headers.forEach((h, idx) => {
            row[h] = values[idx];
          });
          rows.push(row);
        }
      }

      // Format as readable text
      const formattedText = this.formatTableAsText(headers, rows);

      return {
        text: formattedText,
        metadata: {
          headers,
          rowCount: lines.length - 1,
          type: 'csv'
        }
      };
    } catch (error) {
      console.error('[FileAnalysis] CSV parse error:', error);
      throw new Error('Failed to parse CSV file');
    }
  }

  /**
   * Parse a single CSV line handling quoted values
   */
  parseCSVLine(line) {
    const values = [];
    let current = '';
    let inQuotes = false;

    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());

    return values;
  }

  /**
   * Parse Excel file
   */
  parseExcel(buffer) {
    try {
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheets = {};
      let allText = '';

      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

        if (data.length > 0) {
          const headers = data[0] || [];
          const rows = data.slice(1, 500); // Limit rows

          sheets[sheetName] = {
            headers,
            rowCount: data.length - 1
          };

          // Format sheet as text
          allText += `\n=== Sheet: ${sheetName} ===\n`;
          allText += this.formatTableAsText(headers, rows.map(row => {
            const obj = {};
            headers.forEach((h, i) => {
              obj[h || `Column${i}`] = row[i];
            });
            return obj;
          }));
        }
      }

      return {
        text: allText,
        metadata: {
          sheetCount: workbook.SheetNames.length,
          sheets,
          type: 'excel'
        }
      };
    } catch (error) {
      console.error('[FileAnalysis] Excel parse error:', error);
      throw new Error('Failed to parse Excel file');
    }
  }

  /**
   * Parse JSON file
   */
  parseJSON(buffer) {
    try {
      const text = buffer.toString('utf-8');
      const data = JSON.parse(text);

      return {
        text: JSON.stringify(data, null, 2),
        metadata: {
          type: 'json',
          keys: Array.isArray(data) ? ['array'] : Object.keys(data)
        }
      };
    } catch (error) {
      console.error('[FileAnalysis] JSON parse error:', error);
      throw new Error('Failed to parse JSON file');
    }
  }

  /**
   * Parse plain text file
   */
  parseText(buffer) {
    const text = buffer.toString('utf-8');
    return {
      text,
      metadata: {
        type: 'text',
        length: text.length
      }
    };
  }

  /**
   * Format table data as readable text
   */
  formatTableAsText(headers, rows) {
    if (!headers || headers.length === 0) return '';

    let text = `| ${headers.join(' | ')} |\n`;
    text += `| ${headers.map(() => '---').join(' | ')} |\n`;

    for (const row of rows.slice(0, 100)) {
      const values = headers.map(h => {
        const val = row[h];
        if (val === null || val === undefined) return '';
        return String(val).substring(0, 50);
      });
      text += `| ${values.join(' | ')} |\n`;
    }

    if (rows.length > 100) {
      text += `\n... and ${rows.length - 100} more rows\n`;
    }

    return text;
  }

  /**
   * Get AI analysis of the document
   */
  async getAIAnalysis(filename, mimeType, text) {
    try {
      const prompt = fileAnalysisPrompt(filename, mimeType, text);

      const analysis = await unifiedAI.generateCompletion(prompt, {
        systemPrompt: 'You are a financial document analyst. Provide concise, actionable analysis.',
        maxTokens: 1000,
        temperature: 0.3
      });

      return analysis;
    } catch (error) {
      console.error('[FileAnalysis] AI analysis error:', error);
      return 'Unable to generate AI analysis. The document has been parsed and is available for questions.';
    }
  }

  /**
   * Extract financial data from parsed content
   * Attempts to identify common financial document patterns
   */
  extractFinancialData(text, metadata) {
    const data = {
      holdings: [],
      transactions: [],
      totals: {},
      dates: []
    };

    // Look for common patterns
    const dollarPattern = /\$[\d,]+\.?\d*/g;
    const datePattern = /\d{1,2}\/\d{1,2}\/\d{2,4}/g;
    const tickerPattern = /\b[A-Z]{1,5}\b/g;

    // Extract dollar amounts
    const dollars = text.match(dollarPattern) || [];
    data.totals.foundAmounts = dollars.slice(0, 20);

    // Extract dates
    const dates = text.match(datePattern) || [];
    data.dates = [...new Set(dates)].slice(0, 10);

    // Extract potential tickers
    const tickers = text.match(tickerPattern) || [];
    const commonTickers = tickers.filter(t =>
      t.length >= 1 && t.length <= 5 &&
      !['THE', 'AND', 'FOR', 'ARE', 'BUT', 'NOT', 'YOU', 'ALL', 'CAN', 'HAD'].includes(t)
    );
    data.potentialTickers = [...new Set(commonTickers)].slice(0, 20);

    return data;
  }
}

module.exports = new FileAnalysisService();
