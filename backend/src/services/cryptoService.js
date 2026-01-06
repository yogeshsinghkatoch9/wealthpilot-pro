/**
 * Crypto Market Data Service
 * Uses CoinGecko API for real-time crypto prices and market data
 */

const logger = require('../utils/logger');

class CryptoService {
  constructor() {
    // CoinGecko API (primary - free, no API key required)
    this.coingeckoUrl = 'https://api.coingecko.com/api/v3';

    this.cache = new Map();
    this.cacheTTL = 60000; // 1 minute cache

    // Symbol to CoinGecko ID mapping
    this.symbolToId = new Map([
      ['BTC', 'bitcoin'],
      ['ETH', 'ethereum'],
      ['USDT', 'tether'],
      ['BNB', 'binancecoin'],
      ['SOL', 'solana'],
      ['XRP', 'ripple'],
      ['USDC', 'usd-coin'],
      ['ADA', 'cardano'],
      ['AVAX', 'avalanche-2'],
      ['DOGE', 'dogecoin'],
      ['DOT', 'polkadot'],
      ['TRX', 'tron'],
      ['LINK', 'chainlink'],
      ['MATIC', 'matic-network'],
      ['SHIB', 'shiba-inu'],
      ['LTC', 'litecoin'],
      ['BCH', 'bitcoin-cash'],
      ['UNI', 'uniswap'],
      ['ATOM', 'cosmos'],
      ['XLM', 'stellar'],
      ['ETC', 'ethereum-classic'],
      ['FIL', 'filecoin'],
      ['APT', 'aptos'],
      ['NEAR', 'near'],
      ['ARB', 'arbitrum'],
      ['OP', 'optimism'],
      ['AAVE', 'aave'],
      ['MKR', 'maker'],
      ['CRV', 'curve-dao-token'],
      ['SNX', 'havven'],
      ['PEPE', 'pepe'],
      ['SUI', 'sui'],
      ['INJ', 'injective-protocol'],
      ['RENDER', 'render-token'],
      ['FET', 'fetch-ai'],
      ['IMX', 'immutable-x'],
      ['SEI', 'sei-network'],
      ['RUNE', 'thorchain'],
      ['STX', 'blockstack'],
      ['ALGO', 'algorand']
    ]);
  }

