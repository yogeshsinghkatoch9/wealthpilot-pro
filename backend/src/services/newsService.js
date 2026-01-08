/**
 * News Service - Multi-Source RSS + API Integration
 * Fetches real financial news from multiple legitimate sources
 */

const axios = require('axios');
const xml2js = require('xml2js');
const logger = require('../utils/logger');

class NewsService {
  constructor() {
    this.apiKey = process.env.MARKETAUX_API_KEY;
    this.baseUrl = 'https://api.marketaux.com/v1';
    this.cache = new Map();
    this.cacheDuration = 5 * 60 * 1000; // 5 minute cache

    // RSS Feed Sources - Legitimate Financial News
    this.rssFeeds = [
      // US Markets & Business
      { name: 'Yahoo Finance', url: 'https://finance.yahoo.com/news/rssindex', category: 'market' },
      { name: 'CNBC', url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html', category: 'market' },
      { name: 'MarketWatch', url: 'https://feeds.marketwatch.com/marketwatch/topstories/', category: 'market' },
      { name: 'Investing.com', url: 'https://www.investing.com/rss/news.rss', category: 'market' },
      { name: 'Seeking Alpha', url: 'https://seekingalpha.com/market_currents.xml', category: 'market' },

      // International Business
      { name: 'Reuters', url: 'https://www.reutersagency.com/feed/?best-topics=business-finance&post_type=best', category: 'international' },
      { name: 'BBC Business', url: 'https://feeds.bbci.co.uk/news/business/rss.xml', category: 'international' },
      { name: 'Financial Times', url: 'https://www.ft.com/rss/home', category: 'international' },

      // Crypto
      { name: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', category: 'crypto' },
      { name: 'Cointelegraph', url: 'https://cointelegraph.com/rss', category: 'crypto' },

      // Economy & Fed
      { name: 'WSJ Economy', url: 'https://feeds.a]Aom/wsj/xml/rss/3_7014.xml', category: 'economy' },
    ];

    logger.info('✓ News Service initialized with RSS feeds + MarketAux API');
  }

  getFromCache(key) {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheDuration) {
      return cached.data;
    }
    return null;
  }

  setCache(key, data) {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  /**
   * Fetch and parse RSS feed
   */
  async fetchRssFeed(feedInfo) {
    try {
      const response = await axios.get(feedInfo.url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; WealthPilot/1.0)',
          'Accept': 'application/rss+xml, application/xml, text/xml'
        }
      });

      const parser = new xml2js.Parser({ explicitArray: false });
      const result = await parser.parseStringPromise(response.data);

      let items = [];

      // Handle different RSS formats
      if (result.rss && result.rss.channel && result.rss.channel.item) {
        items = Array.isArray(result.rss.channel.item)
          ? result.rss.channel.item
          : [result.rss.channel.item];
      } else if (result.feed && result.feed.entry) {
        items = Array.isArray(result.feed.entry)
          ? result.feed.entry
          : [result.feed.entry];
      }

      return items.slice(0, 10).map(item => this.transformRssItem(item, feedInfo));
    } catch (error) {
      logger.debug(`[RSS] Failed to fetch ${feedInfo.name}: ${error.message}`);
      return [];
    }
  }

  /**
   * Transform RSS item to standard format
   */
  transformRssItem(item, feedInfo) {
    // Get title
    const title = item.title?._ || item.title || 'Untitled';

    // Get description/summary
    const description = item.description?._ || item.description ||
                       item.summary?._ || item.summary ||
                       item['content:encoded'] || '';

    // Get link
    const url = item.link?.$ ? item.link.$.href : (item.link || '#');

    // Get published date
    const pubDate = item.pubDate || item.published || item['dc:date'] || new Date().toISOString();

    // Get image
    let imageUrl = null;
    if (item['media:content'] && item['media:content'].$) {
      imageUrl = item['media:content'].$.url;
    } else if (item['media:thumbnail'] && item['media:thumbnail'].$) {
      imageUrl = item['media:thumbnail'].$.url;
    } else if (item.enclosure && item.enclosure.$) {
      imageUrl = item.enclosure.$.url;
    }

    // Clean HTML from description
    const cleanDescription = description
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .substring(0, 300);

    // Analyze sentiment
    const sentiment = this.analyzeSentiment(title + ' ' + cleanDescription);

    // Extract stock symbols from title
    const symbols = this.extractSymbols(title);

    return {
      id: `rss_${feedInfo.name}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title: title,
      headline: title,
      summary: cleanDescription,
      description: cleanDescription,
      source: feedInfo.name,
      url: url,
      image_url: imageUrl,
      published_at: new Date(pubDate).toISOString(),
      datetime: new Date(pubDate).toISOString(),
      symbol: symbols[0] || 'MARKET',
      symbols: symbols,
      sentiment: sentiment,
      category: feedInfo.category || this.categorizeNews({ title, description: cleanDescription }),
      relevance_score: 0.7
    };
  }

  /**
   * Simple sentiment analysis
   */
  analyzeSentiment(text) {
    const lower = text.toLowerCase();

    const bullishWords = ['surge', 'soar', 'jump', 'rally', 'gain', 'rise', 'climb', 'bullish',
                         'record high', 'beat', 'exceeds', 'strong', 'growth', 'profit', 'upgrade',
                         'outperform', 'buy', 'positive', 'boom', 'breakthrough'];

    const bearishWords = ['fall', 'drop', 'plunge', 'crash', 'decline', 'sink', 'bearish',
                         'loss', 'miss', 'weak', 'cut', 'downgrade', 'sell', 'negative',
                         'recession', 'fear', 'crisis', 'layoff', 'bankruptcy', 'default'];

    let bullishCount = 0;
    let bearishCount = 0;

    bullishWords.forEach(word => {
      if (lower.includes(word)) bullishCount++;
    });

    bearishWords.forEach(word => {
      if (lower.includes(word)) bearishCount++;
    });

    if (bullishCount > bearishCount + 1) return 'positive';
    if (bearishCount > bullishCount + 1) return 'negative';
    return 'neutral';
  }

  /**
   * Extract stock symbols from text
   */
  extractSymbols(text) {
    const symbols = [];

    // Common stock symbols to look for
    const knownSymbols = ['AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'META', 'TSLA', 'NVDA',
                         'AMD', 'INTC', 'NFLX', 'DIS', 'BA', 'JPM', 'GS', 'V', 'MA',
                         'BTC', 'ETH', 'SPY', 'QQQ', 'ARKK', 'GME', 'AMC'];

    knownSymbols.forEach(symbol => {
      if (text.toUpperCase().includes(symbol)) {
        symbols.push(symbol);
      }
    });

    // Look for $SYMBOL pattern
    const tickerMatches = text.match(/\$([A-Z]{1,5})/g);
    if (tickerMatches) {
      tickerMatches.forEach(match => {
        const symbol = match.replace('$', '');
        if (!symbols.includes(symbol)) {
          symbols.push(symbol);
        }
      });
    }

    return symbols.slice(0, 3);
  }

  /**
   * Categorize news
   */
  categorizeNews(item) {
    const text = ((item.title || '') + ' ' + (item.description || '')).toLowerCase();

    if (text.includes('earnings') || text.includes('quarterly') || text.includes('revenue') || text.includes('eps')) {
      return 'earnings';
    }
    if (text.includes('crypto') || text.includes('bitcoin') || text.includes('ethereum') || text.includes('blockchain')) {
      return 'crypto';
    }
    if (text.includes('fed') || text.includes('interest rate') || text.includes('inflation') || text.includes('gdp')) {
      return 'economy';
    }
    if (text.includes('merger') || text.includes('acquisition') || text.includes('buyout') || text.includes('deal')) {
      return 'merger';
    }
    if (text.includes('ipo') || text.includes('public offering')) {
      return 'ipo';
    }
    return 'market';
  }

  /**
   * Fetch news from all RSS sources
   */
  async fetchAllRssNews(limit = 30) {
    const cacheKey = `rss_all_${limit}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      logger.info('[NewsService] Returning cached RSS news');
      return cached;
    }

    logger.info('[NewsService] Fetching from RSS feeds...');

    // Fetch from all feeds in parallel
    const feedPromises = this.rssFeeds.map(feed => this.fetchRssFeed(feed));
    const results = await Promise.allSettled(feedPromises);

    // Combine and flatten results
    let allNews = [];
    results.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value.length > 0) {
        allNews = allNews.concat(result.value);
        logger.debug(`[RSS] ${this.rssFeeds[index].name}: ${result.value.length} items`);
      }
    });

    // Sort by date (newest first)
    allNews.sort((a, b) => new Date(b.published_at) - new Date(a.published_at));

    // Remove duplicates by title similarity
    const uniqueNews = this.removeDuplicates(allNews);

    // Limit results
    const finalNews = uniqueNews.slice(0, limit);

    this.setCache(cacheKey, finalNews);
    logger.info(`[NewsService] Fetched ${finalNews.length} unique news items from RSS`);

    return finalNews;
  }

  /**
   * Remove duplicate news by title similarity
   */
  removeDuplicates(news) {
    const seen = new Set();
    return news.filter(item => {
      // Create a simplified version of the title for comparison
      const simplified = item.title.toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .substring(0, 50);

      if (seen.has(simplified)) {
        return false;
      }
      seen.add(simplified);
      return true;
    });
  }

  /**
   * Main news fetch method - tries RSS first, falls back to API
   */
  async fetchNews(options = {}) {
    const { symbols = '', limit = 20, category = 'all' } = options;

    // Try RSS feeds first (free, no API key needed)
    let news = await this.fetchAllRssNews(limit * 2);

    // Filter by category if specified
    if (category && category !== 'all') {
      news = news.filter(item => item.category === category);
    }

    // Filter by symbols if specified
    if (symbols) {
      const symbolList = symbols.split(',').map(s => s.trim().toUpperCase());
      const symbolNews = news.filter(item =>
        item.symbols && item.symbols.some(s => symbolList.includes(s))
      );
      if (symbolNews.length > 0) {
        news = symbolNews;
      }
    }

    // If RSS didn't return enough news and we have API key, supplement with API
    if (news.length < limit && this.apiKey) {
      try {
        const apiNews = await this.fetchFromMarketAux(options);
        news = [...news, ...apiNews];
        news = this.removeDuplicates(news);
      } catch (error) {
        logger.debug('[NewsService] MarketAux API fallback failed:', error.message);
      }
    }

    return news.slice(0, limit);
  }

  /**
   * Fetch from MarketAux API (backup)
   */
  async fetchFromMarketAux(options = {}) {
    if (!this.apiKey) return [];

    const { symbols = '', limit = 20, countries = 'us' } = options;

    try {
      const params = new URLSearchParams({
        api_token: this.apiKey,
        language: 'en',
        limit: limit.toString(),
        countries,
        sort: 'published_desc',
        filter_entities: 'true'
      });

      if (symbols) params.append('symbols', symbols);

      const response = await axios.get(`${this.baseUrl}/news/all?${params}`, { timeout: 15000 });

      if (response.data && response.data.data) {
        return response.data.data.map(item => this.transformMarketAuxItem(item));
      }
    } catch (error) {
      logger.error('[NewsService] MarketAux error:', error.message);
    }
    return [];
  }

  transformMarketAuxItem(item) {
    let sentiment = 'neutral';
    if (item.entities && item.entities.length > 0) {
      const scores = item.entities.filter(e => e.sentiment_score).map(e => e.sentiment_score);
      if (scores.length > 0) {
        const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
        sentiment = avg > 0.2 ? 'positive' : avg < -0.2 ? 'negative' : 'neutral';
      }
    }

    const symbols = item.entities
      ? item.entities.filter(e => e.type === 'equity').map(e => e.symbol).slice(0, 3)
      : [];

    return {
      id: item.uuid,
      title: item.title,
      headline: item.title,
      summary: item.description || item.snippet || '',
      source: item.source,
      url: item.url,
      image_url: item.image_url,
      published_at: item.published_at,
      datetime: item.published_at,
      symbol: symbols[0] || 'MARKET',
      symbols,
      sentiment,
      category: this.categorizeNews(item),
      relevance_score: item.relevance_score || 0.5
    };
  }

  // Public methods
  async getStockNews(symbols, limit = 10) {
    const symbolStr = Array.isArray(symbols) ? symbols.join(',') : symbols;
    return this.fetchNews({ symbols: symbolStr, limit });
  }

  async getMarketNews(limit = 20) {
    return this.fetchNews({ limit });
  }

  async getHoldingsNews(holdings, limit = 20) {
    if (!holdings || holdings.length === 0) {
      return this.getMarketNews(limit);
    }
    const symbols = holdings.map(h => h.symbol).filter(s => s).slice(0, 10).join(',');
    return this.fetchNews({ symbols, limit });
  }

  calculateSentimentSummary(news) {
    if (!news || news.length === 0) {
      return { bullish: 50, neutral: 0, bearish: 50 };
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
