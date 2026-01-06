/**
 * RSS News Feed Integration
 * Aggregates market news from multiple free RSS sources
 */

const express = require('express');
const router = express.Router();
const https = require('https');
const http = require('http');
const { parseString } = require('xml2js');

// RSS Feed Sources
const RSS_FEEDS = [
  // US Markets
  {
    name: 'Yahoo Finance',
    url: 'https://finance.yahoo.com/news/rssindex',
    category: 'general',
    priority: 1
  },
  {
    name: 'CNBC Top News',
    url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html',
    category: 'general',
    priority: 2
  },
  {
    name: 'CNBC Markets',
    url: 'https://www.cnbc.com/id/20910258/device/rss/rss.html',
    category: 'markets',
    priority: 1
  },
  {
    name: 'MarketWatch',
    url: 'https://feeds.marketwatch.com/marketwatch/topstories/',
    category: 'markets',
    priority: 2
  },
  {
    name: 'Seeking Alpha',
    url: 'https://seekingalpha.com/market_currents.xml',
    category: 'analysis',
    priority: 3
  },
  {
    name: 'Investing.com',
    url: 'https://www.investing.com/rss/news.rss',
    category: 'general',
    priority: 3
  },
  // International Markets
  {
    name: 'BBC Business',
    url: 'https://feeds.bbci.co.uk/news/business/rss.xml',
    category: 'international',
    priority: 1
  },
  {
    name: 'CNBC World',
    url: 'https://www.cnbc.com/id/100727362/device/rss/rss.html',
    category: 'international',
    priority: 2
  },
  {
    name: 'CNBC Europe',
    url: 'https://www.cnbc.com/id/19794221/device/rss/rss.html',
    category: 'europe',
    priority: 2
  },
  {
    name: 'CNBC Asia',
    url: 'https://www.cnbc.com/id/19832390/device/rss/rss.html',
    category: 'asia',
    priority: 2
  },
  {
    name: 'India Economic Times',
    url: 'https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms',
    category: 'asia',
    priority: 3
  },
  {
    name: 'Moneycontrol India',
    url: 'https://www.moneycontrol.com/rss/marketreports.xml',
    category: 'asia',
    priority: 3
  },
  {
    name: 'Japan Times Business',
    url: 'https://www.japantimes.co.jp/feed/business',
    category: 'asia',
    priority: 3
  },
  {
    name: 'Reuters World',
    url: 'https://www.reutersagency.com/feed/?taxonomy=best-regions&post_type=best',
    category: 'international',
    priority: 1
  },
  {
    name: 'Al Jazeera Business',
    url: 'https://www.aljazeera.com/xml/rss/all.xml',
    category: 'international',
    priority: 3
  },
  {
    name: 'DW Business',
    url: 'https://rss.dw.com/xml/rss-en-bus',
    category: 'europe',
    priority: 3
  }
];

// Cache for RSS feeds (5 minute TTL)
let newsCache = {
  data: null,
  timestamp: 0,
  TTL: 5 * 60 * 1000 // 5 minutes
};

/**
 * Fetch RSS feed from URL
 */
function fetchRSS(feedConfig) {
  return new Promise((resolve, reject) => {
    let urlObj;
    try {
      urlObj = new URL(feedConfig.url);
    } catch (e) {
      console.error(`[RSS] Invalid URL for ${feedConfig.name}: ${feedConfig.url}`);
      resolve([]);
      return;
    }
    const client = urlObj.protocol === 'https:' ? https : http;

    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*'
      },
      timeout: 10000
    };

    const req = client.request(options, (res) => {
      // Handle redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let redirectUrl = res.headers.location;
        // Handle relative URLs
        if (!redirectUrl.startsWith('http')) {
          redirectUrl = `${urlObj.protocol}//${urlObj.hostname}${redirectUrl}`;
        }
        fetchRSS({ ...feedConfig, url: redirectUrl })
          .then(resolve)
          .catch(reject);
        return;
      }

      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        parseString(data, { explicitArray: false, trim: true }, (err, result) => {
          if (err) {
            console.error(`[RSS] Parse error for ${feedConfig.name}:`, err.message);
            resolve([]);
            return;
          }

          try {
            const items = parseRSSItems(result, feedConfig);
            resolve(items);
          } catch (e) {
            console.error(`[RSS] Extract error for ${feedConfig.name}:`, e.message);
            resolve([]);
          }
        });
      });
    });

    req.on('error', (err) => {
      console.error(`[RSS] Fetch error for ${feedConfig.name}:`, err.message);
      resolve([]);
    });

    req.on('timeout', () => {
      req.destroy();
      console.error(`[RSS] Timeout for ${feedConfig.name}`);
      resolve([]);
    });

    req.end();
  });
}

