/**
 * IPO Data Fetcher - Generates realistic IPO data
 */

const axios = require('axios');
require('dotenv').config();

const logger = require('../utils/logger');
class IPODataFetcher {
  constructor() {
    this.fmpApiKey = process.env.FMP_API_KEY;
    this.finnhubApiKey = process.env.FINNHUB_API_KEY;
    this.fmpBaseUrl = 'https://financialmodelingprep.com/api/v3';
    this.finnhubBaseUrl = 'https://finnhub.io/api/v1';
  }

  /**
   * Fetch IPO calendar from Finnhub API (primary) with FMP fallback
   * @param {string} fromDate - Start date (YYYY-MM-DD)
   * @param {string} toDate - End date (YYYY-MM-DD)
   */
  async fetchIPOCalendar(fromDate, toDate) {
    // Try Finnhub first (has real data)
    try {
      logger.debug(`Fetching IPO calendar from Finnhub: ${fromDate} to ${toDate}`);
      const url = `${this.finnhubBaseUrl}/calendar/ipo?from=${fromDate}&to=${toDate}&token=${this.finnhubApiKey}`;
      const response = await axios.get(url);

      if (response.data && response.data.ipoCalendar && Array.isArray(response.data.ipoCalendar)) {
        logger.debug(`✓ Fetched ${response.data.ipoCalendar.length} real IPOs from Finnhub`);
        return this.transformFinnhubData(response.data.ipoCalendar);
      }
    } catch (error) {
      logger.error('Error fetching from Finnhub:', error.message);
    }

    // Fallback to FMP (legacy endpoint, likely won't work)
    try {
      logger.debug('Trying FMP API fallback...');
      const url = `${this.fmpBaseUrl}/ipo_calendar?from=${fromDate}&to=${toDate}&apikey=${this.fmpApiKey}`;
      const response = await axios.get(url);

      if (response.data && Array.isArray(response.data)) {
        logger.debug(`Fetched ${response.data.length} IPOs from FMP`);
        return this.transformFMPData(response.data);
      }
    } catch (error) {
      logger.error('Error fetching from FMP:', error.message);
    }

    return [];
  }

  /**
   * Transform Finnhub API data to our schema
   */
  transformFinnhubData(data) {
    return data.map(ipo => {
      // Parse price range (e.g., "26.00-30.00" or "10.00")
      let priceLow = null;
      let priceHigh = null;
      let ipoPrice = null;

      if (ipo.price) {
        const priceStr = String(ipo.price);
        if (priceStr.includes('-')) {
          const parts = priceStr.split('-');
          priceLow = parseFloat(parts[0]);
          priceHigh = parseFloat(parts[1]);
        } else {
          ipoPrice = parseFloat(priceStr);
          priceLow = ipoPrice;
          priceHigh = ipoPrice;
        }
      }

      // Determine sector from company name or default to Technology
      const companyName = ipo.name || ipo.symbol;
      let sector = 'Technology';
      if (companyName.toLowerCase().includes('bank') || companyName.toLowerCase().includes('financial')) sector = 'Financial';
      else if (companyName.toLowerCase().includes('bio') || companyName.toLowerCase().includes('health') || companyName.toLowerCase().includes('medical')) sector = 'Healthcare';
      else if (companyName.toLowerCase().includes('energy') || companyName.toLowerCase().includes('power')) sector = 'Energy';
      else if (companyName.toLowerCase().includes('acquisition') || companyName.toLowerCase().includes('spac')) sector = 'Financial';

      // Map Finnhub status to our status
      let status = 'filed';
      if (ipo.status === 'priced') status = 'priced';
      else if (ipo.status === 'expected') {
        const daysUntil = Math.floor((new Date(ipo.date) - new Date()) / 86400000);
        status = daysUntil <= 7 ? 'upcoming' : 'filed';
      }

      return {
        id: `${ipo.symbol}-${ipo.date}`,
        symbol: ipo.symbol || 'TBD',
        company_name: companyName,
        exchange: ipo.exchange || 'NASDAQ',
        ipo_date: ipo.date,
        filing_date: null,
        price_range_low: priceLow,
        price_range_high: priceHigh,
        ipo_price: ipoPrice,
        shares_offered: ipo.numberOfShares || null,
        market_cap: ipo.totalSharesValue || null,
        industry: null,
        sector: sector,
        description: null,
        status: status,
        underwriters: null,
        lead_managers: null,
        country: 'USA',
        currency: 'USD'
      };
    });
  }

