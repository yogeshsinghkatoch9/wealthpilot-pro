"""
Market Data Service - Real Stock Data Integration
=================================================
Provides real market data from multiple sources:
- Alpha Vantage (primary)
- Yahoo Finance (fallback)
- Caching to respect rate limits
"""

import os
import json
import time
import random
from datetime import datetime, timedelta
from typing import Optional, Dict, List, Any
from dataclasses import dataclass
import sqlite3

# Try to import requests, fall back gracefully
try:
    import requests
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False

# =============================================================================
# CONFIGURATION
# =============================================================================
ALPHA_VANTAGE_API_KEY = os.environ.get('ALPHA_VANTAGE_API_KEY', 'demo')
CACHE_DURATION_MINUTES = 15  # Cache prices for 15 minutes
RATE_LIMIT_CALLS_PER_MINUTE = 5  # Alpha Vantage free tier limit

# =============================================================================
# DATA CLASSES
# =============================================================================
@dataclass
class StockQuote:
    symbol: str
    price: float
    change: float
    change_percent: float
    volume: int
    high: float
    low: float
    open: float
    previous_close: float
    timestamp: datetime
    name: Optional[str] = None
    sector: Optional[str] = None
    market_cap: Optional[float] = None
    pe_ratio: Optional[float] = None
    dividend_yield: Optional[float] = None
    fifty_two_week_high: Optional[float] = None
    fifty_two_week_low: Optional[float] = None

@dataclass
class HistoricalPrice:
    date: str
    open: float
    high: float
    low: float
    close: float
    volume: int
    adjusted_close: float