/**
 * Parse RSS items from different feed formats
 */
function parseRSSItems(result, feedConfig) {
  let items = [];

  // Standard RSS 2.0
  if (result.rss && result.rss.channel) {
    const channel = result.rss.channel;
    items = Array.isArray(channel.item) ? channel.item : (channel.item ? [channel.item] : []);
  }
  // Atom format
  else if (result.feed && result.feed.entry) {
    items = Array.isArray(result.feed.entry) ? result.feed.entry : [result.feed.entry];
  }
  // RDF format
  else if (result['rdf:RDF'] && result['rdf:RDF'].item) {
    items = Array.isArray(result['rdf:RDF'].item) ? result['rdf:RDF'].item : [result['rdf:RDF'].item];
  }

  return items.slice(0, 15).map(item => {
    // Handle different date formats
    let pubDate = item.pubDate || item.published || item['dc:date'] || item.updated || new Date().toISOString();

    // Handle different link formats
    let link = item.link;
    if (typeof link === 'object') {
      link = link.$ ? link.$.href : (link.href || '');
    }

    // Handle different title formats
    let title = item.title;
    if (typeof title === 'object') {
      title = title._ || title['#text'] || '';
    }

    // Handle description
    let description = item.description || item.summary || item.content || '';
    if (typeof description === 'object') {
      description = description._ || description['#text'] || '';
    }
    // Strip HTML tags from description
    description = description.replace(/<[^>]*>/g, '').substring(0, 200);

    // Extract image if available
    let image = null;
    if (item['media:content'] && item['media:content'].$) {
      image = item['media:content'].$.url;
    } else if (item['media:thumbnail'] && item['media:thumbnail'].$) {
      image = item['media:thumbnail'].$.url;
    } else if (item.enclosure && item.enclosure.$) {
      image = item.enclosure.$.url;
    }

    return {
      title: title ? title.trim() : 'Untitled',
      link: link || '',
      description: description.trim(),
      pubDate: pubDate,
      source: feedConfig.name,
      category: feedConfig.category,
      priority: feedConfig.priority,
      image: image
    };
  });
}

/**
 * Calculate relative time
 */
function getRelativeTime(dateString) {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  } catch (e) {
    return 'Recently';
  }
}

/**
 * Deduplicate news items by title similarity
 */
function deduplicateNews(items) {
  const seen = new Map();
  const result = [];

  for (const item of items) {
    // Create a normalized key from title
    const normalizedTitle = item.title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 50);

    // Check for similar titles
    let isDuplicate = false;
    for (const [key, existingItem] of seen) {
      // Simple similarity check - if first 30 chars match
      if (normalizedTitle.substring(0, 30) === key.substring(0, 30)) {
        // Keep the one with higher priority (lower number = higher priority)
        if (item.priority < existingItem.priority) {
          seen.delete(key);
          seen.set(normalizedTitle, item);
          const idx = result.findIndex(r => r.title === existingItem.title);
          if (idx !== -1) result[idx] = item;
        }
        isDuplicate = true;
        break;
      }
    }

    if (!isDuplicate) {
      seen.set(normalizedTitle, item);
      result.push(item);
    }
  }

  return result;
}

/**
 * Fetch all RSS feeds and combine
 */