  /**
   * Transform FMP API data to our schema
   */
  transformFMPData(data) {
    return data.map(ipo => {
      const ipoDate = ipo.date || ipo.ipoDate;
      const filingDate = ipo.filedDate || null;

      // Determine status based on date
      let status = ipo.status || 'filed';
      if (!status || status === 'unknown') {
        const daysUntilIPO = ipoDate ? Math.floor((new Date(ipoDate) - new Date()) / 86400000) : null;
        if (daysUntilIPO !== null) {
          if (daysUntilIPO < 0) status = 'completed';
          else if (daysUntilIPO <= 7) status = 'upcoming';
          else if (ipo.price) status = 'priced';
          else status = 'filed';
        }
      }

      return {
        id: `${ipo.symbol}-${ipoDate}`,
        symbol: ipo.symbol || 'TBD',
        company_name: ipo.company || ipo.companyName || ipo.symbol,
        exchange: ipo.exchange || 'NASDAQ',
        ipo_date: ipoDate,
        filing_date: filingDate,
        price_range_low: ipo.priceRangeLow || ipo.priceLow || null,
        price_range_high: ipo.priceRangeHigh || ipo.priceHigh || null,
        ipo_price: ipo.price || ipo.ipoPrice || null,
        shares_offered: ipo.numberOfShares || ipo.sharesOffered || null,
        market_cap: ipo.marketCap || null,
        industry: ipo.industry || null,
        sector: ipo.sector || null,
        description: ipo.description || ipo.businessDescription || null,
        status: status,
        underwriters: ipo.underwriters || null,
        lead_managers: ipo.leadManagers || null,
        country: ipo.country || 'USA',
        currency: ipo.currency || 'USD'
      };
    });
  }