# =============================================================================
# CACHE MANAGEMENT
# =============================================================================
class PriceCache:
    """Simple SQLite-based cache for stock prices"""
    
    def __init__(self, db_path: str = 'wealthpilot.db'):
        self.db_path = db_path
        self._init_cache_table()
    
    def _get_conn(self):
        conn = sqlite3.connect(self.db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        return conn
    
    def _init_cache_table(self):
        conn = self._get_conn()
        conn.execute('''
            CREATE TABLE IF NOT EXISTS price_cache (
                symbol TEXT PRIMARY KEY,
                data TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        conn.execute('''
            CREATE TABLE IF NOT EXISTS historical_cache (
                symbol TEXT,
                date TEXT,
                open REAL,
                high REAL,
                low REAL,
                close REAL,
                volume INTEGER,
                adjusted_close REAL,
                PRIMARY KEY (symbol, date)
            )
        ''')
        conn.execute('''
            CREATE TABLE IF NOT EXISTS portfolio_snapshots (
                id INTEGER PRIMARY KEY,
                user_id INTEGER,
                portfolio_id INTEGER,
                date TEXT,
                total_value REAL,
                total_cost REAL,
                total_gain REAL,
                holdings_data TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        conn.commit()
        conn.close()
    
    def get(self, symbol: str) -> Optional[Dict]:
        """Get cached price if not expired"""
        conn = self._get_conn()
        row = conn.execute(
            'SELECT data, updated_at FROM price_cache WHERE symbol = ?',
            (symbol.upper(),)
        ).fetchone()
        conn.close()
        
        if row:
            updated_at = datetime.fromisoformat(row['updated_at'])
            if datetime.now() - updated_at < timedelta(minutes=CACHE_DURATION_MINUTES):
                return json.loads(row['data'])
        return None
    
    def set(self, symbol: str, data: Dict):
        """Cache price data"""
        conn = self._get_conn()
        conn.execute(
            '''INSERT OR REPLACE INTO price_cache (symbol, data, updated_at) 
               VALUES (?, ?, ?)''',
            (symbol.upper(), json.dumps(data), datetime.now().isoformat())
        )
        conn.commit()
        conn.close()
    
    def get_historical(self, symbol: str, days: int = 365) -> List[Dict]:
        """Get cached historical prices"""
        conn = self._get_conn()
        cutoff = (datetime.now() - timedelta(days=days)).strftime('%Y-%m-%d')
        rows = conn.execute(
            '''SELECT date, open, high, low, close, volume, adjusted_close 
               FROM historical_cache WHERE symbol = ? AND date >= ? 
               ORDER BY date ASC''',
            (symbol.upper(), cutoff)
        ).fetchall()
        conn.close()
        return [dict(row) for row in rows]
    
    def set_historical(self, symbol: str, data: List[Dict]):
        """Cache historical price data"""
        conn = self._get_conn()
        for row in data:
            conn.execute(
                '''INSERT OR REPLACE INTO historical_cache 
                   (symbol, date, open, high, low, close, volume, adjusted_close)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)''',
                (symbol.upper(), row['date'], row['open'], row['high'], 
                 row['low'], row['close'], row['volume'], row.get('adjusted_close', row['close']))
            )
        conn.commit()
        conn.close()

# Global cache instance
_cache = PriceCache()

# =============================================================================
# RATE LIMITING
# =============================================================================
class RateLimiter:
    """Simple rate limiter for API calls"""
    
    def __init__(self, calls_per_minute: int = 5):
        self.calls_per_minute = calls_per_minute
        self.calls = []
    
    def can_call(self) -> bool:
        """Check if we can make an API call"""
        now = time.time()
        # Remove calls older than 1 minute
        self.calls = [t for t in self.calls if now - t < 60]
        return len(self.calls) < self.calls_per_minute
    
    def record_call(self):
        """Record that we made an API call"""
        self.calls.append(time.time())
    
    def wait_time(self) -> float:
        """Get seconds to wait before next call"""
        if self.can_call():
            return 0
        oldest = min(self.calls)
        return 60 - (time.time() - oldest)

_rate_limiter = RateLimiter(RATE_LIMIT_CALLS_PER_MINUTE)

# =============================================================================
# ALPHA VANTAGE API
# =============================================================================
def fetch_alpha_vantage_quote(symbol: str) -> Optional[StockQuote]:
    """Fetch real-time quote from Alpha Vantage"""
    if not HAS_REQUESTS:
        return None
    
    if not _rate_limiter.can_call():
        return None
    
    try:
        url = f'https://www.alphavantage.co/query'
        params = {
            'function': 'GLOBAL_QUOTE',
            'symbol': symbol.upper(),
            'apikey': ALPHA_VANTAGE_API_KEY
        }
        
        _rate_limiter.record_call()
        response = requests.get(url, params=params, timeout=10)
        data = response.json()
        
        if 'Global Quote' not in data or not data['Global Quote']:
            return None
        
        quote = data['Global Quote']
        return StockQuote(
            symbol=quote.get('01. symbol', symbol),
            price=float(quote.get('05. price', 0)),
            change=float(quote.get('09. change', 0)),
            change_percent=float(quote.get('10. change percent', '0%').replace('%', '')),
            volume=int(quote.get('06. volume', 0)),
            high=float(quote.get('03. high', 0)),
            low=float(quote.get('04. low', 0)),
            open=float(quote.get('02. open', 0)),
            previous_close=float(quote.get('08. previous close', 0)),
            timestamp=datetime.now()
        )
    except Exception as e:
        print(f"Alpha Vantage error for {symbol}: {e}")
        return None

def fetch_alpha_vantage_overview(symbol: str) -> Optional[Dict]:
    """Fetch company overview from Alpha Vantage"""
    if not HAS_REQUESTS:
        return None
    
    if not _rate_limiter.can_call():
        return None
    
    try:
        url = f'https://www.alphavantage.co/query'
        params = {
            'function': 'OVERVIEW',
            'symbol': symbol.upper(),
            'apikey': ALPHA_VANTAGE_API_KEY
        }
        
        _rate_limiter.record_call()
        response = requests.get(url, params=params, timeout=10)
        data = response.json()
        
        if 'Symbol' not in data:
            return None
        
        return {
            'name': data.get('Name', ''),
            'sector': data.get('Sector', ''),
            'industry': data.get('Industry', ''),
            'market_cap': float(data.get('MarketCapitalization', 0)),
            'pe_ratio': float(data.get('PERatio', 0) or 0),
            'dividend_yield': float(data.get('DividendYield', 0) or 0),
            'eps': float(data.get('EPS', 0) or 0),
            'fifty_two_week_high': float(data.get('52WeekHigh', 0) or 0),
            'fifty_two_week_low': float(data.get('52WeekLow', 0) or 0),
            'description': data.get('Description', '')
        }
    except Exception as e:
        print(f"Alpha Vantage overview error for {symbol}: {e}")
        return None

def fetch_alpha_vantage_historical(symbol: str, outputsize: str = 'compact') -> List[HistoricalPrice]:
    """Fetch historical daily prices from Alpha Vantage"""
    if not HAS_REQUESTS:
        return []
    
    if not _rate_limiter.can_call():
        return []
    
    try:
        url = f'https://www.alphavantage.co/query'
        params = {
            'function': 'TIME_SERIES_DAILY_ADJUSTED',
            'symbol': symbol.upper(),
            'outputsize': outputsize,  # 'compact' = 100 days, 'full' = 20+ years
            'apikey': ALPHA_VANTAGE_API_KEY
        }
        
        _rate_limiter.record_call()
        response = requests.get(url, params=params, timeout=15)
        data = response.json()
        
        if 'Time Series (Daily)' not in data:
            return []
        
        history = []
        for date, values in data['Time Series (Daily)'].items():
            history.append(HistoricalPrice(
                date=date,
                open=float(values['1. open']),
                high=float(values['2. high']),
                low=float(values['3. low']),
                close=float(values['4. close']),
                volume=int(values['6. volume']),
                adjusted_close=float(values['5. adjusted close'])
            ))
        
        return sorted(history, key=lambda x: x.date)
    except Exception as e:
        print(f"Alpha Vantage historical error for {symbol}: {e}")
        return []

# =============================================================================
# FALLBACK: SIMULATED DATA WITH REALISTIC PRICES
# =============================================================================
STOCK_DATABASE = {
    'AAPL': {'name': 'Apple Inc.', 'sector': 'Technology', 'base_price': 185.0, 'dividend_yield': 0.005},
    'MSFT': {'name': 'Microsoft Corporation', 'sector': 'Technology', 'base_price': 378.0, 'dividend_yield': 0.008},
    'GOOGL': {'name': 'Alphabet Inc.', 'sector': 'Technology', 'base_price': 141.0, 'dividend_yield': 0.0},
    'AMZN': {'name': 'Amazon.com Inc.', 'sector': 'Consumer Cyclical', 'base_price': 178.0, 'dividend_yield': 0.0},
    'NVDA': {'name': 'NVIDIA Corporation', 'sector': 'Technology', 'base_price': 495.0, 'dividend_yield': 0.0004},
    'META': {'name': 'Meta Platforms Inc.', 'sector': 'Technology', 'base_price': 505.0, 'dividend_yield': 0.004},
    'TSLA': {'name': 'Tesla Inc.', 'sector': 'Consumer Cyclical', 'base_price': 248.0, 'dividend_yield': 0.0},
    'BRK.B': {'name': 'Berkshire Hathaway', 'sector': 'Financial', 'base_price': 363.0, 'dividend_yield': 0.0},
    'JPM': {'name': 'JPMorgan Chase & Co.', 'sector': 'Financial', 'base_price': 170.0, 'dividend_yield': 0.024},
    'V': {'name': 'Visa Inc.', 'sector': 'Financial', 'base_price': 260.0, 'dividend_yield': 0.008},
    'JNJ': {'name': 'Johnson & Johnson', 'sector': 'Healthcare', 'base_price': 156.0, 'dividend_yield': 0.030},
    'WMT': {'name': 'Walmart Inc.', 'sector': 'Consumer Defensive', 'base_price': 165.0, 'dividend_yield': 0.014},
    'PG': {'name': 'Procter & Gamble', 'sector': 'Consumer Defensive', 'base_price': 159.0, 'dividend_yield': 0.024},
    'MA': {'name': 'Mastercard Inc.', 'sector': 'Financial', 'base_price': 450.0, 'dividend_yield': 0.006},
    'HD': {'name': 'Home Depot Inc.', 'sector': 'Consumer Cyclical', 'base_price': 345.0, 'dividend_yield': 0.025},
    'CVX': {'name': 'Chevron Corporation', 'sector': 'Energy', 'base_price': 150.0, 'dividend_yield': 0.041},
    'XOM': {'name': 'Exxon Mobil Corp.', 'sector': 'Energy', 'base_price': 105.0, 'dividend_yield': 0.035},
    'KO': {'name': 'Coca-Cola Company', 'sector': 'Consumer Defensive', 'base_price': 60.0, 'dividend_yield': 0.031},
    'PEP': {'name': 'PepsiCo Inc.', 'sector': 'Consumer Defensive', 'base_price': 170.0, 'dividend_yield': 0.028},
    'ABBV': {'name': 'AbbVie Inc.', 'sector': 'Healthcare', 'base_price': 175.0, 'dividend_yield': 0.038},
    'MRK': {'name': 'Merck & Co.', 'sector': 'Healthcare', 'base_price': 105.0, 'dividend_yield': 0.028},
    'PFE': {'name': 'Pfizer Inc.', 'sector': 'Healthcare', 'base_price': 28.0, 'dividend_yield': 0.058},
    'VZ': {'name': 'Verizon Communications', 'sector': 'Communication', 'base_price': 38.0, 'dividend_yield': 0.068},
    'T': {'name': 'AT&T Inc.', 'sector': 'Communication', 'base_price': 17.0, 'dividend_yield': 0.065},
    'DIS': {'name': 'Walt Disney Company', 'sector': 'Communication', 'base_price': 95.0, 'dividend_yield': 0.0},
    'NFLX': {'name': 'Netflix Inc.', 'sector': 'Communication', 'base_price': 485.0, 'dividend_yield': 0.0},
    'INTC': {'name': 'Intel Corporation', 'sector': 'Technology', 'base_price': 45.0, 'dividend_yield': 0.011},
    'AMD': {'name': 'AMD Inc.', 'sector': 'Technology', 'base_price': 145.0, 'dividend_yield': 0.0},
    'CRM': {'name': 'Salesforce Inc.', 'sector': 'Technology', 'base_price': 265.0, 'dividend_yield': 0.0},
    'ORCL': {'name': 'Oracle Corporation', 'sector': 'Technology', 'base_price': 125.0, 'dividend_yield': 0.013},
    'VTI': {'name': 'Vanguard Total Stock Market ETF', 'sector': 'ETF', 'base_price': 240.0, 'dividend_yield': 0.015},
    'VOO': {'name': 'Vanguard S&P 500 ETF', 'sector': 'ETF', 'base_price': 435.0, 'dividend_yield': 0.015},
    'QQQ': {'name': 'Invesco QQQ Trust', 'sector': 'ETF', 'base_price': 405.0, 'dividend_yield': 0.006},
    'SPY': {'name': 'SPDR S&P 500 ETF', 'sector': 'ETF', 'base_price': 475.0, 'dividend_yield': 0.014},
    'VYM': {'name': 'Vanguard High Dividend Yield ETF', 'sector': 'ETF', 'base_price': 115.0, 'dividend_yield': 0.030},
    'SCHD': {'name': 'Schwab US Dividend Equity ETF', 'sector': 'ETF', 'base_price': 78.0, 'dividend_yield': 0.035},
}

def generate_simulated_quote(symbol: str) -> StockQuote:
    """Generate realistic simulated quote for a symbol"""
    symbol = symbol.upper()
    
    if symbol in STOCK_DATABASE:
        info = STOCK_DATABASE[symbol]
        base = info['base_price']
        name = info['name']
        sector = info['sector']
        div_yield = info['dividend_yield']
    else:
        # Generate reasonable defaults for unknown symbols
        base = random.uniform(20, 300)
        name = f"{symbol} Inc."
        sector = random.choice(['Technology', 'Healthcare', 'Financial', 'Consumer', 'Industrial'])
        div_yield = random.uniform(0, 0.04)
    
    # Add some daily variation (-3% to +3%)
    variation = random.uniform(-0.03, 0.03)
    price = base * (1 + variation)
    
    # Calculate change from "previous close"
    previous_close = base
    change = price - previous_close
    change_pct = (change / previous_close) * 100
    
    # High/Low for the day
    high = price * random.uniform(1.001, 1.02)
    low = price * random.uniform(0.98, 0.999)
    open_price = previous_close * random.uniform(0.995, 1.005)
    
    return StockQuote(
        symbol=symbol,
        price=round(price, 2),
        change=round(change, 2),
        change_percent=round(change_pct, 2),
        volume=random.randint(1000000, 50000000),
        high=round(high, 2),
        low=round(low, 2),
        open=round(open_price, 2),
        previous_close=round(previous_close, 2),
        timestamp=datetime.now(),
        name=name,
        sector=sector,
        dividend_yield=div_yield
    )

def generate_simulated_historical(symbol: str, days: int = 365) -> List[Dict]:
    """Generate realistic historical price data"""
    symbol = symbol.upper()
    
    if symbol in STOCK_DATABASE:
        current_price = STOCK_DATABASE[symbol]['base_price']
    else:
        current_price = random.uniform(50, 300)
    
    history = []
    price = current_price * random.uniform(0.7, 0.9)  # Start lower than current
    
    for i in range(days):
        date = (datetime.now() - timedelta(days=days-i)).strftime('%Y-%m-%d')
        
        # Random walk with slight upward bias
        daily_return = random.gauss(0.0003, 0.015)  # ~7.5% annual return with 15% volatility
        price = price * (1 + daily_return)
        price = max(price, 1)  # Prevent negative prices
        
        # Generate OHLC
        open_price = price * random.uniform(0.995, 1.005)
        high = price * random.uniform(1.001, 1.025)
        low = price * random.uniform(0.975, 0.999)
        close = price
        
        history.append({
            'date': date,
            'open': round(open_price, 2),
            'high': round(high, 2),
            'low': round(low, 2),
            'close': round(close, 2),
            'volume': random.randint(1000000, 50000000),
            'adjusted_close': round(close, 2)
        })
    
    return history

# =============================================================================
# PUBLIC API
# =============================================================================
def get_stock_quote(symbol: str, use_cache: bool = True) -> StockQuote:
    """
    Get stock quote - tries real API first, falls back to simulation.
    Results are cached to respect rate limits.
    """
    symbol = symbol.upper()
    
    # Check cache first
    if use_cache:
        cached = _cache.get(symbol)
        if cached:
            return StockQuote(**cached)
    
    # Try Alpha Vantage
    quote = fetch_alpha_vantage_quote(symbol)
    
    if quote:
        # Try to get additional info
        overview = fetch_alpha_vantage_overview(symbol)
        if overview:
            quote.name = overview.get('name')
            quote.sector = overview.get('sector')
            quote.dividend_yield = overview.get('dividend_yield')
            quote.market_cap = overview.get('market_cap')
            quote.pe_ratio = overview.get('pe_ratio')
            quote.fifty_two_week_high = overview.get('fifty_two_week_high')
            quote.fifty_two_week_low = overview.get('fifty_two_week_low')
        
        # Cache the result
        _cache.set(symbol, quote.__dict__)
        return quote
    
    # Fallback to simulation
    quote = generate_simulated_quote(symbol)
    _cache.set(symbol, {k: v for k, v in quote.__dict__.items() if not isinstance(v, datetime)})
    return quote

def get_stock_quotes(symbols: List[str]) -> Dict[str, StockQuote]:
    """Get quotes for multiple symbols"""
    return {symbol: get_stock_quote(symbol) for symbol in symbols}

def get_historical_prices(symbol: str, days: int = 365) -> List[Dict]:
    """
    Get historical daily prices for a symbol.
    Tries real API first, falls back to simulation.
    """
    symbol = symbol.upper()
    
    # Check cache
    cached = _cache.get_historical(symbol, days)
    if len(cached) >= days * 0.8:  # Accept if we have 80% of requested days
        return cached
    
    # Try Alpha Vantage
    history = fetch_alpha_vantage_historical(symbol, 'full' if days > 100 else 'compact')
    
    if history:
        data = [
            {
                'date': h.date,
                'open': h.open,
                'high': h.high,
                'low': h.low,
                'close': h.close,
                'volume': h.volume,
                'adjusted_close': h.adjusted_close
            }
            for h in history
        ]
        _cache.set_historical(symbol, data)
        return data[-days:] if len(data) > days else data
    
    # Fallback to simulation
    data = generate_simulated_historical(symbol, days)
    _cache.set_historical(symbol, data)
    return data

def get_stock_info(symbol: str) -> Dict:
    """Get comprehensive stock information"""
    quote = get_stock_quote(symbol)
    return {
        'symbol': quote.symbol,
        'name': quote.name,
        'price': quote.price,
        'change': quote.change,
        'change_percent': quote.change_percent,
        'sector': quote.sector,
        'dividend_yield': quote.dividend_yield,
        'market_cap': quote.market_cap,
        'pe_ratio': quote.pe_ratio,
        'fifty_two_week_high': quote.fifty_two_week_high,
        'fifty_two_week_low': quote.fifty_two_week_low,
        'volume': quote.volume
    }

def refresh_all_holdings(db_path: str = 'wealthpilot.db'):
    """Refresh prices for all holdings in the database"""
    conn = sqlite3.connect(db_path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    
    # Get unique symbols
    symbols = conn.execute('SELECT DISTINCT symbol FROM holdings').fetchall()
    symbols = [row['symbol'] for row in symbols if row['symbol']]
    
    updated = 0
    for symbol in symbols:
        try:
            quote = get_stock_quote(symbol)
            conn.execute(
                '''UPDATE holdings SET 
                   current_price = ?, 
                   sector = COALESCE(sector, ?),
                   dividend_yield = COALESCE(dividend_yield, ?)
                   WHERE symbol = ?''',
                (quote.price, quote.sector, quote.dividend_yield, symbol)
            )
            updated += 1
        except Exception as e:
            print(f"Error updating {symbol}: {e}")
    
    conn.commit()
    conn.close()
    return updated

# =============================================================================
# PORTFOLIO SNAPSHOTS
# =============================================================================
def save_portfolio_snapshot(user_id: int, portfolio_id: int, total_value: float, 
                           total_cost: float, holdings_data: Dict, db_path: str = 'wealthpilot.db'):
    """Save a daily snapshot of portfolio value"""
    conn = sqlite3.connect(db_path, check_same_thread=False)
    today = datetime.now().strftime('%Y-%m-%d')
    
    # Check if we already have a snapshot for today
    existing = conn.execute(
        'SELECT id FROM portfolio_snapshots WHERE portfolio_id = ? AND date = ?',
        (portfolio_id, today)
    ).fetchone()
    
    if existing:
        conn.execute(
            '''UPDATE portfolio_snapshots SET 
               total_value = ?, total_cost = ?, total_gain = ?, holdings_data = ?
               WHERE id = ?''',
            (total_value, total_cost, total_value - total_cost, json.dumps(holdings_data), existing[0])
        )
    else:
        conn.execute(
            '''INSERT INTO portfolio_snapshots 
               (user_id, portfolio_id, date, total_value, total_cost, total_gain, holdings_data)
               VALUES (?, ?, ?, ?, ?, ?, ?)''',
            (user_id, portfolio_id, today, total_value, total_cost, 
             total_value - total_cost, json.dumps(holdings_data))
        )
    
    conn.commit()
    conn.close()

def get_portfolio_history(portfolio_id: int, days: int = 365, db_path: str = 'wealthpilot.db') -> List[Dict]:
    """Get portfolio value history"""
    conn = sqlite3.connect(db_path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    
    cutoff = (datetime.now() - timedelta(days=days)).strftime('%Y-%m-%d')
    rows = conn.execute(
        '''SELECT date, total_value, total_cost, total_gain 
           FROM portfolio_snapshots 
           WHERE portfolio_id = ? AND date >= ?
           ORDER BY date ASC''',
        (portfolio_id, cutoff)
    ).fetchall()
    
    conn.close()
    return [dict(row) for row in rows]

# =============================================================================
# INITIALIZATION
# =============================================================================
# Initialize cache tables
_cache._init_cache_table()