async function fetchAllFeeds() {
  console.log('[RSS] Fetching all RSS feeds...');

  const feedPromises = RSS_FEEDS.map(feed => fetchRSS(feed));
  const results = await Promise.all(feedPromises);

  // Flatten and combine all items
  let allItems = results.flat();

  // Add relative time
  allItems = allItems.map(item => ({
    ...item,
    relativeTime: getRelativeTime(item.pubDate)
  }));

  // Sort by date (newest first)
  allItems.sort((a, b) => {
    try {
      return new Date(b.pubDate) - new Date(a.pubDate);
    } catch (e) {
      return 0;
    }
  });

  // Deduplicate
  allItems = deduplicateNews(allItems);

  console.log(`[RSS] Fetched ${allItems.length} unique news items`);
  return allItems;
}

/**
 * GET /api/news/rss - Get aggregated RSS news
 */
router.get('/rss', async (req, res) => {
  try {
    const { category, limit = 50, refresh = false } = req.query;

    // Check cache
    const now = Date.now();
    if (!refresh && newsCache.data && (now - newsCache.timestamp) < newsCache.TTL) {
      console.log('[RSS] Serving from cache');
      let items = newsCache.data;

      if (category) {
        items = items.filter(item => item.category === category);
      }

      return res.json({
        success: true,
        cached: true,
        count: Math.min(items.length, parseInt(limit)),
        news: items.slice(0, parseInt(limit))
      });
    }

    // Fetch fresh data
    const allNews = await fetchAllFeeds();

    // Update cache
    newsCache.data = allNews;
    newsCache.timestamp = now;

    let items = allNews;
    if (category) {
      items = items.filter(item => item.category === category);
    }

    res.json({
      success: true,
      cached: false,
      count: Math.min(items.length, parseInt(limit)),
      news: items.slice(0, parseInt(limit))
    });

  } catch (error) {
    console.error('[RSS] Error fetching news:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch news',
      message: error.message
    });
  }
});

/**
 * GET /api/news/rss/sources - Get available RSS sources
 */
router.get('/rss/sources', (req, res) => {
  res.json({
    success: true,
    sources: RSS_FEEDS.map(f => ({
      name: f.name,
      category: f.category,
      priority: f.priority
    }))
  });
});

/**
 * GET /api/news/rss/breaking - Get breaking/latest news (top 10)
 */
router.get('/rss/breaking', async (req, res) => {
  try {
    const now = Date.now();

    // Use cache if available
    if (newsCache.data && (now - newsCache.timestamp) < newsCache.TTL) {
      const breaking = newsCache.data.slice(0, 10);
      return res.json({
        success: true,
        count: breaking.length,
        news: breaking
      });
    }

    // Fetch fresh
    const allNews = await fetchAllFeeds();
    newsCache.data = allNews;
    newsCache.timestamp = now;

    res.json({
      success: true,
      count: 10,
      news: allNews.slice(0, 10)
    });

  } catch (error) {
    console.error('[RSS] Error fetching breaking news:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch breaking news'
    });
  }
});

/**
 * GET /api/news/rss/headlines - Get headline ticker items
 */
router.get('/rss/headlines', async (req, res) => {
  try {
    const now = Date.now();

    if (newsCache.data && (now - newsCache.timestamp) < newsCache.TTL) {
      const headlines = newsCache.data.slice(0, 20).map(item => ({
        title: item.title,
        source: item.source,
        relativeTime: item.relativeTime,
        link: item.link
      }));
      return res.json({ success: true, headlines });
    }

    const allNews = await fetchAllFeeds();
    newsCache.data = allNews;
    newsCache.timestamp = now;

    const headlines = allNews.slice(0, 20).map(item => ({
      title: item.title,
      source: item.source,
      relativeTime: item.relativeTime,
      link: item.link
    }));

    res.json({ success: true, headlines });

  } catch (error) {
    console.error('[RSS] Error fetching headlines:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch headlines' });
  }
});

module.exports = router;
