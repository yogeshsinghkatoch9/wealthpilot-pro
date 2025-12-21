/**
 * Seed Index Constituents for Market Breadth Calculations
 */

const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');

const db = new Database('./database.db');

// Major constituents for each index
const constituents = {
  SPY: [
    // Top 100 S&P 500 stocks by market cap
    'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'BRK.B', 'UNH', 'JNJ',
    'XOM', 'V', 'PG', 'JPM', 'MA', 'HD', 'CVX', 'MRK', 'ABBV', 'PEP',
    'COST', 'KO', 'AVGO', 'LLY', 'WMT', 'MCD', 'TMO', 'CSCO', 'ACN', 'ABT',
    'PFE', 'ADBE', 'DHR', 'NKE', 'DIS', 'CRM', 'NFLX', 'VZ', 'CMCSA', 'TXN',
    'INTC', 'PM', 'NEE', 'BMY', 'UPS', 'RTX', 'ORCL', 'QCOM', 'HON', 'LIN',
    'COP', 'UNP', 'LOW', 'AMD', 'T', 'ELV', 'SPGI', 'INTU', 'IBM', 'BA',
    'CAT', 'GE', 'SBUX', 'AMGN', 'DE', 'AXP', 'BLK', 'MDT', 'GILD', 'ADI',
    'TGT', 'CI', 'MDLZ', 'MMC', 'SYK', 'ISRG', 'CVS', 'NOW', 'ZTS', 'MO',
    'VRTX', 'BKNG', 'TJX', 'PLD', 'CB', 'DUK', 'SO', 'SCHW', 'MMM', 'USB',
    'C', 'PNC', 'MS', 'BDX', 'AON', 'GS', 'EOG', 'ITW', 'BSX', 'TFC'
  ],

  QQQ: [
    // Top 100 Nasdaq stocks
    'AAPL', 'MSFT', 'AMZN', 'NVDA', 'META', 'GOOGL', 'GOOG', 'TSLA', 'AVGO', 'COST',
    'NFLX', 'ADBE', 'CSCO', 'PEP', 'AMD', 'CMCSA', 'INTC', 'TXN', 'QCOM', 'INTU',
    'AMGN', 'HON', 'SBUX', 'TMUS', 'GILD', 'ADI', 'BKNG', 'VRTX', 'ADP', 'MDLZ',
    'ISRG', 'REGN', 'PYPL', 'LRCX', 'PANW', 'MU', 'AMAT', 'SNPS', 'CDNS', 'MRNA',
    'CSX', 'ABNB', 'MELI', 'KLAC', 'FTNT', 'NXPI', 'ORLY', 'ASML', 'MNST', 'MAR',
    'WDAY', 'CHTR', 'DXCM', 'CTAS', 'PCAR', 'MCHP', 'CPRT', 'PAYX', 'AEP', 'KDP',
    'ROST', 'ODFL', 'FAST', 'EA', 'VRSK', 'CTSH', 'EXC', 'BKR', 'GEHC', 'XEL',
    'KHC', 'LULU', 'CRWD', 'CCEP', 'DDOG', 'IDXX', 'TEAM', 'CSGP', 'ZS', 'ANSS',
    'TTWO', 'ON', 'FANG', 'WBD', 'BIIB', 'ZM', 'DASH', 'CDW', 'ILMN', 'MDB',
    'GFS', 'WBA', 'ALGN', 'DLTR', 'ENPH', 'SIRI', 'JD', 'PDD', 'LCID', 'RIVN'
  ],

  DIA: [
    // Dow 30 components
    'AAPL', 'MSFT', 'UNH', 'GS', 'HD', 'AMGN', 'MCD', 'CAT', 'V', 'CRM',
    'BA', 'HON', 'AMZN', 'IBM', 'JPM', 'CVX', 'JNJ', 'TRV', 'WMT', 'PG',
    'NKE', 'MMM', 'AXP', 'DIS', 'MRK', 'DOW', 'VZ', 'KO', 'CSCO', 'INTC'
  ],

  IWM: [
    // Sample Russell 2000 small caps
    'BTAI', 'CELH', 'RUM', 'HELE', 'PRCT', 'CRNX', 'EXP', 'SIG', 'SHOO', 'AMN',
    'POWI', 'OMCL', 'WTS', 'UFPI', 'HQY', 'TRUP', 'LOPE', 'VITL', 'TREX', 'GBCI',
    'IOSP', 'MUSA', 'TECH', 'POR', 'EXLS', 'FFIN', 'CEIX', 'ABG', 'QTWO', 'AIT',
    'VCTR', 'ATKR', 'CWT', 'UPBD', 'KEX', 'SKYW', 'MGRC', 'CNO', 'CRNC', 'GTES',
    'FOXF', 'PLXS', 'DNLI', 'INSM', 'WRBY', 'GXO', 'AEIS', 'LANC', 'JJSF', 'ITGR',
    'PLAB', 'SLGN', 'BHE', 'ESE', 'HALO', 'ALE', 'KFY', 'GTLS', 'SPSC', 'RCKT',
    'ALRM', 'TFSL', 'TNC', 'MATX', 'EBC', 'CVCO', 'ACA', 'TGTX', 'UFPT', 'OSW',
    'AVNT', 'CRMT', 'KAI', 'CALM', 'BMI', 'WDFC', 'BCC', 'BJRI', 'CSWI', 'SANM',
    'MCY', 'GMS', 'PRIM', 'AMSF', 'STRL', 'SFBS', 'DIOD', 'RUSHA', 'SGH', 'HIMS',
    'NPO', 'TNDM', 'HSII', 'PLYA', 'COOP', 'SMTC', 'ICFI', 'VSEC', 'FELE', 'TASK'
  ]
};

console.log('🌱 Seeding index constituents...\n');

// Clear existing data
const clearStmt = db.prepare('DELETE FROM index_constituents');
clearStmt.run();
console.log('✓ Cleared existing constituents\n');

// Insert new constituents
const insertStmt = db.prepare(`
  INSERT INTO index_constituents (
    id, index_symbol, stock_symbol, stock_name, weight, is_active
  ) VALUES (?, ?, ?, ?, ?, ?)
`);

let totalInserted = 0;

for (const [index, symbols] of Object.entries(constituents)) {
  console.log(`Adding ${symbols.length} constituents for ${index}...`);

  const weight = 1.0 / symbols.length; // Equal weight for simplicity

  for (const symbol of symbols) {
    insertStmt.run(
      uuidv4(),
      index,
      symbol,
      symbol, // stock_name (use symbol as placeholder)
      weight,
      1 // is_active
    );
    totalInserted++;
  }

  console.log(`✓ ${index}: ${symbols.length} stocks added`);
}

console.log(`\n✅ Successfully seeded ${totalInserted} index constituents!\n`);

// Verify counts
console.log('Verification:');
const verifyStmt = db.prepare(`
  SELECT index_symbol, COUNT(*) as count
  FROM index_constituents
  GROUP BY index_symbol
  ORDER BY index_symbol
`);

const counts = verifyStmt.all();
counts.forEach(row => {
  console.log(`  ${row.index_symbol}: ${row.count} constituents`);
});

db.close();