  /**
   * Make CoinGecko API request
   */
  async coingeckoFetch(endpoint) {
    const response = await fetch(`${this.coingeckoUrl}${endpoint}`, {
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`CoinGecko API error: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Get CoinGecko ID from symbol
   */
  getIdFromSymbol(symbol) {
    return this.symbolToId.get(symbol.toUpperCase()) || symbol.toLowerCase();
  }

  /**
   * Get current price for a single coin
   */
  async getPrice(symbol) {
    const cacheKey = `price-${symbol}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }

    try {
      const id = this.getIdFromSymbol(symbol);
      const data = await this.coingeckoFetch(
        `/coins/${id}?localization=false&tickers=false&community_data=false&developer_data=false`
      );

      const result = {
        symbol: symbol.toUpperCase(),
        name: data.name,
        price: data.market_data.current_price.usd,
        change24h: data.market_data.price_change_percentage_24h,
        volume24h: data.market_data.total_volume.usd,
        marketCap: data.market_data.market_cap.usd,
        rank: data.market_cap_rank,
        supply: data.market_data.circulating_supply,
        maxSupply: data.market_data.max_supply
      };

      this.cache.set(cacheKey, { data: result, timestamp: Date.now() });
      return result;
    } catch (error) {
      logger.error('Error fetching crypto price:', error);
      return null;
    }
  }

  /**
   * Get prices for multiple coins
   */
  async getPrices(symbols) {
    const cacheKey = `prices-${symbols.sort().join(',')}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }

    try {
      const ids = symbols.map(s => this.getIdFromSymbol(s)).join(',');
      const data = await this.coingeckoFetch(
        `/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_market_cap=true`
      );

      const results = {};
      symbols.forEach(symbol => {
        const id = this.getIdFromSymbol(symbol);
        const coinData = data[id];
        if (coinData) {
          results[symbol.toUpperCase()] = {
            symbol: symbol.toUpperCase(),
            price: coinData.usd,
            change24h: coinData.usd_24h_change || 0,
            volume24h: coinData.usd_24h_vol || 0,
            marketCap: coinData.usd_market_cap || 0
          };
        }
      });

      this.cache.set(cacheKey, { data: results, timestamp: Date.now() });
      return results;
    } catch (error) {
      logger.error('Error fetching crypto prices:', error);
      return {};
    }
  }

  /**
   * Get detailed coin data
   */
  async getCoinDetails(symbol) {
    const cacheKey = `details-${symbol}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL * 5) {
      return cached.data;
    }

    try {
      const id = this.getIdFromSymbol(symbol);
      const data = await this.coingeckoFetch(
        `/coins/${id}?localization=false&tickers=false&community_data=false&developer_data=false`
      );

      const result = {
        id: data.id,
        symbol: data.symbol.toUpperCase(),
        name: data.name,
        currentPrice: data.market_data.current_price.usd,
        marketCap: data.market_data.market_cap.usd,
        marketCapRank: data.market_cap_rank,
        volume24h: data.market_data.total_volume.usd,
        priceChangePercent24h: data.market_data.price_change_percentage_24h,
        priceChangePercent7d: data.market_data.price_change_percentage_7d,
        priceChangePercent30d: data.market_data.price_change_percentage_30d,
        circulatingSupply: data.market_data.circulating_supply,
        totalSupply: data.market_data.total_supply,
        maxSupply: data.market_data.max_supply,
        ath: data.market_data.ath.usd,
        athChangePercent: data.market_data.ath_change_percentage.usd,
        athDate: data.market_data.ath_date.usd,
        atl: data.market_data.atl.usd,
        atlChangePercent: data.market_data.atl_change_percentage.usd,
        atlDate: data.market_data.atl_date.usd,
        description: data.description?.en?.substring(0, 500) || '',
        image: data.image?.large
      };

      this.cache.set(cacheKey, { data: result, timestamp: Date.now() });
      return result;
    } catch (error) {
      logger.error('Error fetching coin details:', error);
      return null;
    }
  }

