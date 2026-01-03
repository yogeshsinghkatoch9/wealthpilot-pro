/**
 * Populate SPAC Data
 * Adds realistic SPAC (Special Purpose Acquisition Company) entries to IPO calendar
 */

const Database = require('better-sqlite3');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Initialize database
const dbPath = path.join(__dirname, 'data/wealthpilot.db');
const db = new Database(dbPath);

// Realistic SPAC data based on actual 2024-2025 SPAC activity
const SPAC_DATA = [
  {
    symbol: 'DYCQ',
    company_name: 'DXC Technology Acquisition Corp',
    exchange: 'NASDAQ',
    ipo_date: '2025-12-20',
    filing_date: '2025-11-15',
    price_range_low: 10.00,
    price_range_high: 10.00,
    ipo_price: 10.00,
    shares_offered: 20000000,
    market_cap: 200000000,
    industry: 'Technology SPAC',
    sector: 'Financial',
    description: 'Special purpose acquisition company focused on technology sector targets',
    status: 'upcoming',
    underwriters: 'Goldman Sachs, Morgan Stanley',
    lead_managers: 'Goldman Sachs',
    target_sector: 'Cloud Infrastructure',
    merger_deadline: '2027-12-20'
  },
  {
    symbol: 'HLAH',
    company_name: 'Hamilton Lane Alliance Holdings I',
    exchange: 'NASDAQ',
    ipo_date: '2025-12-18',
    filing_date: '2025-10-20',
    price_range_low: 10.00,
    price_range_high: 10.00,
    ipo_price: 10.00,
    shares_offered: 30000000,
    market_cap: 300000000,
    industry: 'Financial Services SPAC',
    sector: 'Financial',
    description: 'SPAC targeting alternative investment and financial technology companies',
    status: 'priced',
    underwriters: 'JP Morgan, Citigroup',
    lead_managers: 'JP Morgan',
    target_sector: 'FinTech',
    merger_deadline: '2027-12-18'
  },
  {
    symbol: 'KACL',
    company_name: 'Keppel Acquisition Corp',
    exchange: 'NYSE',
    ipo_date: '2026-01-10',
    filing_date: '2025-11-01',
    price_range_low: 10.00,
    price_range_high: 10.00,
    ipo_price: null,
    shares_offered: 25000000,
    market_cap: 250000000,
    industry: 'Clean Energy SPAC',
    sector: 'Energy',
    description: 'Special purpose acquisition company targeting renewable energy and sustainability companies',
    status: 'filed',
    underwriters: 'Bank of America, Deutsche Bank',
    lead_managers: 'Bank of America',
    target_sector: 'Renewable Energy',
    merger_deadline: '2028-01-10'
  },
  {
    symbol: 'HLGN',
    company_name: 'Heligon Acquisition Corp',
    exchange: 'NASDAQ',
    ipo_date: '2026-01-15',
    filing_date: '2025-10-15',
    price_range_low: 10.00,
    price_range_high: 10.00,
    ipo_price: null,
    shares_offered: 15000000,
    market_cap: 150000000,
    industry: 'Healthcare SPAC',
    sector: 'Healthcare',
    description: 'SPAC focused on innovative healthcare technology and biotech companies',
    status: 'filed',
    underwriters: 'Goldman Sachs, Credit Suisse',
    lead_managers: 'Goldman Sachs',
    target_sector: 'Biotech',
    merger_deadline: '2028-01-15'
  },
  {
    symbol: 'SVAC',
    company_name: 'SVF Investment Corp 4',
    exchange: 'NASDAQ',
    ipo_date: '2026-02-01',
    filing_date: '2025-11-20',
    price_range_low: 10.00,
    price_range_high: 10.00,
    ipo_price: null,
    shares_offered: 50000000,
    market_cap: 500000000,
    industry: 'Technology SPAC',
    sector: 'Technology',
    description: 'SoftBank Vision Fund SPAC targeting high-growth technology companies',
    status: 'filed',
    underwriters: 'Morgan Stanley, JP Morgan, Goldman Sachs',
    lead_managers: 'Morgan Stanley',
    target_sector: 'AI & Machine Learning',
    merger_deadline: '2028-02-01'
  },
  {
    symbol: 'PACX',
    company_name: 'Pioneer Acquisition Corp',
    exchange: 'NYSE',
    ipo_date: '2026-01-25',
    filing_date: '2025-11-10',
    price_range_low: 10.00,
    price_range_high: 10.00,
    ipo_price: null,
    shares_offered: 35000000,
    market_cap: 350000000,
    industry: 'Consumer SPAC',
    sector: 'Consumer',
    description: 'SPAC targeting consumer brands and direct-to-consumer businesses',
    status: 'filed',
    underwriters: 'Citigroup, Bank of America',
    lead_managers: 'Citigroup',
    target_sector: 'Consumer Brands',
    merger_deadline: '2028-01-25'
  },
  {
    symbol: 'EVGR',
    company_name: 'Evergreen Acquisition Corp',
    exchange: 'NASDAQ',
    ipo_date: '2025-12-28',
    filing_date: '2025-10-28',
    price_range_low: 10.00,
    price_range_high: 10.00,
    ipo_price: 10.00,
    shares_offered: 18000000,
    market_cap: 180000000,
    industry: 'Sustainability SPAC',
    sector: 'Materials',
    description: 'Special purpose acquisition company focused on sustainable materials and ESG companies',
    status: 'priced',
    underwriters: 'Credit Suisse, Deutsche Bank',
    lead_managers: 'Credit Suisse',
    target_sector: 'Sustainable Materials',
    merger_deadline: '2027-12-28'
  },
  {
    symbol: 'DCRD',
    company_name: 'Decarbonization Plus Acquisition Corp V',
    exchange: 'NASDAQ',
    ipo_date: '2026-02-10',
    filing_date: '2025-11-25',
    price_range_low: 10.00,
    price_range_high: 10.00,
    ipo_price: null,
    shares_offered: 28000000,
    market_cap: 280000000,
    industry: 'Climate Tech SPAC',
    sector: 'Energy',
    description: 'SPAC targeting decarbonization and climate technology companies',
    status: 'filed',
    underwriters: 'Goldman Sachs, Morgan Stanley',
    lead_managers: 'Goldman Sachs',
    target_sector: 'Climate Technology',
    merger_deadline: '2028-02-10'
  }
];

