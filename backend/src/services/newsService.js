/**
 * News Service - MarketAux API Integration
 * API: https://api.marketaux.com/v1/news/all
 * Provides real-time financial news with sentiment analysis
 */

const axios = require('axios');

const logger = require('../utils/logger');
class NewsService {
  constructor() {
    this.apiKey = process.env.MARKETAUX_API_KEY || 'gt30z3tlxjMvXTDL3s5CE8EdH2FTSKxQk88PhzNz';
    this.baseUrl = 'https://api.marketaux.com/v1';
    this.cache = new Map();
    this.cacheDuration = 5 * 60 * 1000; // 5 minute cache

    logger.debug('✓ News Service initialized (MarketAux API)');
  }

  /**
   * Get cached data
   */
  getFromCache(key) {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheDuration) {
      return cached.data;
    }
    return null;
  }

  /**
   * Set cache data
   */
  setCache(key, data) {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  /**
   * Fetch news from MarketAux API
   */
  async fetchNews(options = {}) {
    const {
      symbols = '',
      filter_entities = true,
      language = 'en',
      limit = 20,
      countries = 'us',
      sort = 'published_desc'
    } = options;

    const cacheKey = `news_${symbols}_${limit}_${countries}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      logger.info('[NewsService] Returning cached news');
      return cached;
    }

    try {
      const params = new URLSearchParams({
        api_token: this.apiKey,
        language,
        limit: limit.toString(),
        countries,
        sort,
        filter_entities: filter_entities.toString()
      });

      if (symbols) {
        params.append('symbols', symbols);
      }

      const url = `${this.baseUrl}/news/all?${params.toString()}`;
      logger.info('[NewsService] Fetching from MarketAux:', url.replace(this.apiKey, '***'));

      const response = await axios.get(url, { timeout: 15000 });

      if (response.data && response.data.data) {
        const news = response.data.data.map(item => this.transformNewsItem(item));
        this.setCache(cacheKey, news);
        logger.debug(`[NewsService] Fetched ${news.length} news items`);
        return news;
      }

      return [];
    } catch (error) {
      logger.error('[NewsService] Error fetching news:', error.message);
      // Return fallback news if API fails
      return this.getFallbackNews();
    }
  }

  /**
   * Transform MarketAux news item to standard format
   */
  transformNewsItem(item) {
    // Determine sentiment from MarketAux sentiment data
    let sentiment = 'neutral';
    if (item.entities && item.entities.length > 0) {
      const sentimentScores = item.entities
        .filter(e => e.sentiment_score !== null)
        .map(e => e.sentiment_score);

      if (sentimentScores.length > 0) {
        const avgSentiment = sentimentScores.reduce((a, b) => a + b, 0) / sentimentScores.length;
        if (avgSentiment > 0.2) sentiment = 'positive';
        else if (avgSentiment < -0.2) sentiment = 'negative';
      }
    }

    // Extract symbols from entities
    const symbols = item.entities
      ? item.entities.filter(e => e.type === 'equity').map(e => e.symbol).slice(0, 3)
      : [];

    return {
      id: item.uuid,
      title: item.title,
      headline: item.title,
      summary: item.description || item.snippet || '',
      description: item.description,
      source: item.source,
      url: item.url,
      image_url: item.image_url,
      published_at: item.published_at,
      datetime: item.published_at,
      symbol: symbols[0] || 'MARKET',
      symbols: symbols,
      sentiment: sentiment,
      category: this.categorizeNews(item),
      relevance_score: item.relevance_score || 0.5
    };
  }

  /**
   * Categorize news based on content
   */
  categorizeNews(item) {
    const title = (item.title || '').toLowerCase();
    const desc = (item.description || '').toLowerCase();
    const text = title + ' ' + desc;

    if (text.includes('earnings') || text.includes('quarterly') || text.includes('revenue')) {
      return 'earnings';
    }
    if (text.includes('merger') || text.includes('acquisition') || text.includes('buyout')) {
      return 'merger';
    }
    if (text.includes('fed') || text.includes('interest rate') || text.includes('inflation')) {
      return 'economic';
    }
    if (text.includes('ceo') || text.includes('executive') || text.includes('resign')) {
      return 'leadership';
    }
    if (text.includes('product') || text.includes('launch') || text.includes('release')) {
      return 'product';
    }
    if (text.includes('regulation') || text.includes('sec') || text.includes('lawsuit')) {
      return 'regulatory';
    }
    return 'general';
  }

  /**
   * Get news for specific stock symbols
   */
  async getStockNews(symbols, limit = 10) {
    const symbolStr = Array.isArray(symbols) ? symbols.join(',') : symbols;
    return this.fetchNews({ symbols: symbolStr, limit });
  }

  /**
   * Get general market news
   */
  async getMarketNews(limit = 20) {
    return this.fetchNews({ limit });
  }

  /**
   * Get news for user's holdings
   */
  async getHoldingsNews(holdings, limit = 20) {
    if (!holdings || holdings.length === 0) {
      return this.getMarketNews(limit);
    }

    const symbols = holdings
      .map(h => h.symbol)
      .filter(s => s && s.length <= 5) // Valid stock symbols
      .slice(0, 10) // API limit
      .join(',');

    if (!symbols) {
      return this.getMarketNews(limit);
    }

    return this.fetchNews({ symbols, limit });
  }

  /**
   * Get fallback news when API fails
   */
  getFallbackNews() {
    const now = new Date().toISOString();
    return [
      {
        id: '1',
        title: 'Markets Update',
        headline: 'Markets Update',
        summary: 'Stay tuned for the latest market news and updates.',
        source: 'WealthPilot',
        url: '#',
        image_url: null,
        published_at: now,
        datetime: now,
        symbol: 'MARKET',
        sentiment: 'neutral',
        category: 'general'
      }
    ];
  }

  /**
   * Calculate sentiment summary from news items
   */
  calculateSentimentSummary(news) {
    if (!news || news.length === 0) {
      return { bullish: 0, neutral: 100, bearish: 0 };
    }

    let bullish = 0, bearish = 0, neutral = 0;

    news.forEach(item => {
      if (item.sentiment === 'positive') bullish++;
      else if (item.sentiment === 'negative') bearish++;
      else neutral++;
    });

    const total = news.length;
    return {
      bullish: Math.round((bullish / total) * 100),
      neutral: Math.round((neutral / total) * 100),
      bearish: Math.round((bearish / total) * 100)
    };
  }
}

module.exports = NewsService;