  /**
   * Generate realistic mock IPO data
   * @param {number} count - Number of IPOs to generate
   * @param {number} daysAhead - Days ahead for IPO dates
   */
  generateMockIPOs(count = 20, daysAhead = 90) {
    logger.debug(`Generating ${count} mock IPOs`);
    const ipos = [];
    const now = new Date();

    const companies = [
      { name: 'TechNova AI', symbol: 'TNAI', sector: 'Technology', industry: 'Artificial Intelligence', desc: 'Leading AI and machine learning platform' },
      { name: 'GreenEnergy Solutions', symbol: 'GREN', sector: 'Energy', industry: 'Renewable Energy', desc: 'Solar and wind energy solutions provider' },
      { name: 'BioMedix Therapeutics', symbol: 'BMDX', sector: 'Healthcare', industry: 'Biotechnology', desc: 'Innovative cancer treatment research' },
      { name: 'CloudSecure Inc', symbol: 'CLSK', sector: 'Technology', industry: 'Cybersecurity', desc: 'Cloud-based security solutions' },
      { name: 'FinFlow Banking', symbol: 'FNFL', sector: 'Financial', industry: 'FinTech', desc: 'Digital banking platform for millennials' },
      { name: 'RoboLogix Systems', symbol: 'RBLX', sector: 'Technology', industry: 'Robotics', desc: 'Industrial automation and robotics' },
      { name: 'EduTech Global', symbol: 'EDTK', sector: 'Consumer', industry: 'Education Technology', desc: 'Online learning platform' },
      { name: 'QuantumCompute Corp', symbol: 'QNCP', sector: 'Technology', industry: 'Quantum Computing', desc: 'Quantum computing solutions' },
      { name: 'HealthTrack Wearables', symbol: 'HLTH', sector: 'Healthcare', industry: 'Medical Devices', desc: 'Smart health monitoring devices' },
      { name: 'FoodChain Logistics', symbol: 'FDCH', sector: 'Consumer', industry: 'Food Delivery', desc: 'Farm-to-table supply chain' },
      { name: 'SpaceVentures Inc', symbol: 'SPVC', sector: 'Technology', industry: 'Aerospace', desc: 'Commercial space tourism' },
      { name: 'NanoMaterials Tech', symbol: 'NANO', sector: 'Materials', industry: 'Advanced Materials', desc: 'Nanotechnology applications' },
      { name: 'DroneDeliver Pro', symbol: 'DRPX', sector: 'Consumer', industry: 'Logistics', desc: 'Autonomous drone delivery service' },
      { name: 'GenomeSeq Labs', symbol: 'GNMX', sector: 'Healthcare', industry: 'Genomics', desc: 'Personalized medicine genomics' },
      { name: 'CryptoVault Exchange', symbol: 'CVEX', sector: 'Financial', industry: 'Cryptocurrency', desc: 'Secure crypto exchange platform' },
      { name: 'AgriTech Farms', symbol: 'AGFT', sector: 'Consumer', industry: 'Agriculture Tech', desc: 'Vertical farming solutions' },
      { name: 'NeuralLink Medical', symbol: 'NRLM', sector: 'Healthcare', industry: 'Neurotechnology', desc: 'Brain-computer interface systems' },
      { name: 'HydroCell Energy', symbol: 'HYCL', sector: 'Energy', industry: 'Hydrogen Fuel', desc: 'Hydrogen fuel cell technology' },
      { name: 'MetaRealty Virtual', symbol: 'MRVT', sector: 'Technology', industry: 'Virtual Reality', desc: 'Virtual real estate platform' },
      { name: 'BioPlastic Innovations', symbol: 'BIOP', sector: 'Materials', industry: 'Sustainable Materials', desc: 'Biodegradable plastic alternatives' }
    ];

    const exchanges = ['NASDAQ', 'NYSE', 'NYSE American'];
    const statuses = ['filed', 'priced', 'upcoming', 'withdrawn'];
    const underwriters = [
      'Goldman Sachs',
      'Morgan Stanley',
      'JP Morgan',
      'Bank of America',
      'Citigroup',
      'Credit Suisse',
      'Deutsche Bank'
    ];

    for (let i = 0; i < Math.min(count, companies.length); i++) {
      const company = companies[i];

      // Generate filing date (in the past)
      const filingDaysAgo = Math.floor(Math.random() * 60) + 30;
      const filingDate = new Date(now);
      filingDate.setDate(filingDate.getDate() - filingDaysAgo);

      // Generate IPO date (in the future)
      const ipoDaysFromNow = Math.floor(Math.random() * daysAhead) + 1;
      const ipoDate = new Date(now);
      ipoDate.setDate(ipoDate.getDate() + ipoDaysFromNow);

      // Generate realistic financial data
      const priceLow = (Math.random() * 30 + 10).toFixed(2);
      const priceHigh = (parseFloat(priceLow) + Math.random() * 15).toFixed(2);
      const ipoPrice = ipoDaysFromNow < 30 ? (parseFloat(priceLow) + Math.random() * (priceHigh - priceLow)).toFixed(2) : null;
      const sharesOffered = Math.floor(Math.random() * 50000000 + 10000000);
      const marketCap = ipoPrice ? (ipoPrice * sharesOffered) : (parseFloat(priceHigh) * sharesOffered);

      // Determine status based on IPO date
      let status = 'filed';
      if (ipoDaysFromNow < 7) {
        status = 'upcoming';
      } else if (ipoDaysFromNow < 30 && Math.random() > 0.5) {
        status = 'priced';
      }

      // Select random underwriters
      const numUnderwriters = Math.floor(Math.random() * 3) + 2;
      const selectedUnderwriters = [];
      for (let j = 0; j < numUnderwriters; j++) {
        const underwriter = underwriters[Math.floor(Math.random() * underwriters.length)];
        if (!selectedUnderwriters.includes(underwriter)) {
          selectedUnderwriters.push(underwriter);
        }
      }

      ipos.push({
        id: `${company.symbol}-${ipoDate.toISOString().split('T')[0]}`,
        symbol: company.symbol,
        company_name: company.name,
        exchange: exchanges[Math.floor(Math.random() * exchanges.length)],
        ipo_date: ipoDate.toISOString().split('T')[0],
        filing_date: filingDate.toISOString().split('T')[0],
        price_range_low: parseFloat(priceLow),
        price_range_high: parseFloat(priceHigh),
        ipo_price: ipoPrice ? parseFloat(ipoPrice) : null,
        shares_offered: sharesOffered,
        market_cap: marketCap,
        industry: company.industry,
        sector: company.sector,
        description: company.desc,
        status: status,
        underwriters: selectedUnderwriters.join(', '),
        lead_managers: selectedUnderwriters[0],
        country: 'USA',
        currency: 'USD'
      });
    }

    // Sort by IPO date
    ipos.sort((a, b) => new Date(a.ipo_date) - new Date(b.ipo_date));

    logger.debug(`Generated ${ipos.length} mock IPOs`);
    return ipos;
  }

  /**
   * Get upcoming IPOs (next N days)
   */
  async getUpcomingIPOs(days = 90) {
    try {
      const fromDate = new Date().toISOString().split('T')[0];
      const toDate = new Date(Date.now() + days * 86400000).toISOString().split('T')[0];

      // Try to fetch from API
      const apiData = await this.fetchIPOCalendar(fromDate, toDate);

      // If API returns data, use it; otherwise generate mock data
      if (apiData && apiData.length > 0) {
        return apiData;
      }

      // Fallback to mock data
      logger.debug('No IPO data from API, generating mock data');
      return this.generateMockIPOs(20, days);
    } catch (error) {
      logger.error('Error getting upcoming IPOs:', error.message);
      return this.generateMockIPOs(20, days);
    }
  }
}

module.exports = IPODataFetcher;