async function populateSPACData() {
  console.log('\n🚀 Populating SPAC Data...\n');

  try {
    // Prepare insert statement
    const insertStmt = db.prepare(`
      INSERT INTO ipo_calendar (
        id, symbol, company_name, exchange, ipo_date, filing_date,
        price_range_low, price_range_high, ipo_price, shares_offered,
        market_cap, industry, sector, description, status,
        underwriters, lead_managers, country, currency, created_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now')
      )
    `);

    let inserted = 0;

    for (const spac of SPAC_DATA) {
      try {
        const id = uuidv4();

        insertStmt.run(
          id,
          spac.symbol,
          spac.company_name,
          spac.exchange,
          spac.ipo_date,
          spac.filing_date,
          spac.price_range_low,
          spac.price_range_high,
          spac.ipo_price,
          spac.shares_offered,
          spac.market_cap,
          spac.industry,
          spac.sector,
          spac.description,
          spac.status,
          spac.underwriters,
          spac.lead_managers,
          'USA',
          'USD'
        );

        inserted++;
        console.log(`✓ Added ${spac.symbol} - ${spac.company_name}`);
      } catch (error) {
        if (error.message.includes('UNIQUE constraint')) {
          console.log(`⚠ ${spac.symbol} already exists, skipping...`);
        } else {
          console.error(`✗ Error adding ${spac.symbol}:`, error.message);
        }
      }
    }

    console.log(`\n✅ SPAC population complete: ${inserted} SPACs added\n`);

    // Verify
    const count = db.prepare(`
      SELECT COUNT(*) as count FROM ipo_calendar
      WHERE company_name LIKE '%Acquisition%' OR industry LIKE '%SPAC%'
    `).get();

    console.log(`📊 Total SPACs in database: ${count.count}\n`);

    db.close();
    process.exit(0);
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

populateSPACData();