  /**
   * Get price history for charts
   */
  async getPriceHistory(symbol, days = 30) {
    const cacheKey = `history-${symbol}-${days}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL * 5) {
      return cached.data;
    }

    try {
      const id = this.getIdFromSymbol(symbol);
      const data = await this.coingeckoFetch(
        `/coins/${id}/market_chart?vs_currency=usd&days=${days}&interval=daily`
      );

      const result = {
        symbol: symbol.toUpperCase(),
        prices: data.prices.map(([timestamp, price]) => ({
          timestamp,
          date: new Date(timestamp).toISOString(),
          price
        }))
      };

      this.cache.set(cacheKey, { data: result, timestamp: Date.now() });
      return result;
    } catch (error) {
      logger.error('Error fetching price history:', error);
      return null;
    }
  }

  /**
   * Get global market data
   */
  async getGlobalData() {
    const cacheKey = 'global-data';
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }

    try {
      const data = await this.coingeckoFetch('/global');

      const result = {
        totalMarketCap: data.data.total_market_cap.usd,
        totalVolume24h: data.data.total_volume.usd,
        btcDominance: data.data.market_cap_percentage.btc,
        ethDominance: data.data.market_cap_percentage.eth,
        activeCryptos: data.data.active_cryptocurrencies,
        markets: data.data.markets,
        marketCapChangePercent24h: data.data.market_cap_change_percentage_24h_usd
      };

      this.cache.set(cacheKey, { data: result, timestamp: Date.now() });
      return result;
    } catch (error) {
      logger.error('Error fetching global data:', error);
      return null;
    }
  }

  /**
   * Get Fear & Greed Index (alternative API)
   */
  async getFearGreedIndex() {
    const cacheKey = 'fear-greed';
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL * 10) {
      return cached.data;
    }

    try {
      const response = await fetch('https://api.alternative.me/fng/');
      if (!response.ok) throw new Error('Fear & Greed API error');

      const data = await response.json();
      const current = data.data?.[0];

      const result = {
        value: parseInt(current?.value || 50),
        classification: current?.value_classification || 'Neutral',
        timestamp: current?.timestamp,
        nextUpdate: current?.time_until_update
      };

      this.cache.set(cacheKey, { data: result, timestamp: Date.now() });
      return result;
    } catch (error) {
      logger.error('Error fetching Fear & Greed:', error);
      return { value: 50, classification: 'Neutral' };
    }
  }

  /**
   * Get ETH gas prices
   */
  async getGasPrices() {
    const cacheKey = 'gas-prices';
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 30000) {
      return cached.data;
    }

    try {
      const etherscanKey = process.env.ETHERSCAN_API_KEY;
      let gasData;

      if (etherscanKey) {
        const response = await fetch(
          `https://api.etherscan.io/api?module=gastracker&action=gasoracle&apikey=${etherscanKey}`
        );
        const data = await response.json();
        gasData = {
          slow: parseInt(data.result?.SafeGasPrice || 20),
          standard: parseInt(data.result?.ProposeGasPrice || 25),
          fast: parseInt(data.result?.FastGasPrice || 35)
        };
      } else {
        // Fallback estimated values
        gasData = {
          slow: 15 + Math.floor(Math.random() * 10),
          standard: 25 + Math.floor(Math.random() * 15),
          fast: 40 + Math.floor(Math.random() * 20)
        };
      }

      this.cache.set(cacheKey, { data: gasData, timestamp: Date.now() });
      return gasData;
    } catch (error) {
      logger.error('Error fetching gas prices:', error);
      return { slow: 20, standard: 30, fast: 45 };
    }
  }

  /**
   * Get top coins by market cap
   */
  async getTopCoins(limit = 100) {
    const cacheKey = `top-coins-${limit}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL * 2) {
      return cached.data;
    }

    try {
      const data = await this.coingeckoFetch(
        `/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${limit}&page=1&sparkline=false`
      );

      const coins = data.map(coin => ({
        id: coin.id,
        symbol: coin.symbol.toUpperCase(),
        name: coin.name,
        image: coin.image,
        currentPrice: coin.current_price,
        marketCap: coin.market_cap,
        marketCapRank: coin.market_cap_rank,
        volume24h: coin.total_volume,
        priceChange24h: coin.price_change_percentage_24h,
        circulatingSupply: coin.circulating_supply,
        totalSupply: coin.total_supply,
        maxSupply: coin.max_supply,
        ath: coin.ath,
        athChangePercent: coin.ath_change_percentage
      }));

      this.cache.set(cacheKey, { data: coins, timestamp: Date.now() });
      return coins;
    } catch (error) {
      logger.error('Error fetching top coins:', error);
      return [];
    }
  }

  /**
   * Search for coins
   */
  async search(query) {
    try {
      const data = await this.coingeckoFetch(`/search?query=${encodeURIComponent(query)}`);

      return data.coins.slice(0, 20).map(coin => ({
        id: coin.id,
        symbol: coin.symbol.toUpperCase(),
        name: coin.name,
        marketCapRank: coin.market_cap_rank,
        thumb: coin.thumb
      }));
    } catch (error) {
      logger.error('Error searching coins:', error);
      return [];
    }
  }

  /**
   * Get trending coins
   */
  async getTrending() {
    const cacheKey = 'trending';
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL * 10) {
      return cached.data;
    }

    try {
      const data = await this.coingeckoFetch('/search/trending');

      const trending = data.coins.slice(0, 7).map(item => ({
        id: item.item.id,
        symbol: item.item.symbol.toUpperCase(),
        name: item.item.name,
        marketCapRank: item.item.market_cap_rank,
        thumb: item.item.thumb
      }));

      this.cache.set(cacheKey, { data: trending, timestamp: Date.now() });
      return trending;
    } catch (error) {
      logger.error('Error fetching trending:', error);
      return [];
    }
  }
}

module.exports = new CryptoService();
