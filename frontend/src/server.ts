import express from 'express';
import path from 'path';
import cookieParser from 'cookie-parser';
import { createProxyMiddleware } from 'http-proxy-middleware';

const app = express();
const PORT = process.env.PORT || 3000;
const API_URL = process.env.API_URL || 'http://localhost:4000';
const API_BASE = `${API_URL}/api`;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));
app.use(express.static(path.join(__dirname, '../public')));
app.use(cookieParser());

console.log(`[Frontend] Starting with API_URL: ${API_URL}`);
console.log(`[Frontend] API_BASE: ${API_BASE}`);

// Health check endpoint (must be before API proxy)
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'frontend',
    apiUrl: API_URL,
    timestamp: new Date().toISOString()
  });
});

// API Proxy - Use http-proxy-middleware for proper proxying of all request types including file uploads
// Note: app.use('/api', ...) strips /api prefix, so we need pathRewrite to add it back
app.use('/api', createProxyMiddleware({
  target: API_URL,
  changeOrigin: true,
  pathRewrite: (path, req) => {
    // app.use('/api', ...) strips /api, so add it back
    return '/api' + path;
  },
  on: {
    proxyReq: (proxyReq, req: any, res) => {
      // ALWAYS set Authorization from cookie (most reliable source)
      // This ensures the token is forwarded even if client-side JS fails
      const cookieToken = req.cookies?.token;
      const headerToken = req.headers.authorization?.replace('Bearer ', '');

      // Prefer cookie token, fall back to header token
      const token = cookieToken || headerToken;

      if (token) {
        proxyReq.setHeader('Authorization', `Bearer ${token}`);
        console.log(`[Proxy] ${req.method} ${req.originalUrl} -> ${API_URL}/api${req.url} [Token: ${token.substring(0, 20)}...]`);
      } else {
        console.log(`[Proxy] ${req.method} ${req.originalUrl} -> ${API_URL}/api${req.url} [NO TOKEN!]`);
      }
    },
    error: (err, req, res: any) => {
      console.error('[Proxy Error]', err.message);
      res.status(500).json({ error: 'Proxy error: ' + err.message });
    }
  }
}));

// Parse JSON/URL-encoded bodies for non-API routes (after proxy to avoid interfering with file uploads)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Theme middleware
app.use((req, res, next) => {
  res.locals.theme = req.cookies.theme || 'dark';
  next();
});

// Auth middleware - check token and set user info
app.use((req, res, next) => {
  const token = req.cookies.token || null;
  res.locals.token = token;
  res.locals.isAuthenticated = !!token;
  res.locals.user = null;
  res.locals.apiUrl = API_BASE;

  if (token) {
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
      res.locals.user = { id: payload.userId, email: payload.email };
    } catch (e) {
      res.clearCookie('token');
      res.locals.isAuthenticated = false;
    }
  }
  next();
});

// API fetch helper
async function apiFetch(endpoint: string, token: string | null = null, options: any = {}): Promise<any> {
  const headers: any = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  try {
    const url = `${API_BASE}${endpoint}`;
    console.log(`[apiFetch] Calling ${options.method || 'GET'} ${url}`);

    const response = await fetch(url, { ...options, headers });

    // Handle non-JSON responses
    const contentType = response.headers.get('content-type');
    let data;
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      const text = await response.text();
      console.error(`[apiFetch] Non-JSON response for ${endpoint}:`, text.substring(0, 200));
      return { error: `Server returned non-JSON response (${response.status})` };
    }

    console.log(`[apiFetch] Response status: ${response.status}`,
                `Data type: ${Array.isArray(data) ? 'array' : typeof data}`,
                Array.isArray(data) ? `Length: ${data.length}` : '');

    if (!response.ok) {
      console.error(`[apiFetch] HTTP ${response.status} error:`, data);
      const errorData = data as any;
      return { error: errorData.error || errorData.message || `Server error (${response.status})` };
    }

    return data;
  } catch (err: any) {
    console.error(`[apiFetch] Network error for ${endpoint}:`, err.message);
    return { error: `Cannot connect to server: ${err.message}` };
  }
}

// Require auth helper
function requireAuth(req: any, res: any, next: any) {
  if (!res.locals.isAuthenticated) {
    return res.redirect('/login');
  }
  next();
}

// ===================== AUTH ROUTES =====================

app.get('/login', (req, res) => {
  if (res.locals.isAuthenticated) return res.redirect('/');
  res.render('pages/login', { pageTitle: 'Login', error: null });
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const data = await apiFetch('/auth/login', null, {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });

  if (data.error) {
    return res.render('pages/login', { pageTitle: 'Login', error: data.error });
  }

  res.cookie('token', data.token, {
    maxAge: 7 * 24 * 60 * 60 * 1000,
    httpOnly: false, // Allow JavaScript access for API calls
    sameSite: 'lax',
    secure: false // Set to true if using HTTPS
  });
  res.redirect('/');
});

app.get('/register', (req, res) => {
  if (res.locals.isAuthenticated) return res.redirect('/');
  res.render('pages/register', { pageTitle: 'Register', error: null });
});

app.post('/register', async (req, res) => {
  const { email, password, firstName, lastName } = req.body;
  const data = await apiFetch('/auth/register', null, {
    method: 'POST',
    body: JSON.stringify({ email, password, firstName, lastName })
  });

  if (data.error) {
    return res.render('pages/register', { pageTitle: 'Register', error: data.error });
  }

  res.cookie('token', data.token, {
    maxAge: 7 * 24 * 60 * 60 * 1000,
    httpOnly: false,
    sameSite: 'lax',
    secure: false
  });
  res.redirect('/');
});

app.get('/logout', (req, res) => {
  res.clearCookie('token');
  res.redirect('/login');
});

// ===================== ADVANCED ANALYTICS DASHBOARD =====================

// Helper function to fetch Performance tab data
async function fetchPerformanceData(token: string, portfolioId: string) {
  const [attribution, excessReturn, drawdown, rolling] = await Promise.all([
    apiFetch(`/advanced-analytics/performance-attribution?portfolioId=${portfolioId}&period=1Y`, token),
    apiFetch(`/advanced-analytics/excess-return?portfolioId=${portfolioId}&benchmark=SPY&period=1Y`, token),
    apiFetch(`/advanced-analytics/drawdown-analysis?portfolioId=${portfolioId}&period=1Y`, token),
    apiFetch(`/advanced-analytics/rolling-statistics?portfolioId=${portfolioId}&window=90`, token)
  ]);

  return {
    attribution: attribution.error ? null : attribution,
    excessReturn: excessReturn.error ? null : excessReturn,
    drawdown: drawdown.error ? null : drawdown,
    rolling: rolling.error ? null : rolling
  };
}

// Helper function to fetch Risk tab data
async function fetchRiskData(token: string, portfolioId: string) {
  const [riskDecomp, varScenarios, correlation, stressScenarios, concentration] = await Promise.all([
    apiFetch(`/advanced-analytics/risk-decomposition?portfolioId=${portfolioId}`, token),
    apiFetch(`/advanced-analytics/var-scenarios?portfolioId=${portfolioId}&confidence=95&method=historical`, token),
    apiFetch(`/advanced-analytics/correlation-matrix?portfolioId=${portfolioId}`, token),
    apiFetch(`/advanced-analytics/stress-scenarios?portfolioId=${portfolioId}`, token),
    apiFetch(`/advanced-analytics/concentration-analysis?portfolioId=${portfolioId}`, token)
  ]);

  return {
    riskDecomp: riskDecomp.error ? null : riskDecomp,
    varScenarios: varScenarios.error ? null : varScenarios,
    correlation: correlation.error ? null : correlation,
    stressScenarios: stressScenarios.error ? null : stressScenarios,
    concentration: concentration.error ? null : concentration
  };
}

// Helper function to fetch Attribution tab data
async function fetchAttributionData(token: string, portfolioId: string) {
  const [regional, sectorRotation, peerBench, alphaDecay] = await Promise.all([
    apiFetch(`/advanced-analytics/regional-attribution?portfolioId=${portfolioId}&period=1Y`, token),
    apiFetch(`/advanced-analytics/sector-rotation?portfolioId=${portfolioId}&period=1Y`, token),
    apiFetch(`/advanced-analytics/peer-benchmarking?portfolioId=${portfolioId}&peerUniverse=balanced`, token),
    apiFetch(`/advanced-analytics/alpha-decay?portfolioId=${portfolioId}&period=1Y`, token)
  ]);

  return {
    regional: regional.error ? null : regional,
    sectorRotation: sectorRotation.error ? null : sectorRotation,
    peerBench: peerBench.error ? null : peerBench,
    alphaDecay: alphaDecay.error ? null : alphaDecay
  };
}

// Helper function to fetch Construction tab data
async function fetchConstructionData(token: string, portfolioId: string) {
  const [efficientFrontier, turnover, liquidity, tca] = await Promise.all([
    apiFetch(`/advanced-analytics/efficient-frontier?portfolioId=${portfolioId}`, token),
    apiFetch(`/advanced-analytics/turnover-analysis?portfolioId=${portfolioId}&period=1Y`, token),
    apiFetch(`/advanced-analytics/liquidity-analysis?portfolioId=${portfolioId}`, token),
    apiFetch(`/advanced-analytics/transaction-cost-analysis?portfolioId=${portfolioId}&period=1Y`, token)
  ]);

  return {
    efficientFrontier: efficientFrontier.error ? null : efficientFrontier,
    turnover: turnover.error ? null : turnover,
    liquidity: liquidity.error ? null : liquidity,
    tca: tca.error ? null : tca
  };
}

// Helper function to fetch Specialized tab data
async function fetchSpecializedData(token: string, portfolioId: string) {
  const [alternatives, esg, clientReporting] = await Promise.all([
    apiFetch(`/advanced-analytics/alternatives-attribution?portfolioId=${portfolioId}&period=1Y`, token),
    apiFetch(`/advanced-analytics/esg-analysis?portfolioId=${portfolioId}`, token),
    apiFetch(`/advanced-analytics/client-reporting?portfolioId=${portfolioId}&period=1Y`, token)
  ]);

  return {
    alternatives: alternatives.error ? null : alternatives,
    esg: esg.error ? null : esg,
    clientReporting: clientReporting.error ? null : clientReporting
  };
}

// Main Dashboard - Advanced Portfolio Analytics with 20 Features (5 Tabs)
app.get(['/', '/dashboard'], requireAuth, async (req, res) => {
  try {
    const token = res.locals.token;

    // Fetch all dashboard data in parallel with proper error handling
    const [dashboardData, portfoliosData, indicesData, moversData, watchlistData] = await Promise.all([
      apiFetch('/analytics/dashboard', token).catch(() => ({ error: true })),
      apiFetch('/portfolios', token).catch(() => ({ error: true })),
      apiFetch('/market/indices', token).catch(() => []),
      apiFetch('/market/movers', token).catch(() => ({ gainers: [], losers: [] })),
      apiFetch('/watchlists', token).catch(() => [])
    ]);

    const dashboard = dashboardData.error ? null : dashboardData;
    const portfolios = portfoliosData.error ? [] : (Array.isArray(portfoliosData) ? portfoliosData : []);
    const indices = indicesData.error || !Array.isArray(indicesData) ? [] : indicesData;
    const movers = moversData.error ? { gainers: [], losers: [] } : moversData;

    // Extract watchlist items with prices
    let watchlist: any[] = [];
    if (watchlistData && !watchlistData.error && Array.isArray(watchlistData)) {
      // Flatten all watchlist items from all watchlists
      watchlist = watchlistData.flatMap((wl: any) =>
        (wl.items || []).map((item: any) => ({
          symbol: item.symbol,
          price: item.currentPrice || item.price || 0,
          changePercent: item.changePercent || 0
        }))
      );
    }

    // Format helpers
    const fmt = {
      money: (v: number) => '$' + (v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      compact: (v: number) => '$' + (v >= 1000000 ? (v / 1000000).toFixed(2) + 'M' : v >= 1000 ? (v / 1000).toFixed(1) + 'K' : (v || 0).toFixed(2)),
      pct: (v: number) => { const safeV = v || 0; return (safeV >= 0 ? '+' : '') + safeV.toFixed(2) + '%'; },
      number: (v: number) => (v || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })
    };

    // Destructure dashboard data for template - these are the variables the template expects
    const holdings = dashboard?.holdings || [];
    const sectors = dashboard?.sectors || [];
    const risk = dashboard?.risk || { beta: 1.0, sharpe: 0, volatility: 0, maxDrawdown: 0 };
    const transactions = dashboard?.recentTransactions || [];
    const alerts = dashboard?.activeAlerts || [];

    // Debug logging
    console.log('[Dashboard] Data extracted:', {
      dashboardExists: !!dashboard,
      holdingsCount: holdings.length,
      sectorsCount: sectors.length,
      transactionsCount: transactions.length,
      totalValue: dashboard?.value,
      totalHoldingsCount: dashboard?.holdingsCount
    });

    const totals = dashboard ? {
      value: dashboard.value || 0,
      cost: dashboard.cost || 0,
      gain: dashboard.gain || 0,
      income: dashboard.income || 0,
      dayChange: dashboard.dayChange || 0,
      ytdReturn: dashboard.ytdReturn || 0,
      cash: dashboard.cash || 0,
      holdingsCount: dashboard.holdingsCount || holdings.length
    } : { value: 0, cost: 0, gain: 0, income: 0, dayChange: 0, ytdReturn: 0, cash: 0, holdingsCount: 0 };

    res.render('pages/dashboard', {
      pageTitle: 'Portfolio Dashboard',
      dashboard,
      portfolios,
      // Pass all the individual variables the template expects
      holdings,
      sectors,
      risk,
      transactions,
      alerts,
      watchlist,
      totals,
      analysis: null,
      selectedPid: portfolios[0]?.id || null,
      indices,
      movers,
      currentPage: 'dashboard',
      fmt
    });
  } catch (error) {
    console.error('Error loading dashboard:', error);
    // Still render the page with empty data instead of failing
    const fmt = {
      money: (v: number) => '$' + (v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      compact: (v: number) => '$' + (v >= 1000000 ? (v / 1000000).toFixed(2) + 'M' : v >= 1000 ? (v / 1000).toFixed(1) + 'K' : (v || 0).toFixed(2)),
      pct: (v: number) => { const safeV = v || 0; return (safeV >= 0 ? '+' : '') + safeV.toFixed(2) + '%'; },
      number: (v: number) => (v || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })
    };
    res.render('pages/dashboard', {
      pageTitle: 'Portfolio Dashboard',
      dashboard: null,
      portfolios: [],
      holdings: [],
      sectors: [],
      risk: { beta: 1.0, sharpe: 0, volatility: 0, maxDrawdown: 0 },
      transactions: [],
      alerts: [],
      watchlist: [],
      totals: { value: 0, cost: 0, gain: 0, income: 0, dayChange: 0, ytdReturn: 0, cash: 0, holdingsCount: 0 },
      analysis: null,
      selectedPid: null,
      indices: [],
      movers: { gainers: [], losers: [] },
      currentPage: 'dashboard',
      fmt
    });
  }
});

// Advanced Analytics Route (tabbed view)
app.get('/advanced-analytics', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const selectedTab = (req.query.tab as string) || 'performance';
  const selectedPortfolio = (req.query.portfolio as string) || 'all';

  // Fetch portfolios list and calendar data in parallel
  const [portfoliosData, calendarEventsData, dividendCalendarData] = await Promise.all([
    apiFetch('/portfolios', token),
    apiFetch('/calendar/events', token).catch(() => []),
    apiFetch('/calendar/dividend-calendar', token).catch(() => [])
  ]);

  const portfolios = portfoliosData.error ? [] : portfoliosData;
  const calendarEvents = Array.isArray(calendarEventsData) ? calendarEventsData : [];
  const dividendEvents = Array.isArray(dividendCalendarData) ? dividendCalendarData : [];

  // Calculate calendar stats
  const today = new Date();
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay());
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 7);

  const calendarStats = {
    today: calendarEvents.filter((e: any) => {
      const eventDate = new Date(e.start_date);
      return eventDate.toDateString() === today.toDateString();
    }).length,
    thisWeek: calendarEvents.filter((e: any) => {
      const eventDate = new Date(e.start_date);
      return eventDate >= startOfWeek && eventDate <= endOfWeek;
    }).length
  };

  // Get upcoming events (next 5)
  const upcomingEvents = calendarEvents
    .filter((e: any) => new Date(e.start_date) >= today)
    .sort((a: any, b: any) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime())
    .slice(0, 5);

  // Fetch tab-specific data based on selected tab
  let tabData = {};
  switch(selectedTab) {
    case 'performance':
      tabData = await fetchPerformanceData(token, selectedPortfolio);
      break;
    case 'risk':
      tabData = await fetchRiskData(token, selectedPortfolio);
      break;
    case 'attribution':
      tabData = await fetchAttributionData(token, selectedPortfolio);
      break;
    case 'construction':
      tabData = await fetchConstructionData(token, selectedPortfolio);
      break;
    case 'specialized':
      tabData = await fetchSpecializedData(token, selectedPortfolio);
      break;
    default:
      tabData = await fetchPerformanceData(token, selectedPortfolio);
  }

  // Format helpers
  const fmt = {
    money: (v: number) => '$' + (v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    compact: (v: number) => '$' + (v >= 1000000 ? (v / 1000000).toFixed(2) + 'M' : v >= 1000 ? (v / 1000).toFixed(1) + 'K' : (v || 0).toFixed(2)),
    pct: (v: number) => { const safeV = v || 0; return (safeV >= 0 ? '+' : '') + safeV.toFixed(2) + '%'; },
    number: (v: number) => (v || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })
  };

  res.render('pages/advanced-analytics', {
    pageTitle: 'Advanced Portfolio Analytics',
    portfolios,
    selectedTab,
    selectedPortfolio,
    tabData,
    calendarStats,
    upcomingEvents,
    currentPage: 'advanced-analytics',
    fmt
  });
});

// ===================== MARKET DASHBOARD =====================

app.get('/market', requireAuth, async (req, res) => {
  try {
    // Format helpers
    const fmt = {
      money: (v: number) => '$' + (v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      compact: (v: number) => '$' + (v >= 1000000 ? (v / 1000000).toFixed(2) + 'M' : v >= 1000 ? (v / 1000).toFixed(1) + 'K' : (v || 0).toFixed(2)),
      pct: (v: number) => { const safeV = v || 0; return (safeV >= 0 ? '+' : '') + safeV.toFixed(2) + '%'; },
      number: (v: number) => (v || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })
    };

    res.render('pages/market', {
      pageTitle: 'Market Dashboard',
      fmt
    });
  } catch (error) {
    console.error('Error loading market page:', error);
    res.status(500).render('pages/error', { pageTitle: 'Error', message: 'Failed to load market page' });
  }
});

// Market Dashboard - Overview of all market sections
app.get('/market-dashboard', requireAuth, async (req, res) => {
  const token = res.locals.token;

  // Fetch all market data from backend APIs in parallel
  const [
    breadthData,
    sentimentData,
    topMoversData,
    sectorData,
    earningsData,
    dividendData,
    ipoData,
    spacData,
    economicData
  ] = await Promise.all([
    apiFetch('/market-breadth', token).catch(() => ({ data: null })),
    apiFetch('/sentiment', token).catch(() => ({ data: null })),
    apiFetch('/market/movers', token).catch(() => ({ data: null })),
    apiFetch('/sector-analysis', token).catch(() => ({ data: null })),
    apiFetch('/earnings-calendar', token).catch(() => ({ upcoming: 0 })),
    apiFetch('/dividend-calendar', token).catch(() => ({ upcoming: 0 })),
    apiFetch('/ipo-calendar', token).catch(() => ({ thisWeek: 0 })),
    apiFetch('/spac-tracker', token).catch(() => ({ active: 0 })),
    apiFetch('/economic-calendar', token).catch(() => ({ upcoming: 0 }))
  ]);

  // Format helpers
  const fmt = {
    money: (v: number) => '$' + (v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    compact: (v: number) => '$' + (v >= 1000000 ? (v / 1000000).toFixed(2) + 'M' : v >= 1000 ? (v / 1000).toFixed(1) + 'K' : (v || 0).toFixed(2)),
    pct: (v: number) => { const safeV = v || 0; return (safeV >= 0 ? '+' : '') + safeV.toFixed(2) + '%'; },
    number: (v: number) => (v || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })
  };

  res.render('pages/market-overview', {
    pageTitle: 'Market Dashboard',
    breadth: breadthData.data,
    sentiment: sentimentData.data,
    topMovers: topMoversData,
    sectors: sectorData.data,
    earnings: earningsData,
    dividend: dividendData,
    ipo: ipoData,
    spac: spacData,
    economic: economicData,
    fmt
  });
});

// Auth diagnostic endpoint
app.get('/api/auth-check', (req, res) => {
  res.json({
    hasCookie: !!req.cookies.token,
    isAuthenticated: res.locals.isAuthenticated,
    hasToken: !!res.locals.token,
    user: res.locals.user,
    cookieValue: req.cookies.token ? req.cookies.token.substring(0, 20) + '...' : null
  });
});

// Stock Detail Page
app.get('/stock/:symbol', requireAuth, (req, res) => {
  res.render('pages/stock-detail', {
    pageTitle: `${req.params.symbol} Stock`,
    symbol: req.params.symbol.toUpperCase()
  });
});

// Stock Search API Proxy (POST - for search)
app.post('/api/stock-search/*', async (req, res) => {
  console.log('[Stock Search Proxy POST] Request received');

  if (!res.locals.isAuthenticated || !res.locals.token) {
    console.log('[Stock Search Proxy] Authentication failed');
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'Please log in to search stocks'
    });
  }

  const token = res.locals.token;
  const path = req.path;

  console.log('[Stock Search Proxy POST] Forwarding to backend:', path);

  try {
    const response = await fetch(`http://localhost:4000${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(req.body)
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error: any) {
    console.error('[Stock Search Proxy POST] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Stock Search API Proxy (GET - for historical data)
app.get('/api/stock-search/*', async (req, res) => {
  console.log('[Stock Search Proxy GET] Request received');

  if (!res.locals.isAuthenticated || !res.locals.token) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized'
    });
  }

  const token = res.locals.token;
  const path = req.path + (req.url.includes('?') ? '?' + req.url.split('?')[1] : '');

  console.log('[Stock Search Proxy GET] Forwarding to backend:', path);

  try {
    const data = await apiFetch(path, token);
    res.json(data);
  } catch (error: any) {
    console.error('[Stock Search Proxy GET] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

// ===================== PORTFOLIO ROUTES (with real data) =====================

app.get('/portfolio', requireAuth, (req, res) => {
  const query = req.url.split('?')[1];
  res.redirect('/portfolios' + (query ? '?' + query : ''));
});

app.get('/portfolios', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const portfolioId = req.query.id;

  let portfolio = null;
  const portfoliosResult = await apiFetch('/portfolios', token);
  const portfoliosRaw = portfoliosResult.error ? [] : (Array.isArray(portfoliosResult) ? portfoliosResult : []);

  if (portfolioId) {
    portfolio = await apiFetch(`/portfolios/${portfolioId}`, token);
    if (portfolio.error) portfolio = null;
  } else if (portfoliosRaw.length > 0) {
    const defaultP = portfoliosRaw.find((p: any) => p.isDefault) || portfoliosRaw[0];
    portfolio = await apiFetch(`/portfolios/${defaultP.id}`, token);
    if (portfolio.error) portfolio = null;
  }

  // Fetch holdings with live prices
  let holdingsRaw: any[] = [];
  if (portfolio && !portfolio.error) {
    const holdingsResult = await apiFetch(`/portfolios/${portfolio.id}/holdings`, token);
    holdingsRaw = holdingsResult.error ? [] : (Array.isArray(holdingsResult) ? holdingsResult : holdingsResult.holdings || []);
  }

  // Transform holdings to match template expectations (snake_case)
  const holdings = holdingsRaw.map((h: any) => ({
    ...h,
    id: h.id,
    symbol: h.symbol,
    name: h.name || h.symbol,
    quantity: h.shares || h.quantity || 0,
    shares: h.shares || h.quantity || 0,
    current_price: h.currentPrice || h.price || h.current_price || 0,
    currentPrice: h.currentPrice || h.price || 0,
    market_value: h.marketValue || h.market_value || (h.shares || 0) * (h.currentPrice || h.price || 0),
    marketValue: h.marketValue || (h.shares || 0) * (h.currentPrice || h.price || 0),
    cost_basis: h.avgCostBasis || h.costBasis || h.cost_basis || 0,
    avgCostBasis: h.avgCostBasis || h.costBasis || 0,
    total_cost: (h.shares || 0) * (h.avgCostBasis || h.costBasis || 0),
    gain: h.gain || (h.marketValue || 0) - ((h.shares || 0) * (h.avgCostBasis || 0)),
    gain_pct: h.gainPct || h.gain_pct || 0,
    gainPct: h.gainPct || 0,
    day_change: h.dayChange || h.change || 0,
    day_change_pct: h.dayChangePct || h.changePercent || 0,
    sector: h.sector || 'Unknown',
    weight: h.weight || 0,
    dividend_yield: h.dividendYield || 0
  }));

  // Calculate totals from holdings
  const totalValue = holdings.reduce((sum: number, h: any) => sum + (h.market_value || 0), 0);
  const totalCost = holdings.reduce((sum: number, h: any) => sum + (h.total_cost || 0), 0);
  const totalGain = totalValue - totalCost;
  const totalGainPct = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;
  const dayChange = holdings.reduce((sum: number, h: any) => sum + ((h.day_change || 0) * (h.shares || 0)), 0);
  const income = holdings.reduce((sum: number, h: any) => sum + ((h.dividend_yield || 0) * (h.market_value || 0) / 100), 0);

  // Calculate sector allocation
  const sectorMap = new Map<string, number>();
  holdings.forEach((h: any) => {
    const sector = h.sector || 'Unknown';
    sectorMap.set(sector, (sectorMap.get(sector) || 0) + (h.market_value || 0));
  });
  const sectors = Array.from(sectorMap.entries()).map(([name, value]) => ({
    name,
    value,
    percentage: totalValue > 0 ? (value / totalValue) * 100 : 0
  })).sort((a, b) => b.value - a.value);

  // Transform portfolios list for sidebar (snake_case)
  const portfolios = portfoliosRaw.map((p: any) => ({
    ...p,
    total_value: p.totalValue || 0,
    total_gain: p.totalGain || 0,
    total_gain_pct: p.totalGainPct || 0,
    holdings_count: p.holdingsCount || (p.holdings ? p.holdings.length : 0)
  }));

  // Transform selected portfolio (snake_case)
  const selected = portfolio ? {
    ...portfolio,
    id: portfolio.id,
    name: portfolio.name,
    description: portfolio.description || 'Portfolio',
    total_value: totalValue,
    total_cost: totalCost,
    total_gain: totalGain,
    total_gain_pct: totalGainPct,
    day_change: dayChange,
    income: income,
    cash_balance: portfolio.cashBalance || 0,
    holdings_count: holdings.length,
    sectors: sectors
  } : null;

  res.render('pages/portfolios', {
    pageTitle: 'Portfolio',
    portfolio: selected,
    portfolios: portfolios,
    selectedPid: selected ? selected.id : null,
    selected: selected,
    holdings: holdings,
    sectors: sectors,
    token: token,
    fmt: {
      money: (v: number) => '$' + (v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      compact: (v: number) => '$' + (v >= 1000000 ? (v / 1000000).toFixed(2) + 'M' : v >= 1000 ? (v / 1000).toFixed(1) + 'K' : (v || 0).toFixed(2)),
      pct: (v: number) => { const safeV = v || 0; return (safeV >= 0 ? '+' : '') + safeV.toFixed(2) + '%'; }
    }
  });
});

app.get('/holdings', requireAuth, async (req, res) => {
  const token = res.locals.token;

  // Fetch enhanced holdings with real-time data
  const [holdingsData, portfoliosData] = await Promise.all([
    apiFetch('/holdings/all', token),
    apiFetch('/portfolios', token)
  ]);

  const holdings = holdingsData.error ? [] : holdingsData;
  const portfolios = portfoliosData.error ? [] : portfoliosData;

  // Calculate totals
  const totals = holdings.reduce((acc: any, h: any) => {
    acc.marketValue += h.marketValue || 0;
    acc.costTotal += h.costTotal || 0;
    acc.gain += h.gain || 0;
    return acc;
  }, { marketValue: 0, costTotal: 0, gain: 0 });

  res.render('pages/holdings', {
    pageTitle: 'Holdings',
    holdings,
    portfolios,
    totals,
    fmt: {
      money: (v: number) => '$' + (v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      compact: (v: number) => '$' + (v >= 1000000 ? (v / 1000000).toFixed(2) + 'M' : v >= 1000 ? (v / 1000).toFixed(1) + 'K' : v.toFixed(2)),
      pct: (v: number) => (v >= 0 ? '+' : '') + (v || 0).toFixed(2) + '%',
      number: (v: number) => (v || 0).toLocaleString('en-US')
    }
  });
});

app.get('/transactions', requireAuth, async (req, res) => {
  const token = res.locals.token;

  // Fetch all transactions with stats
  const [txData, portfoliosData] = await Promise.all([
    apiFetch('/transactions/all', token),
    apiFetch('/portfolios', token)
  ]);

  const transactions = txData.error ? [] : (txData.transactions || []);
  const stats = txData.error ? { thisMonthCount: 0, buyTotal: 0, sellTotal: 0, dividendTotal: 0 } : txData.stats;
  const portfolios = portfoliosData.error ? [] : portfoliosData;

  const fmt = {
    money: (v: number) => '$' + (v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    compact: (v: number) => '$' + (v >= 1000000 ? (v / 1000000).toFixed(2) + 'M' : v >= 1000 ? (v / 1000).toFixed(1) + 'K' : v.toFixed(2)),
    pct: (v: number) => (v >= 0 ? '+' : '') + (v || 0).toFixed(2) + '%'
  };

  res.render('pages/transactions', {
    pageTitle: 'Transactions',
    transactions,
    stats,
    portfolios,
    fmt
  });
});

app.get('/watchlist', requireAuth, async (req, res) => {
  const token = res.locals.token;

  // Fetch enhanced watchlist with real-time data
  const [watchlists, enhancedItems] = await Promise.all([
    apiFetch('/watchlists', token),
    apiFetch('/watchlist/enhanced', token)
  ]);

  // Use enhanced items if available, otherwise fall back to basic items
  const items = enhancedItems.error ?
    ((watchlists && !watchlists.error && watchlists.length > 0) ? (watchlists[0].items || []) : []) :
    enhancedItems;

  const fmt = {
    money: (v: number) => '$' + (v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    compact: (v: number) => '$' + (v >= 1000000 ? (v / 1000000).toFixed(2) + 'M' : v >= 1000 ? (v / 1000).toFixed(1) + 'K' : v.toFixed(2)),
    pct: (v: number) => { const safeV = v || 0; return (safeV >= 0 ? '+' : '') + safeV.toFixed(2) + '%'; }
  };

  res.render('pages/watchlist', {
    pageTitle: 'Watchlist',
    watchlists: watchlists.error ? [] : watchlists,
    items: items,
    fmt: fmt
  });
});

// ===================== ANALYTICS ROUTES (with real data) =====================

app.get('/analytics', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const period = (req.query.period as string) || '1Y';

  const [performanceData, attributionData, portfoliosData] = await Promise.all([
    apiFetch(`/analytics/portfolio-performance?period=${period}`, token),
    apiFetch('/analytics/attribution', token),
    apiFetch('/portfolios', token)
  ]);

  const performance = performanceData.error ? null : performanceData;
  const attribution = attributionData.error ? null : attributionData;
  const portfolios = portfoliosData.error ? [] : (Array.isArray(portfoliosData) ? portfoliosData : []);

  res.render('pages/analytics', {
    pageTitle: 'Portfolio Analytics',
    analytics: performance,
    performance: performance || { totalReturn: 0, totalValue: 0, totalGain: 0, dayChange: 0, ytdReturn: 0, sharpeRatio: 0, beta: 1.0, alpha: 0, volatility: 0, maxDrawdown: 0 },
    metrics: performance?.riskMetrics || { sharpeRatio: 0, sortinoRatio: 0, calmarRatio: 0, informationRatio: 0, treynorRatio: 0, beta: 1.0, alpha: 0, rSquared: 0, trackingError: 0 },
    attribution: attribution || { factors: [], sectors: [], holdings: [] },
    history: performance?.chartData?.values || [],
    returns: { daily: [], monthly: [], annual: [] },
    period,
    holdings: performance?.holdings || [],
    fmt: {
      money: (v: number) => '$' + (v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      compact: (v: number) => '$' + (v >= 1000000 ? (v / 1000000).toFixed(2) + 'M' : v >= 1000 ? (v / 1000).toFixed(1) + 'K' : (v || 0).toFixed(2)),
      pct: (v: number) => { const safeV = v || 0; return (safeV >= 0 ? '+' : '') + safeV.toFixed(2) + '%'; }
    }
  });
});

app.get('/performance', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const period = (req.query.period as string) || '1M';

  // Fetch performance data, history for charts, and holdings
  const [performanceData, historyData, dashboardData, comparisonData] = await Promise.all([
    apiFetch(`/analytics/portfolio-performance?period=${period}`, token),
    apiFetch(`/analytics/performance-history?timeframe=${period}`, token),
    apiFetch('/analytics/dashboard', token),
    apiFetch(`/analytics/comparison?period=${period}`, token)
  ]);

  // Build history array for chart from performance-history API
  let history: any[] = [];
  if (!historyData.error && historyData.labels && historyData.portfolioValues) {
    history = historyData.labels.map((date: string, i: number) => ({
      date,
      value: historyData.portfolioValues[i] || 0,
      benchmark: historyData.benchmarkValues?.[i] || 0
    }));
  }

  // Get holdings for performance table
  const holdings = !dashboardData.error && dashboardData.holdings ? dashboardData.holdings.map((h: any) => ({
    symbol: h.symbol,
    name: h.name || h.symbol,
    shares: h.shares || 0,
    price: h.price || h.currentPrice || 0,
    currentPrice: h.price || h.currentPrice || 0,
    dayChange: h.change || 0,
    dayChangePct: h.changePercent || 0,
    value: h.value || h.marketValue || 0,
    marketValue: h.value || h.marketValue || 0,
    cost: h.cost || 0,
    gain: h.gain || 0,
    gainPct: h.gainPct || 0,
    return: h.gainPct || 0
  })) : [];

  // Build comprehensive performance object
  const performance = {
    totalValue: dashboardData.value || performanceData.totalValue || 0,
    totalCost: dashboardData.cost || performanceData.totalCost || 0,
    totalReturn: dashboardData.gain || 0,
    totalReturnPct: dashboardData.gainPct || ((dashboardData.gain || 0) / (dashboardData.cost || 1) * 100),
    dayChange: dashboardData.dayChange || 0,
    dayChangePct: dashboardData.dayChangePct || 0,
    sharpeRatio: dashboardData.risk?.sharpe || performanceData.riskMetrics?.sharpe || 0,
    volatility: dashboardData.risk?.volatility || performanceData.riskMetrics?.volatility || 0,
    beta: dashboardData.risk?.beta || performanceData.riskMetrics?.beta || 1,
    alpha: performanceData.riskMetrics?.alpha || 0,
    maxDrawdown: dashboardData.risk?.maxDrawdown || performanceData.riskMetrics?.maxDrawdown || 0,
    history: history,
    holdings: holdings,
    riskMetrics: {
      beta: dashboardData.risk?.beta || 1,
      alpha: 0,
      sharpe: dashboardData.risk?.sharpe || 0,
      maxDrawdown: dashboardData.risk?.maxDrawdown || 0,
      volatility: dashboardData.risk?.volatility || 0
    }
  };

  res.render('pages/performance', {
    pageTitle: 'Performance',
    performance: performance,
    comparison: comparisonData.error ? null : comparisonData,
    period,
    fmt: {
      money: (v: number) => '$' + (v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      compact: (v: number) => '$' + (v >= 1000000 ? (v / 1000000).toFixed(2) + 'M' : v >= 1000 ? (v / 1000).toFixed(1) + 'K' : (v || 0).toFixed(2)),
      pct: (v: number) => { const safeV = v || 0; return (safeV >= 0 ? '+' : '') + safeV.toFixed(2) + '%'; },
      number: (v: number) => (v || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })
    }
  });
});

app.get('/dividends', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const dividendData = await apiFetch('/analytics/dividend-analysis', token);

  res.render('pages/dividends', {
    pageTitle: 'Dividend Analysis',
    data: dividendData.error ? null : dividendData,
    fmt: {
      money: (v: number) => '$' + (v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      compact: (v: number) => '$' + (v >= 1000000 ? (v / 1000000).toFixed(2) + 'M' : v >= 1000 ? (v / 1000).toFixed(1) + 'K' : (v || 0).toFixed(2)),
      pct: (v: number) => { const safeV = v || 0; return (safeV >= 0 ? '+' : '') + safeV.toFixed(2) + '%'; }
    }
  });
});

app.get('/risk', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const riskData = await apiFetch('/analytics/risk-metrics', token);

  res.render('pages/risk', {
    pageTitle: 'Risk Analysis',
    data: riskData.error ? null : riskData,
    fmt: {
      money: (v: number) => '$' + (v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      compact: (v: number) => '$' + (v >= 1000000 ? (v / 1000000).toFixed(2) + 'M' : v >= 1000 ? (v / 1000).toFixed(1) + 'K' : (v || 0).toFixed(2)),
      pct: (v: number) => { const safeV = v || 0; return (safeV >= 0 ? '+' : '') + safeV.toFixed(2) + '%'; },
      number: (v: number) => (v || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })
    }
  });
});

app.get('/sectors', requireAuth, async (req, res) => {
  const token = res.locals.token;

  console.log('[/sectors] Fetching sector allocation from fixed endpoint...');

  // Use the WORKING fixed endpoint that calculates from real holdings
  const allocationData = await apiFetch('/sector-analysis-fixed/all-portfolios', token);

  console.log('[/sectors] Allocation data received:', allocationData?.success ? 'Success' : 'Error');

  // Transform data to match template expectations
  let sectorsData = null;
  if (allocationData?.success && allocationData?.data?.allocations) {
    // Mock performance data based on sector type (for visualization until we have real-time prices)
    const sectorPerformance: any = {
      'Technology': 15.3,
      'Technology ETF': 12.8,
      'Healthcare': 8.5,
      'Healthcare ETF': 7.2,
      'Financials': 6.8,
      'Financial ETF': 5.4,
      'Communication Services': 4.2,
      'Consumer Staples': 3.8,
      'Consumer Staples ETF': 3.1,
      'Consumer Discretionary': 11.2,
      'Consumer Discretionary ETF': 9.5,
      'Energy': 18.7,
      'Energy ETF': 16.2,
      'Industrials': 7.9,
      'Industrial ETF': 6.5,
      'Materials': 5.2,
      'Real Estate': 2.3,
      'Real Estate ETF': 1.8,
      'Utilities': 4.1,
      'Bonds': -0.5,
      'Commodities': 22.4,
      'International': 3.7,
      'Broad Market ETF': 10.2,
      'Small Cap ETF': 8.9,
      'Other': 0.0
    };

    sectorsData = {
      sectors: allocationData.data.allocations.map((alloc: any, index: number) => ({
        sector: alloc.sectorName,
        weight: alloc.percentAlloc,
        value: alloc.sectorValue,
        performance: sectorPerformance[alloc.sectorName] || (Math.random() * 20 - 5), // Random -5% to +15% if not in map
        holdings: alloc.holdings?.length || 0,
        topHoldings: alloc.holdings?.slice(0, 3).map((h: any) => ({
          symbol: h.symbol,
          weight: h.value ? (h.value / allocationData.data.totalValue) * 100 : 0
        })) || []
      })),
      totalValue: allocationData.data.totalValue,
      portfoliosCount: allocationData.data.portfoliosCount
    };
    console.log('[/sectors] Transformed sectors count:', sectorsData.sectors.length);
  }

  res.render('pages/sectors', {
    pageTitle: 'Sector Analysis',
    sectors: sectorsData,
    allocation: null,
    fmt: {
      money: (v: number) => '$' + (v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      compact: (v: number) => '$' + (v >= 1000000 ? (v / 1000000).toFixed(2) + 'M' : v >= 1000 ? (v / 1000).toFixed(1) + 'K' : (v || 0).toFixed(2)),
      pct: (v: number) => { const safeV = v || 0; return (safeV >= 0 ? '+' : '') + safeV.toFixed(2) + '%'; }
    }
  });
});

app.get('/tax-lots', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const taxLots = await apiFetch('/analytics/tax-lots', token);

  // Calculate summary totals
  const lots = taxLots.error ? [] : (taxLots.lots || []);
  const summary = taxLots.error ? {} : (taxLots.summary || {});
  const recommendations = taxLots.error ? [] : (taxLots.recommendations || []);

  // Group lots by symbol
  const holdingsMap = new Map();
  for (const lot of lots) {
    if (!holdingsMap.has(lot.symbol)) {
      holdingsMap.set(lot.symbol, {
        symbol: lot.symbol,
        name: lot.name,
        lots: [],
        totalCost: 0,
        currentValue: 0,
        ltGain: 0,
        stGain: 0
      });
    }
    const holding = holdingsMap.get(lot.symbol);
    holding.lots.push(lot);
    holding.totalCost += lot.totalCost || 0;
    holding.currentValue += lot.currentValue || 0;
    if (lot.isLongTerm) {
      holding.ltGain += lot.gain || 0;
    } else {
      holding.stGain += lot.gain || 0;
    }
  }
  const holdingsSummary = Array.from(holdingsMap.values());

  // Find approaching long-term (within 60 days)
  const approachingLT = lots.filter(l => {
    const daysToLT = 365 - l.holdingPeriod;
    return daysToLT > 0 && daysToLT <= 60;
  }).map(l => ({
    symbol: l.symbol,
    shares: l.shares,
    daysToLT: 365 - l.holdingPeriod
  }));

  // Tax loss candidates
  const taxLossCandidates = lots.filter(l => l.gain < -1000).map(l => ({
    symbol: l.symbol,
    loss: l.gain
  }));

  res.render('pages/tax-lots', {
    pageTitle: 'Tax Lots',
    lots,
    summary,
    recommendations,
    holdingsSummary,
    approachingLT,
    taxLossCandidates,
    fmt: {
      money: (v: number) => '$' + (v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      compact: (v: number) => {
        const abs = Math.abs(v || 0);
        const sign = v < 0 ? '-' : '';
        if (abs >= 1000000) return sign + '$' + (abs / 1000000).toFixed(1) + 'M';
        if (abs >= 1000) return sign + '$' + (abs / 1000).toFixed(1) + 'K';
        return sign + '$' + abs.toFixed(2);
      },
      pct: (v: number) => (v >= 0 ? '+' : '') + (v || 0).toFixed(2) + '%',
      days: (d: number) => {
        if (d >= 365) {
          const years = Math.floor(d / 365);
          const months = Math.floor((d % 365) / 30);
          return years + 'Y ' + months + 'M';
        }
        return d + 'd';
      }
    }
  });
});

app.get('/correlation', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const correlationData = await apiFetch('/analytics/correlation-matrix', token);

  res.render('pages/correlation', {
    pageTitle: 'Correlation Matrix',
    data: correlationData.error ? null : correlationData,
    fmt: {
      number: (v: number) => (v || 0).toFixed(2)
    }
  });
});

app.get('/technical-analysis', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const technicalData = await apiFetch('/analytics/technical-overview', token);

  res.render('pages/technical-analysis', {
    pageTitle: 'Technical Analysis',
    data: technicalData.error ? null : technicalData,
    fmt: {
      money: (v: number) => '$' + (v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      pct: (v: number) => { const safeV = v || 0; return (safeV >= 0 ? '+' : '') + safeV.toFixed(2) + '%'; },
      number: (v: number) => (v || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })
    }
  });
});

app.get('/earnings-calendar', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const earningsData = await apiFetch('/analytics/earnings-calendar', token);

  res.render('pages/earnings-calendar', {
    pageTitle: 'Earnings Calendar',
    data: earningsData.error ? null : earningsData
  });
});

app.get('/sector-rotation', requireAuth, async (req, res) => {
  const token = res.locals.token;

  console.log('[/sector-rotation] Fetching live sector rotation data...');

  const rotationData = await apiFetch('/sector-rotation/current', token);

  console.log('[/sector-rotation] Data received:', rotationData.error ? 'Error' : 'Success');

  // Ensure data is always an object with safe defaults
  const safeData = rotationData.error ? {
    sectors: [],
    topInflows: [],
    topOutflows: [],
    rotationPairs: [],
    economicCycle: { phaseName: 'Unknown', confidence: 'low' },
    benchmark: { symbol: 'SPY', price: 0, change: 0 }
  } : rotationData.data;

  res.render('pages/sector-rotation', {
    pageTitle: 'Sector Rotation',
    data: safeData,
    fmt: {
      money: (v: number) => '$' + (v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      pct: (v: number) => { const safeV = v || 0; return (safeV >= 0 ? '+' : '') + safeV.toFixed(2) + '%'; },
      number: (v: number) => (v || 0).toLocaleString('en-US', { maximumFractionDigits: 2 }),
      compact: (v: number) => {
        if (v >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
        if (v >= 1e6) return '$' + (v / 1e6).toFixed(2) + 'M';
        if (v >= 1e3) return '$' + (v / 1e3).toFixed(2) + 'K';
        return '$' + v.toFixed(2);
      }
    }
  });
});

app.get('/alerts', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const alerts = await apiFetch('/alerts', token);

  res.render('pages/alerts', {
    pageTitle: 'Alerts',
    alerts: alerts.error ? [] : alerts
  });
});

// ===================== MARKET DATA ROUTES =====================

app.get('/snapshot', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const [dashboard, movers] = await Promise.all([
    apiFetch('/analytics/dashboard', token),
    apiFetch('/market/movers', token)
  ]);

  res.render('pages/snapshot', {
    pageTitle: 'Daily Snapshot',
    dashboard: dashboard.error ? null : dashboard,
    movers: movers.error ? null : movers
  });
});

// ===================== ANALYSIS PAGES WITH REAL DATA =====================

// Helper for format functions
const fmt = {
  money: (v: number) => '$' + (v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  compact: (v: number) => {
    const val = v || 0;
    return '$' + (val >= 1000000 ? (val / 1000000).toFixed(2) + 'M' : val >= 1000 ? (val / 1000).toFixed(1) + 'K' : val.toFixed(2));
  },
  pct: (v: number) => (v >= 0 ? '+' : '') + (v || 0).toFixed(2) + '%',
  number: (v: number) => (v || 0).toLocaleString('en-US')
};

// Technical Analysis
app.get('/technicals', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const symbol = (req.query.symbol as string) || 'AAPL';
  const [technicals, portfolios] = await Promise.all([
    apiFetch(`/research/technicals/${symbol}`, token),
    apiFetch('/portfolios', token)
  ]);
  const holdings = !portfolios.error && portfolios.length > 0 ? portfolios[0].holdings || [] : [];
  res.render('pages/technicals', { pageTitle: 'Technical Indicators', technicals: technicals.error ? null : technicals, symbol, holdings, fmt });
});

// Analyst Ratings
app.get('/analyst-ratings', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const portfolios = await apiFetch('/portfolios', token);
  const holdings = !portfolios.error && portfolios.length > 0 ? portfolios[0].holdings || [] : [];
  const symbols = holdings.slice(0, 10).map((h: any) => h.symbol);
  let ratingsData: any[] = [];
  if (symbols.length > 0) {
    const ratings = await apiFetch('/analysis/batch-ratings', token, { method: 'POST', body: JSON.stringify({ symbols }) });
    ratingsData = ratings.error ? [] : ratings;
  }
  res.render('pages/analyst-ratings', { pageTitle: 'Analyst Ratings', ratings: ratingsData, holdings, fmt });
});

// Earnings Calendar
app.get('/earnings-calendar', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const earnings = await apiFetch('/analysis/earnings-calendar', token);
  res.render('pages/earnings-calendar', { pageTitle: 'Earnings Calendar', earnings: earnings.error ? [] : earnings, fmt });
});

// Earnings Analysis
app.get('/earnings-analysis', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const symbol = (req.query.symbol as string) || 'AAPL';
  const earnings = await apiFetch(`/analysis/earnings/${symbol}`, token);
  res.render('pages/earnings-analysis', { pageTitle: 'Earnings Analysis', earnings: earnings.error ? null : earnings, symbol, fmt });
});

// Financials
app.get('/financials', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const symbol = (req.query.symbol as string) || 'AAPL';
  const financials = await apiFetch(`/research/stock/${symbol}/financials`, token);
  res.render('pages/financials', { pageTitle: 'Financial Statements', financials: financials.error ? null : financials, symbol, fmt });
});

// Cash Flow
app.get('/cash-flow', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const symbol = (req.query.symbol as string) || 'AAPL';
  const cashFlow = await apiFetch(`/analysis/cash-flow/${symbol}`, token);
  res.render('pages/cash-flow', { pageTitle: 'Cash Flow Analysis', cashFlow: cashFlow.error ? null : cashFlow, symbol, fmt });
});

// Dividends (enhanced)
app.get('/dividend-screener', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const [portfolios, screener] = await Promise.all([
    apiFetch('/portfolios', token),
    apiFetch('/analytics/dividend-screener', token)
  ]);
  const holdings = !portfolios.error && portfolios.length > 0 ? portfolios[0].holdings || [] : [];
  res.render('pages/dividend-screener', { pageTitle: 'Dividend Screener', holdings, screener: screener.error ? null : screener, fmt });
});

app.get('/dividend-calendar', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const [portfolios, calendarData] = await Promise.all([
    apiFetch('/portfolios', token),
    apiFetch('/analytics/dividend-calendar', token)
  ]);
  res.render('pages/dividend-calendar', {
    pageTitle: 'Dividend Calendar',
    portfolios: portfolios.error ? [] : portfolios,
    calendar: calendarData.error ? null : calendarData,
    fmt
  });
});

app.get('/dividend-growth', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const symbol = (req.query.symbol as string) || 'AAPL';
  const dividends = await apiFetch(`/research/dividends/${symbol}`, token);
  res.render('pages/dividend-growth', { pageTitle: 'Dividend Growth', dividends: dividends.error ? null : dividends, symbol, fmt });
});

app.get('/dividend-aristocrats', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const aristocrats = await apiFetch('/analytics/dividend-aristocrats', token);
  res.render('pages/dividend-aristocrats', { pageTitle: 'Dividend Aristocrats', aristocrats: aristocrats.error ? null : aristocrats, fmt });
});

app.get('/capital-returns', requireAuth, async (req, res) => {
  res.render('pages/capital-returns', { pageTitle: 'Capital Returns', fmt });
});

app.get('/payout-ratio', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const symbol = (req.query.symbol as string) || 'AAPL';
  const dividends = await apiFetch(`/research/dividends/${symbol}`, token);
  res.render('pages/payout-ratio', { pageTitle: 'Payout Ratio', dividends: dividends.error ? null : dividends, symbol, fmt });
});

// Sector Analysis
app.get('/sector-heatmap', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const response = await apiFetch('/sector-heatmap/current', token);

  // Handle response structure
  const data = response.error ? { sectors: [], timestamp: new Date().toISOString(), source: 'Error' } : response.data;

  res.render('pages/sector-heatmap', {
    pageTitle: 'Sector Heatmap',
    data: data,
    fmt
  });
});

app.get('/sector-etfs', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const sectors = await apiFetch('/analysis/sectors', token);
  res.render('pages/sector-etfs', { pageTitle: 'Sector ETFs', sectors: sectors.error ? [] : sectors, fmt });
});

// Market Analysis
app.get('/market-breadth', requireAuth, async (req, res) => {
  try {
    const token = res.locals.token;
    const breadth = await apiFetch('/analytics/market-breadth', token).catch(() => ({ error: true }));

    // Format helpers (local copy)
    const localFmt = {
      money: (v: number) => '$' + (v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      compact: (v: number) => '$' + (v >= 1000000 ? (v / 1000000).toFixed(2) + 'M' : v >= 1000 ? (v / 1000).toFixed(1) + 'K' : (v || 0).toFixed(2)),
      pct: (v: number) => { const safeV = v || 0; return (safeV >= 0 ? '+' : '') + safeV.toFixed(2) + '%'; },
      number: (v: number) => (v || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })
    };

    res.render('pages/market-breadth', {
      pageTitle: 'Market Breadth',
      breadth: breadth.error ? null : breadth,
      selectedIndex: 'SPY',
      fmt: localFmt
    });
  } catch (error) {
    console.error('Error loading market-breadth page:', error);
    res.status(500).render('pages/error', { pageTitle: 'Error', message: 'Failed to load market breadth page' });
  }
});

app.get('/market-movers', requireAuth, async (req, res) => {
  const token = res.locals.token;

  try {
    // Fetch live market movers from backend API
    const data = await apiFetch('/market/movers', token);

    res.render('pages/market-movers', {
      pageTitle: 'Top Market Movers',
      gainers: data.gainers || [],
      losers: data.losers || [],
      active: data.active || [],
      lastUpdated: data.lastUpdated || new Date().toISOString(),
      fmt
    });
  } catch (error) {
    console.error('Error fetching market movers:', error);
    res.render('pages/market-movers', {
      pageTitle: 'Top Market Movers',
      gainers: [],
      losers: [],
      active: [],
      lastUpdated: new Date().toISOString(),
      fmt
    });
  }
});

// Charts - Live Stock Chart
app.get('/charts', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const symbol = (req.query.symbol as string) || 'AAPL';

  try {
    // Fetch live quote data for the symbol
    const quote = await apiFetch(`/market/quote/${symbol}`, token);

    res.render('pages/charts', {
      pageTitle: `${symbol} - Live Chart`,
      symbol,
      quote: quote.error ? null : quote,
      fmt
    });
  } catch (error) {
    console.error('Error fetching chart data:', error);
    res.render('pages/charts', {
      pageTitle: 'Stock Chart',
      symbol,
      quote: null,
      fmt
    });
  }
});

// Professional Charts (Advanced Trading Platform)
app.get('/charts-pro', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const symbol = (req.query.symbol as string) || 'AAPL';

  try {
    // Fetch live quote data for the symbol
    const quote = await apiFetch(`/market/quote/${symbol}`, token);

    res.render('pages/charts-pro', {
      pageTitle: `${symbol} - Professional Charts`,
      symbol,
      quote: quote.error ? null : quote,
      fmt
    });
  } catch (error) {
    console.error('Error fetching chart data:', error);
    res.render('pages/charts-pro', {
      pageTitle: 'Professional Charts',
      symbol,
      quote: null,
      fmt
    });
  }
});

// ESG
app.get('/esg', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const symbol = (req.query.symbol as string) || 'AAPL';
  const esg = await apiFetch(`/research/esg/${symbol}`, token);
  res.render('pages/esg', { pageTitle: 'ESG Ratings', esg: esg.error ? null : esg, symbol, fmt });
});

app.get('/esg-breakdown', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const symbol = (req.query.symbol as string) || 'AAPL';
  const esg = await apiFetch(`/research/esg/${symbol}`, token);
  res.render('pages/esg-breakdown', { pageTitle: 'ESG Breakdown', esg: esg.error ? null : esg, symbol, fmt });
});

app.get('/governance', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const symbol = (req.query.symbol as string) || 'AAPL';
  const esg = await apiFetch(`/research/esg/${symbol}`, token);
  res.render('pages/governance', { pageTitle: 'Governance Score', esg: esg.error ? null : esg, symbol, fmt });
});

// News & Sentiment
app.get('/sentiment', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const symbol = (req.query.symbol as string) || 'NVDA';

  // Fetch comprehensive sentiment analysis
  const sentimentData = await apiFetch(`/sentiment/analysis/${symbol}`, token);

  res.render('pages/sentiment', {
    pageTitle: 'Sentiment Analysis',
    symbol,
    sentimentData: sentimentData.error ? null : sentimentData.data,
    fmt
  });
});

app.get('/news-sentiment', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const news = await apiFetch('/analysis/market-news', token);
  res.render('pages/news-sentiment', { pageTitle: 'News Sentiment', news: news.error ? [] : news, fmt });
});

// Sector Analysis - Comprehensive sector allocation and performance
app.get('/sector-analysis', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const selectedTab = (req.query.tab as string) || 'overview';
  const portfolioId = (req.query.portfolio as string) || 'all';
  const period = (req.query.period as string) || '1M';

  try {
    // Fetch portfolios list
    const portfoliosData = await apiFetch('/portfolios', token);
    const portfolios = portfoliosData.error ? [] : portfoliosData;

    console.log('[Sector Analysis] Fetched', portfolios.length, 'portfolios');

    // Fetch all sector data in parallel
    const [sectorsData, performanceData, alphavantageData] = await Promise.all([
      apiFetch('/sector-analysis/sectors', token),
      apiFetch(`/sector-analysis/performance?period=${period}`, token),
      apiFetch('/sector-analysis/alpha-vantage', token)
    ]);

    // Fetch portfolio-specific data using the FIXED endpoint
    let portfolioAllocation = null;
    let portfolioHistory = null;

    if (portfolioId && portfolioId !== 'all' && portfolios.length > 0) {
      const selectedPortfolio = portfolios.find((p: any) => p.id === portfolioId) || portfolios[0];
      if (selectedPortfolio) {
        console.log('[Sector Analysis] Fetching allocation for portfolio:', selectedPortfolio.name);
        // Use the FIXED endpoint that works with Database class
        portfolioAllocation = await apiFetch(`/sector-analysis-fixed/portfolio/${selectedPortfolio.id}`, token);
        console.log('[Sector Analysis] Portfolio allocation:', portfolioAllocation);
      }
    } else if (portfolioId === 'all') {
      // Fetch combined allocation for all portfolios
      console.log('[Sector Analysis] Fetching combined allocation for all portfolios');
      portfolioAllocation = await apiFetch('/sector-analysis-fixed/all-portfolios', token);
      console.log('[Sector Analysis] All portfolios allocation:', portfolioAllocation);
    }

    res.render('pages/sector-analysis', {
      pageTitle: 'Sector Analysis',
      selectedTab,
      portfolioId,
      period,
      portfolios,
      sectors: sectorsData.error ? [] : (sectorsData.data || []),
      performance: performanceData.error ? [] : (performanceData.data || []),
      alphavantage: alphavantageData.error ? null : (alphavantageData.data || null),
      portfolioAllocation: portfolioAllocation?.error ? null : (portfolioAllocation?.data || null),
      portfolioHistory: portfolioHistory?.error ? [] : (portfolioHistory?.data || []),
      fmt
    });
  } catch (error) {
    console.error('Error loading sector analysis:', error);
    res.render('pages/sector-analysis', {
      pageTitle: 'Sector Analysis',
      selectedTab: 'overview',
      portfolioId: 'all',
      period: '1M',
      portfolios: [],
      sectors: [],
      performance: [],
      alphavantage: null,
      portfolioAllocation: null,
      portfolioHistory: [],
      fmt,
      error: 'Failed to load sector data'
    });
  }
});

// Moving Averages & Technical
app.get('/moving-averages', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const symbol = (req.query.symbol as string) || 'AAPL';
  const movingAverages = await apiFetch(`/analytics/moving-averages/${symbol}`, token);
  res.render('pages/moving-averages', { pageTitle: 'Moving Averages', movingAverages: movingAverages.error ? null : movingAverages, symbol, fmt });
});

app.get('/bollinger-bands', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const symbol = (req.query.symbol as string) || 'AAPL';
  const technicals = await apiFetch(`/research/technicals/${symbol}`, token);
  res.render('pages/bollinger-bands', { pageTitle: 'Bollinger Bands', technicals: technicals.error ? null : technicals, symbol, fmt });
});

app.get('/adx-indicator', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const symbol = (req.query.symbol as string) || 'AAPL';
  const technicals = await apiFetch(`/research/technicals/${symbol}`, token);
  res.render('pages/adx-indicator', { pageTitle: 'ADX Indicator', technicals: technicals.error ? null : technicals, symbol, fmt });
});

app.get('/fibonacci', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const symbol = (req.query.symbol as string) || 'AAPL';
  const fibonacci = await apiFetch(`/analytics/fibonacci/${symbol}`, token);
  res.render('pages/fibonacci', { pageTitle: 'Fibonacci Levels', fibonacci: fibonacci.error ? null : fibonacci, symbol, fmt });
});

app.get('/volume-profile', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const symbol = (req.query.symbol as string) || 'AAPL';
  const volumeProfile = await apiFetch(`/analytics/volume-profile/${symbol}`, token);
  res.render('pages/volume-profile', { pageTitle: 'Volume Profile', volumeProfile: volumeProfile.error ? null : volumeProfile, symbol, fmt });
});

// Valuation & Fundamentals
app.get('/valuation', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const symbol = (req.query.symbol as string) || 'AAPL';
  const financials = await apiFetch(`/research/stock/${symbol}/financials`, token);
  res.render('pages/valuation', { pageTitle: 'Valuation Metrics', financials: financials.error ? null : financials, symbol, fmt });
});

app.get('/margin-of-safety', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const symbol = (req.query.symbol as string) || 'AAPL';
  const [financials, ratings] = await Promise.all([
    apiFetch(`/analysis/financials/${symbol}`, token),
    apiFetch(`/analysis/ratings/${symbol}`, token)
  ]);
  res.render('pages/margin-of-safety', { pageTitle: 'Margin of Safety', financials: financials.error ? null : financials, ratings: ratings.error ? null : ratings, symbol, fmt });
});

app.get('/gross-margin', requireAuth, async (req, res) => {
  const token = res.locals.token;

  // Fetch user's portfolios
  const portfolios = await apiFetch('/portfolios', token);
  const portfoliosList = portfolios.error ? [] : portfolios;

  res.render('pages/gross-margin', {
    pageTitle: 'Gross Margin Trends',
    portfolios: portfoliosList,
    token,
    fmt
  });
});

app.get('/margin-expansion', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const symbol = (req.query.symbol as string) || 'AAPL';
  const financials = await apiFetch(`/research/stock/${symbol}/financials`, token);
  res.render('pages/margin-expansion', { pageTitle: 'Margin Expansion', financials: financials.error ? null : financials, symbol, fmt });
});

app.get('/revenue-breakdown', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const symbol = (req.query.symbol as string) || 'AAPL';
  const financials = await apiFetch(`/research/stock/${symbol}/financials`, token);
  res.render('pages/revenue-breakdown', { pageTitle: 'Revenue Breakdown', financials: financials.error ? null : financials, symbol, fmt });
});

app.get('/revenue-per-employee', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const symbol = (req.query.symbol as string) || 'AAPL';
  const [financials, profile] = await Promise.all([
    apiFetch(`/analysis/financials/${symbol}`, token),
    apiFetch(`/analysis/profile/${symbol}`, token)
  ]);
  res.render('pages/revenue-per-employee', { pageTitle: 'Revenue Per Employee', financials: financials.error ? null : financials, profile: profile.error ? null : profile, symbol, fmt });
});

app.get('/price-to-sales', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const symbol = (req.query.symbol as string) || 'AAPL';
  const financials = await apiFetch(`/research/stock/${symbol}/financials`, token);
  res.render('pages/price-to-sales', { pageTitle: 'Price to Sales', financials: financials.error ? null : financials, symbol, fmt });
});

app.get('/working-capital', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const symbol = (req.query.symbol as string) || 'AAPL';
  const balanceSheet = await apiFetch(`/analysis/balance-sheet/${symbol}`, token);
  res.render('pages/working-capital', { pageTitle: 'Working Capital', balanceSheet: balanceSheet.error ? null : balanceSheet, symbol, fmt });
});

// Debt Analysis
app.get('/debt-analysis', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const symbol = (req.query.symbol as string) || 'AAPL';
  const balanceSheet = await apiFetch(`/analysis/balance-sheet/${symbol}`, token);
  res.render('pages/debt-analysis', { pageTitle: 'Debt Analysis', balanceSheet: balanceSheet.error ? null : balanceSheet, symbol, fmt });
});

app.get('/debt-maturity', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const symbol = (req.query.symbol as string) || 'AAPL';
  const balanceSheet = await apiFetch(`/analysis/balance-sheet/${symbol}`, token);
  res.render('pages/debt-maturity', { pageTitle: 'Debt Maturity', balanceSheet: balanceSheet.error ? null : balanceSheet, symbol, fmt });
});

app.get('/interest-coverage', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const symbol = (req.query.symbol as string) || 'AAPL';
  const financials = await apiFetch(`/research/stock/${symbol}/financials`, token);
  res.render('pages/interest-coverage', { pageTitle: 'Interest Coverage', financials: financials.error ? null : financials, symbol, fmt });
});

app.get('/bond-ratings', requireAuth, async (req, res) => {
  res.render('pages/bond-ratings', { pageTitle: 'Bond Ratings', fmt });
});

// Insider & Institutional
app.get('/insider-trading', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const symbol = (req.query.symbol as string) || 'AAPL';
  const insider = await apiFetch(`/research/insider-trading/${symbol}`, token);
  res.render('pages/insider-trading', { pageTitle: 'Insider Trading', insider: insider.error ? null : insider, symbol, fmt });
});

app.get('/insider-transactions', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const symbol = (req.query.symbol as string) || 'AAPL';
  const transactions = await apiFetch(`/analytics/insider-transactions/${symbol}`, token);
  res.render('pages/insider-transactions', { pageTitle: 'Insider Transactions', transactions: transactions.error ? null : transactions, symbol, fmt });
});

app.get('/insider-sentiment', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const symbol = (req.query.symbol as string) || 'AAPL';
  const insider = await apiFetch(`/research/insider-trading/${symbol}`, token);
  res.render('pages/insider-sentiment', { pageTitle: 'Insider Sentiment', insider: insider.error ? null : insider, symbol, fmt });
});

app.get('/institutional', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const symbol = (req.query.symbol as string) || 'AAPL';
  const institutional = await apiFetch(`/analysis/institutional/${symbol}`, token);
  res.render('pages/institutional', { pageTitle: 'Institutional Ownership', institutional: institutional.error ? null : institutional, symbol, fmt });
});

app.get('/buybacks', requireAuth, async (req, res) => {
  res.render('pages/buybacks', { pageTitle: 'Buyback Tracker', fmt });
});

app.get('/float-analysis', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const symbol = (req.query.symbol as string) || 'AAPL';
  const floatData = await apiFetch(`/research/float-analysis/${symbol}`, token);
  res.render('pages/float-analysis', { pageTitle: 'Float Analysis', floatData: floatData.error ? null : floatData, symbol, fmt });
});

// Short Interest
app.get('/short-interest', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const symbol = (req.query.symbol as string) || 'AAPL';
  const shortInterest = await apiFetch(`/research/short-interest/${symbol}`, token);
  res.render('pages/short-interest', { pageTitle: 'Short Interest', shortInterest: shortInterest.error ? null : shortInterest, symbol, fmt });
});

app.get('/shorts-report', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const symbol = (req.query.symbol as string) || 'AAPL';
  const shortInterest = await apiFetch(`/research/short-interest/${symbol}`, token);
  res.render('pages/shorts-report', { pageTitle: 'Shorts Report', shortInterest: shortInterest.error ? null : shortInterest, symbol, fmt });
});

// Options
app.get('/options-chain', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const symbol = (req.query.symbol as string) || 'AAPL';
  const options = await apiFetch(`/research/options/${symbol}`, token);
  res.render('pages/options-chain', { pageTitle: 'Options Chain', options: options.error ? null : options, symbol, fmt });
});

app.get('/options-flow', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const symbol = (req.query.symbol as string) || 'AAPL';
  const options = await apiFetch(`/research/options/${symbol}`, token);
  res.render('pages/options-flow', { pageTitle: 'Options Flow', options: options.error ? null : options, symbol, fmt });
});

app.get('/options-greeks', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const symbol = (req.query.symbol as string) || 'AAPL';
  const greeks = await apiFetch(`/analytics/options-greeks/${symbol}`, token);
  res.render('pages/options-greeks', { pageTitle: 'Options Greeks', greeks: greeks.error ? null : greeks, symbol, fmt });
});

app.get('/options-straddle', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const symbol = (req.query.symbol as string) || 'AAPL';
  const straddles = await apiFetch(`/analytics/straddles/${symbol}`, token);
  res.render('pages/options-straddle', { pageTitle: 'Options Straddles', straddles: straddles.error ? null : straddles, symbol, fmt });
});

app.get('/iv-surface', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const symbol = (req.query.symbol as string) || 'AAPL';
  const ivSurface = await apiFetch(`/analytics/iv-surface/${symbol}`, token);
  res.render('pages/iv-surface', { pageTitle: 'IV Surface', ivSurface: ivSurface.error ? null : ivSurface, symbol, fmt });
});

// Peer Comparison
app.get('/peer-comparison', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const symbol = (req.query.symbol as string) || 'AAPL';
  const peers = await apiFetch(`/research/peers/${symbol}`, token);
  res.render('pages/peer-comparison', { pageTitle: 'Peer Comparison', peers: peers.error ? null : peers, symbol, fmt });
});

app.get('/peer-rankings', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const symbol = (req.query.symbol as string) || 'AAPL';
  const peers = await apiFetch(`/research/peers/${symbol}`, token);
  res.render('pages/peer-rankings', { pageTitle: 'Peer Rankings', peers: peers.error ? null : peers, symbol, fmt });
});

app.get('/stock-compare', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const symbols = ((req.query.symbols as string) || 'AAPL,MSFT,GOOGL').split(',');
  const comparisons = await Promise.all(symbols.map(s => apiFetch(`/analysis/quote/${s.trim()}`, token)));
  res.render('pages/stock-compare', { pageTitle: 'Stock Compare', comparisons, symbols, fmt });
});

// ETF Analyzer
app.get('/etf-analyzer', requireAuth, async (req, res) => {
  res.render('pages/etf-analyzer', { pageTitle: 'ETF Analyzer', fmt });
});

// Economic Calendar
app.get('/economic-calendar', requireAuth, async (req, res) => {
  const token = res.locals.token;

  // Fetch today's events and upcoming events
  const [todayEvents, upcomingEvents, statistics] = await Promise.all([
    apiFetch('/economic-calendar/today', token).catch(() => ({ data: [] })),
    apiFetch('/economic-calendar/upcoming', token).catch(() => ({ data: [] })),
    apiFetch('/economic-calendar/statistics', token).catch(() => ({ data: {} }))
  ]);

  res.render('pages/economic-calendar', {
    pageTitle: 'Economic Calendar',
    todayEvents: todayEvents.data || [],
    upcomingEvents: upcomingEvents.data || [],
    statistics: statistics.data || {},
    fmt
  });
});

app.get('/calendar', requireAuth, async (req, res) => {
  const token = res.locals.token;

  // Fetch calendar events and statistics
  const [events, stats, upcomingEvents] = await Promise.all([
    apiFetch('/calendar', token).catch(() => ({ data: [] })),
    apiFetch('/calendar/stats/summary', token).catch(() => ({ data: {} })),
    apiFetch('/calendar/upcoming/list?limit=5', token).catch(() => ({ data: [] }))
  ]);

  res.render('pages/calendar', {
    pageTitle: 'Calendar',
    events: events.data || [],
    stats: stats.data || {},
    upcomingEvents: upcomingEvents.data || [],
    fmt
  });
});

app.get('/dividend-calendar', requireAuth, async (req, res) => {
  res.render('pages/dividend-calendar', {
    pageTitle: 'Dividend Calendar',
    fmt
  });
});

app.get('/earnings-calendar', requireAuth, async (req, res) => {
  res.render('pages/earnings-calendar', {
    pageTitle: 'Earnings Calendar',
    fmt
  });
});

app.get('/relative-strength', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const symbol = (req.query.symbol as string) || 'AAPL';
  const technicals = await apiFetch(`/research/technicals/${symbol}`, token);
  res.render('pages/relative-strength', { pageTitle: 'Relative Strength', technicals: technicals.error ? null : technicals, symbol, fmt });
});

// Calendars
app.get('/ipo-tracker', requireAuth, async (req, res) => {
  res.render('pages/ipo-tracker', { pageTitle: 'IPO Tracker', fmt });
});

// Other Analysis Pages
app.get('/attribution', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const [portfolios, attribution] = await Promise.all([
    apiFetch('/portfolios', token),
    apiFetch('/analytics/attribution', token)
  ]);
  res.render('pages/attribution', {
    pageTitle: 'Attribution',
    portfolios: portfolios.error ? [] : portfolios,
    attribution: attribution.error ? null : attribution,
    fmt
  });
});

app.get('/analyst-estimates', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const symbol = (req.query.symbol as string) || 'AAPL';
  const [earnings, ratings] = await Promise.all([
    apiFetch(`/analysis/earnings/${symbol}`, token),
    apiFetch(`/analysis/ratings/${symbol}`, token)
  ]);
  res.render('pages/analyst-estimates', { pageTitle: 'Analyst Estimates', earnings: earnings.error ? null : earnings, ratings: ratings.error ? null : ratings, symbol, fmt });
});

app.get('/guidance-tracker', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const symbol = (req.query.symbol as string) || 'AAPL';
  const earnings = await apiFetch(`/analysis/earnings/${symbol}`, token);
  res.render('pages/guidance-tracker', { pageTitle: 'Guidance Tracker', earnings: earnings.error ? null : earnings, symbol, fmt });
});

app.get('/earnings-whispers', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const symbol = (req.query.symbol as string) || 'AAPL';
  const whispers = await apiFetch(`/analytics/earnings-whispers/${symbol}`, token);
  res.render('pages/earnings-whispers', { pageTitle: 'Earnings Whispers', whispers: whispers.error ? null : whispers, symbol, fmt });
});

app.get('/price-targets', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const symbol = (req.query.symbol as string) || 'AAPL';
  const ratings = await apiFetch(`/analysis/ratings/${symbol}`, token);
  res.render('pages/price-targets', { pageTitle: 'Price Targets', ratings: ratings.error ? null : ratings, symbol, fmt });
});

// Risk & Portfolio Analysis
app.get('/risk-parity', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const portfolios = await apiFetch('/portfolios', token);
  res.render('pages/risk-parity', { pageTitle: 'Risk Parity', portfolios: portfolios.error ? [] : portfolios, fmt });
});

app.get('/concentration-risk', requireAuth, async (req, res) => {
  const token = res.locals.token;

  // Fetch all holdings with live prices
  const [holdingsData, portfoliosData] = await Promise.all([
    apiFetch('/holdings/all', token),
    apiFetch('/portfolios', token)
  ]);

  const holdings = holdingsData.error ? [] : holdingsData;
  const portfolios = portfoliosData.error ? [] : portfoliosData;

  // Calculate total market value
  const totalValue = holdings.reduce((sum: number, h: any) => sum + (h.marketValue || 0), 0);

  // Calculate position weights
  const positions = holdings.map((h: any) => ({
    symbol: h.symbol,
    name: h.name || h.symbol,
    marketValue: h.marketValue || 0,
    weight: totalValue > 0 ? ((h.marketValue || 0) / totalValue) * 100 : 0,
    sector: h.sector || 'Unknown',
    gain: h.gain || 0,
    gainPct: h.gainPct || 0
  })).sort((a: any, b: any) => b.weight - a.weight);

  // Add cumulative weights and risk levels
  let cumulative = 0;
  positions.forEach((p: any) => {
    cumulative += p.weight;
    p.cumulative = cumulative;
    if (p.weight > 15) p.riskLevel = 'HIGH';
    else if (p.weight > 10) p.riskLevel = 'MODERATE';
    else p.riskLevel = 'LOW';
  });

  // Calculate sector concentrations
  const sectorMap = new Map();
  for (const h of holdings) {
    const sector = h.sector || 'Unknown';
    if (!sectorMap.has(sector)) {
      sectorMap.set(sector, { name: sector, value: 0 });
    }
    sectorMap.get(sector).value += h.marketValue || 0;
  }
  const sectors = Array.from(sectorMap.values())
    .map(s => ({ ...s, weight: totalValue > 0 ? (s.value / totalValue) * 100 : 0 }))
    .sort((a, b) => b.weight - a.weight);

  // Calculate HHI (Herfindahl-Hirschman Index)
  const hhi = positions.reduce((sum: number, p: any) => sum + Math.pow(p.weight, 2), 0);
  const sectorHHI = sectors.reduce((sum, s) => sum + Math.pow(s.weight, 2), 0);
  const effectivePositions = hhi > 0 ? 10000 / hhi : 0;

  // Determine risk levels
  let overallRisk = 'LOW';
  let riskScore = 100 - Math.min(hhi / 25, 50) - Math.min(sectorHHI / 50, 30);
  if (riskScore < 40) overallRisk = 'HIGH';
  else if (riskScore < 70) overallRisk = 'MODERATE';

  // Find top position
  const topPosition = positions[0] || { symbol: '-', weight: 0 };
  const top5Weight = positions.slice(0, 5).reduce((sum: number, p: any) => sum + p.weight, 0);
  const topSector = sectors[0] || { name: '-', weight: 0 };

  // Generate recommendations
  const recommendations = [];
  if (topPosition.weight > 10) {
    recommendations.push({
      type: 'danger',
      title: `Reduce ${topPosition.symbol} Position`,
      description: `Trim from ${topPosition.weight.toFixed(1)}% to ~10% to reduce single-stock risk`
    });
  }
  if (topSector.weight > 30) {
    recommendations.push({
      type: 'warning',
      title: `Diversify Away from ${topSector.name}`,
      description: `Reduce from ${topSector.weight.toFixed(1)}% to 25-30% for better balance`
    });
  }
  if (recommendations.length === 0) {
    recommendations.push({
      type: 'success',
      title: 'Well Diversified',
      description: 'Your portfolio has healthy position and sector allocations'
    });
  }

  res.render('pages/concentration-risk', {
    pageTitle: 'Concentration Risk',
    positions,
    sectors,
    totalValue,
    hhi: Math.round(hhi),
    sectorHHI: Math.round(sectorHHI),
    effectivePositions: effectivePositions.toFixed(1),
    overallRisk,
    riskScore: Math.round(riskScore),
    topPosition,
    top5Weight,
    topSector,
    recommendations,
    fmt: {
      money: (v: number) => '$' + (v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      compact: (v: number) => {
        const abs = Math.abs(v || 0);
        if (abs >= 1000000) return '$' + (abs / 1000000).toFixed(2) + 'M';
        if (abs >= 1000) return '$' + (abs / 1000).toFixed(1) + 'K';
        return '$' + abs.toFixed(2);
      },
      pct: (v: number) => (v || 0).toFixed(1) + '%'
    }
  });
});

// Redirect /concentration to /concentration-risk
app.get('/concentration', requireAuth, (req, res) => {
  res.redirect('/concentration-risk');
});

app.get('/volatility', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const symbol = (req.query.symbol as string) || 'AAPL';
  const technicals = await apiFetch(`/research/technicals/${symbol}`, token);
  res.render('pages/volatility', { pageTitle: 'Volatility Analysis', technicals: technicals.error ? null : technicals, symbol, fmt });
});

app.get('/stress-test', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const [portfolios, stressTest] = await Promise.all([
    apiFetch('/portfolios', token),
    apiFetch('/analytics/stress-test', token)
  ]);
  res.render('pages/stress-test', {
    pageTitle: 'Stress Test',
    portfolios: portfolios.error ? [] : portfolios,
    stressTest: stressTest.error ? null : stressTest,
    fmt
  });
});

app.get('/liquidity', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const portfolios = await apiFetch('/portfolios', token);
  res.render('pages/liquidity', { pageTitle: 'Liquidity Analysis', portfolios: portfolios.error ? [] : portfolios, fmt });
});

// Scanners & Screeners
app.get('/scanner', requireAuth, async (req, res) => {
  res.render('pages/scanner', { pageTitle: 'Stock Scanner', fmt });
});

app.get('/momentum-screener', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const momentum = await apiFetch('/analytics/momentum-screener', token);
  res.render('pages/momentum-screener', { pageTitle: 'Momentum Screener', momentum: momentum.error ? null : momentum, fmt });
});

// Other pages
app.get('/factors', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const attribution = await apiFetch('/analytics/attribution', token);
  res.render('pages/factors', { pageTitle: 'Factor Investing', factors: attribution.error ? null : attribution, fmt });
});

app.get('/seasonality', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const symbol = (req.query.symbol as string) || 'AAPL';
  const history = await apiFetch(`/research/stock/${symbol}/history?timeframe=5Y`, token);
  res.render('pages/seasonality', { pageTitle: 'Seasonality Analysis', symbol, history: history.error ? null : history, fmt });
});

app.get('/research', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const news = await apiFetch('/analysis/market-news', token);
  res.render('pages/research', { pageTitle: 'Research', news: news.error ? [] : news, fmt });
});

// ==================== RESEARCH CENTER (Comprehensive Stock Analysis) ====================
app.get('/research-center', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const symbol = ((req.query.symbol as string) || 'AAPL').toUpperCase();
  const activeTab = (req.query.tab as string) || 'chart';

  try {
    // Fetch all data in parallel for better performance
    const [
      quote,
      profile,
      technicals,
      fundamentals,
      options,
      earnings,
      financials,
      insiders,
      mutualFunds,
      dividends,
      sentiment,
      shortInterest,
      news,
      moneyFlow,
      tradeOverview,
      priceHistory
    ] = await Promise.all([
      apiFetch(`/market/quote/${symbol}`, token).catch(() => ({})),
      apiFetch(`/research/profile/${symbol}`, token).catch(() => ({})),
      apiFetch(`/research/technicals/${symbol}`, token).catch(() => ({})),
      apiFetch(`/research/fundamentals/${symbol}`, token).catch(() => ({})),
      apiFetch(`/research/options/${symbol}`, token).catch(() => ({})),
      apiFetch(`/research/stock/${symbol}/earnings`, token).catch(() => ({})),
      apiFetch(`/research/stock/${symbol}/financials`, token).catch(() => ({})),
      apiFetch(`/research/insider-trading/${symbol}`, token).catch(() => ({})),
      apiFetch(`/research/mutual-funds/${symbol}`, token).catch(() => ({})),
      apiFetch(`/research/dividends/${symbol}`, token).catch(() => ({})),
      apiFetch(`/sentiment/analysis/${symbol}`, token).catch(() => ({})),
      apiFetch(`/research/short-interest/${symbol}`, token).catch(() => ({})),
      apiFetch(`/research/stock/${symbol}/news`, token).catch(() => ({})),
      apiFetch(`/research/money-flow/${symbol}`, token).catch(() => ({})),
      apiFetch(`/research/trade-overview/${symbol}`, token).catch(() => ({})),
      apiFetch(`/market/history/${symbol}?timeframe=1Y`, token).catch(() => ({}))
    ]);

    res.render('pages/research-center', {
      pageTitle: `Research Center - ${symbol}`,
      symbol,
      activeTab,
      quote: quote.error ? {} : quote,
      profile: profile.error ? {} : profile,
      technicals: technicals.error ? {} : technicals,
      fundamentals: fundamentals.error ? {} : fundamentals,
      options: options.error ? {} : options,
      earnings: earnings.error ? {} : earnings,
      financials: financials.error ? {} : financials,
      insiders: insiders.error ? [] : insiders,
      mutualFunds: mutualFunds.error ? {} : mutualFunds,
      dividends: dividends.error ? {} : dividends,
      sentiment: sentiment.error ? {} : sentiment,
      shortInterest: shortInterest.error ? {} : shortInterest,
      news: news.error ? [] : (Array.isArray(news) ? news : []),
      moneyFlow: moneyFlow.error ? {} : moneyFlow,
      tradeOverview: tradeOverview.error ? {} : tradeOverview,
      priceHistory: priceHistory.error ? [] : (Array.isArray(priceHistory) ? priceHistory : (priceHistory.history || priceHistory.prices || [])),
      fmt
    });
  } catch (error: any) {
    console.error('Research Center error:', error);
    res.render('pages/research-center', {
      pageTitle: `Research Center - ${symbol}`,
      symbol,
      activeTab,
      quote: {},
      profile: {},
      technicals: {},
      fundamentals: {},
      options: {},
      earnings: {},
      financials: {},
      insiders: [],
      mutualFunds: {},
      dividends: {},
      sentiment: {},
      shortInterest: {},
      news: [],
      moneyFlow: {},
      tradeOverview: {},
      priceHistory: [],
      fmt,
      error: 'Failed to load data'
    });
  }
});

app.get('/mutual-funds', requireAuth, async (req, res) => {
  res.render('pages/mutual-funds', { pageTitle: 'Mutual Funds', fmt });
});

app.get('/optimizer', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const portfolios = await apiFetch('/portfolios', token);
  res.render('pages/optimizer', { pageTitle: 'Portfolio Optimizer', portfolios: portfolios.error ? [] : portfolios, fmt });
});

app.get('/backtest', requireAuth, async (req, res) => {
  res.render('pages/backtest', { pageTitle: 'Backtest', fmt });
});

app.get('/etf-analyzer', requireAuth, async (req, res) => {
  res.render('pages/etf-analyzer', { pageTitle: 'ETF Analyzer', fmt });
});

app.get('/compare-portfolios', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const portfolios = await apiFetch('/portfolios', token);
  res.render('pages/compare-portfolios', { pageTitle: 'Compare Portfolios', portfolios: portfolios.error ? [] : portfolios, fmt });
});

app.get('/trade-ideas', requireAuth, async (req, res) => {
  res.render('pages/trade-ideas', { pageTitle: 'Trade Ideas', fmt });
});

app.get('/portfolio-history', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const portfolios = await apiFetch('/portfolios', token);
  res.render('pages/portfolio-history', { pageTitle: 'Portfolio History', portfolios: portfolios.error ? [] : portfolios, fmt });
});

app.get('/corporate-actions', requireAuth, async (req, res) => {
  res.render('pages/corporate-actions', { pageTitle: 'Corporate Actions', fmt });
});

app.get('/spac-tracker', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const spacs = await apiFetch('/analytics/spac-tracker', token);
  res.render('pages/spac-tracker', { pageTitle: 'SPAC Tracker', spacs: spacs.error ? null : spacs, fmt });
});

app.get('/dividend-yield-curve', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const yieldCurve = await apiFetch('/analytics/yield-curve', token);
  res.render('pages/dividend-yield-curve', { pageTitle: 'Dividend Yield Curve', yieldCurve: yieldCurve.error ? null : yieldCurve, fmt });
});

// ==================== REPORTS & TAX (with real data) ====================

app.get('/reports', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const [templates, portfolios] = await Promise.all([
    apiFetch('/reports/templates', token),
    apiFetch('/portfolios', token)
  ]);
  res.render('pages/reports', {
    pageTitle: 'Reports',
    templates: templates.templates || [],
    portfolios: portfolios.error ? [] : portfolios,
    fmt
  });
});

app.get('/reports-ai', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const reports = await apiFetch('/reports', token);
  res.render('pages/reports-ai', { pageTitle: 'AI Reports', reports: reports.error ? [] : reports, fmt });
});

app.get('/tax', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const year = parseInt(req.query.year as string) || new Date().getFullYear();
  const [taxSummary, taxDocs, taxLots] = await Promise.all([
    apiFetch(`/tax/summary?year=${year}`, token),
    apiFetch('/tax/documents', token),
    apiFetch('/tax/lots', token)
  ]);
  res.render('pages/tax', {
    pageTitle: 'Tax Center',
    summary: taxSummary.error ? null : taxSummary,
    documents: taxDocs.error ? [] : taxDocs,
    lots: taxLots.error ? [] : taxLots,
    year,
    fmt
  });
});

app.get('/export', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const portfolios = await apiFetch('/portfolios', token);
  res.render('pages/export', { pageTitle: 'Export', portfolios: portfolios.error ? [] : portfolios, fmt });
});

app.get('/journal', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const [entries, stats] = await Promise.all([
    apiFetch('/journal', token),
    apiFetch('/journal/stats', token)
  ]);
  res.render('pages/journal', {
    pageTitle: 'Trading Journal',
    entries: entries.error ? [] : entries,
    stats: stats.error ? { totalTrades: 0, wins: 0, losses: 0, winRate: 0, totalProfitLoss: 0 } : stats,
    fmt
  });
});

// ==================== HELP & DOCUMENTATION ====================

app.get('/help', async (req, res) => {
  const [overview, faqs] = await Promise.all([
    apiFetch('/help/overview'),
    apiFetch('/help/faqs')
  ]);
  res.render('pages/help', {
    pageTitle: 'Help & Documentation',
    overview: overview.overview || {},
    faqs: faqs.faqs || [],
    fmt
  });
});

app.get('/help/article/:slug', async (req, res) => {
  const articleData = await apiFetch(`/help/articles/${req.params.slug}`);
  if (articleData.error) {
    return res.redirect('/help');
  }
  res.render('pages/help-article', {
    pageTitle: articleData.article.title,
    article: articleData.article,
    category: articleData.category,
    relatedArticles: articleData.relatedArticles || [],
    fmt
  });
});

// ==================== GOALS & PLANNING (with real data) ====================

app.get('/goals', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const goals = await apiFetch('/goals', token);
  res.render('pages/goals', { pageTitle: 'Goals', goals: goals.error ? [] : goals, fmt });
});

app.get('/rebalance', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const analysis = await apiFetch('/rebalancer/analysis', token);
  res.render('pages/rebalance', {
    pageTitle: 'Rebalancer',
    analysis: analysis.error ? null : analysis,
    fmt
  });
});

app.get('/income-projections', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const projections = await apiFetch('/income/projections', token);
  res.render('pages/income-projections', {
    pageTitle: 'Income Projections',
    data: projections.error ? null : projections,
    fmt
  });
});

app.get('/calculators', requireAuth, (req, res) => {
  res.render('pages/calculators', { pageTitle: 'Calculators', fmt });
});

app.get('/templates', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const templates = await apiFetch('/templates', token);
  res.render('pages/templates', {
    pageTitle: 'Portfolio Templates',
    templates: templates.error ? [] : templates,
    fmt
  });
});

app.get('/education', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const courses = await apiFetch('/education/courses', token);
  res.render('pages/education', {
    pageTitle: 'Education',
    courses: courses.error ? [] : courses,
    fmt
  });
});

app.get('/import', requireAuth, (req, res) => {
  res.render('pages/import', { pageTitle: 'Import Data', fmt });
});

app.get('/import-wizard', requireAuth, (req, res) => {
  res.render('pages/import-wizard', { pageTitle: 'Import Wizard', fmt });
});

app.get('/real-estate', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const data = await apiFetch('/real-estate', token);
  res.render('pages/real-estate', {
    pageTitle: 'Real Estate',
    properties: data.error ? [] : data.properties,
    totals: data.error ? { totalValue: 0, totalEquity: 0, totalIncome: 0 } : data.totals,
    fmt
  });
});

app.get('/bonds', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const data = await apiFetch('/bonds', token);
  res.render('pages/bonds', {
    pageTitle: 'Bonds',
    bonds: data.error ? [] : data.bonds,
    totals: data.error ? { totalFaceValue: 0, totalPurchasePrice: 0, totalAnnualIncome: 0 } : data.totals,
    fmt
  });
});

app.get('/drip', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const [settings, portfolios] = await Promise.all([
    apiFetch('/drip', token),
    apiFetch('/portfolios', token)
  ]);
  res.render('pages/drip', {
    pageTitle: 'DRIP Settings',
    settings: settings.error ? [] : settings,
    portfolios: portfolios.error ? [] : portfolios,
    fmt
  });
});

app.get('/margin', requireAuth, (req, res) => {
  res.render('pages/margin', { pageTitle: 'Margin Calculator', fmt });
});

// ==================== TOOLS (with real data) ====================

app.get('/alerts-history', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const history = await apiFetch('/alerts/history', token);
  res.render('pages/alerts-history', {
    pageTitle: 'Alerts History',
    history: history.error ? [] : history,
    fmt
  });
});

app.get('/paper-trading', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const data = await apiFetch('/paper-trading/portfolio', token);
  res.render('pages/paper-trading', {
    pageTitle: 'Paper Trading',
    portfolio: data.error ? { cash_balance: 100000, total_value: 100000 } : data.portfolio,
    openTrades: data.error ? [] : data.openTrades,
    stats: data.error ? { totalTrades: 0, wins: 0, losses: 0, winRate: 0, totalProfitLoss: 0 } : data.stats,
    fmt
  });
});

app.get('/position-sizing', requireAuth, (req, res) => {
  res.render('pages/position-sizing', { pageTitle: 'Position Sizing', fmt });
});

app.get('/currency', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const rates = await apiFetch('/currency/rates', token);
  res.render('pages/currency', {
    pageTitle: 'Currency',
    rates: rates.error ? { rates: {} } : rates,
    fmt
  });
});

app.get('/broker', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const [connections, supported] = await Promise.all([
    apiFetch('/broker/connections', token),
    apiFetch('/broker/supported', token)
  ]);
  res.render('pages/broker', {
    pageTitle: 'Broker Integration',
    connections: connections.error ? [] : connections,
    supportedBrokers: supported.error ? [] : supported.brokers,
    fmt
  });
});

app.get('/api-access', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const apiKeys = await apiFetch('/api-keys', token);
  res.render('pages/api', {
    pageTitle: 'API Access',
    apiKeys: apiKeys.error ? [] : apiKeys,
    fmt
  });
});

app.get('/assistant', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const history = await apiFetch('/chat/history', token);
  res.render('pages/assistant', {
    pageTitle: 'AI Assistant',
    chatHistory: history.error ? [] : history,
    fmt
  });
});

app.get('/chat', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const [history, portfolio] = await Promise.all([
    apiFetch('/chat/history', token),
    apiFetch('/portfolios/summary', token)
  ]);
  res.render('pages/chat', {
    pageTitle: 'AI Chat',
    chatHistory: history.error ? [] : history,
    portfolioData: portfolio.error ? {} : portfolio,
    fmt
  });
});

app.get('/crypto', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const data = await apiFetch('/crypto', token);
  res.render('pages/crypto', {
    pageTitle: 'Crypto Portfolio',
    holdings: data.error ? [] : data.holdings,
    totals: data.error ? { totalValue: 0, totalCost: 0, totalGain: 0 } : data.totals,
    fmt
  });
});

app.get('/crypto-portfolio', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const data = await apiFetch('/crypto', token);
  res.render('pages/crypto-portfolio', {
    pageTitle: 'Crypto Portfolio',
    holdings: data.error ? [] : data.holdings,
    totals: data.error ? { totalValue: 0, totalCost: 0, totalGain: 0 } : data.totals,
    fmt
  });
});

app.get('/copy-trading', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const data = await apiFetch('/copy-trading/traders', token);
  res.render('pages/copy-trading', {
    pageTitle: 'Copy Trading',
    following: data.error ? [] : data.following,
    availableTraders: data.error ? [] : data.availableTraders,
    fmt
  });
});

app.get('/share-portfolio', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const portfolios = await apiFetch('/portfolios', token);
  res.render('pages/share-portfolio', {
    pageTitle: 'Share Portfolio',
    portfolios: portfolios.error ? [] : portfolios,
    fmt
  });
});

// ==================== COMMUNITY (with real data) ====================

app.get('/social', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const [feed, followers, following] = await Promise.all([
    apiFetch('/social/feed', token),
    apiFetch('/social/followers', token),
    apiFetch('/social/following', token)
  ]);
  res.render('pages/social', {
    pageTitle: 'Social Feed',
    posts: feed.error ? [] : feed,
    followers: followers.error ? [] : followers,
    following: following.error ? [] : following,
    fmt
  });
});

app.get('/leaderboard', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const leaderboard = await apiFetch('/leaderboard', token);
  res.render('pages/leaderboard', {
    pageTitle: 'Leaderboard',
    leaderboard: leaderboard.error ? [] : leaderboard,
    fmt
  });
});

app.get('/forum', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const categoryId = req.query.category as string;
  const [categories, posts] = await Promise.all([
    apiFetch('/forum/categories', token),
    apiFetch(`/forum/posts${categoryId ? `?categoryId=${categoryId}` : ''}`, token)
  ]);
  res.render('pages/forum', {
    pageTitle: 'Forum',
    categories: categories.error ? [] : categories,
    posts: posts.error ? [] : posts,
    selectedCategory: categoryId || null,
    fmt
  });
});

app.get('/forum/post/:id', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const data = await apiFetch(`/forum/posts/${req.params.id}`, token);
  if (data.error) {
    return res.redirect('/forum');
  }
  res.render('pages/forum-post', {
    pageTitle: data.post.title,
    post: data.post,
    replies: data.replies,
    fmt
  });
});

app.get('/news', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const [newsResponse, portfolioResponse] = await Promise.all([
    apiFetch('/news?limit=20', token),
    apiFetch('/portfolios/summary', token)
  ]);

  // Handle both old format (array) and new format ({ news, sentiment })
  let newsItems = [];
  let sentiment = { bullish: 0, neutral: 100, bearish: 0 };

  if (newsResponse && !newsResponse.error) {
    if (Array.isArray(newsResponse)) {
      newsItems = newsResponse;
    } else if (newsResponse.news && Array.isArray(newsResponse.news)) {
      newsItems = newsResponse.news;
      sentiment = newsResponse.sentiment || sentiment;
    }
  }

  // Extract holdings from portfolio for quick filter buttons
  const holdings = portfolioResponse?.holdings || [];

  res.render('pages/news', {
    pageTitle: 'News',
    news: newsItems,
    sentiment: sentiment,
    holdings: holdings,
    fmt
  });
});

app.get('/calendar', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const events = await apiFetch('/calendar/events', token);
  res.render('pages/calendar', {
    pageTitle: 'Calendar',
    events: events.error ? [] : events,
    fmt
  });
});

// Account Settings
app.get('/settings', requireAuth, async (req, res) => {
  const token = res.locals.token;

  // Fetch all settings data in parallel
  const [settingsData, apiKeysData, sessionsData, portfoliosData] = await Promise.all([
    apiFetch('/settings', token),
    apiFetch('/settings/api-keys', token).catch(() => []),
    apiFetch('/settings/sessions', token).catch(() => []),
    apiFetch('/portfolios', token).catch(() => [])
  ]);

  const user = settingsData.error ? {} : (settingsData.profile || {});
  const settings = settingsData.error ? {} : (settingsData.preferences || {});
  const apiKeys = Array.isArray(apiKeysData) ? apiKeysData : [];
  const sessions = Array.isArray(sessionsData) ? sessionsData : [];
  const portfolios = Array.isArray(portfoliosData) ? portfoliosData : (portfoliosData.error ? [] : portfoliosData);

  res.render('pages/settings', {
    pageTitle: 'Settings',
    user,
    settings,
    apiKeys,
    sessions,
    portfolios,
    req,
    currentPage: 'settings',
    fmt
  });
});

app.get('/profile', requireAuth, (req, res) => {
  res.redirect('/settings');
});

// ===================== PORTFOLIO MANAGER (INSTITUTIONAL GRADE) =====================

app.get('/portfolio-manager', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const selectedPortfolioId = req.query.portfolio as string || '';

  // Fetch user's portfolios
  const portfoliosData = await apiFetch('/portfolios', token);
  const portfolios = portfoliosData.error ? [] : portfoliosData;

  // Get selected portfolio details if specified
  let selectedPortfolio = null;
  let holdings: any[] = [];
  let sectors: any[] = [];
  let analytics: any = null;

  if (selectedPortfolioId && portfolios.length > 0) {
    selectedPortfolio = portfolios.find((p: any) => p.id === selectedPortfolioId) || portfolios[0];

    // Fetch holdings for selected portfolio
    const holdingsData = await apiFetch(`/holdings?portfolioId=${selectedPortfolio.id}`, token);
    holdings = holdingsData.error ? [] : holdingsData;

    // Fetch analytics for selected portfolio
    const analyticsData = await apiFetch(`/analytics/portfolio/${selectedPortfolio.id}`, token);
    analytics = analyticsData.error ? null : analyticsData;

    // Calculate sector allocation from holdings
    const sectorMap = new Map();
    holdings.forEach((h: any) => {
      const sector = h.sector || 'Other';
      const current = sectorMap.get(sector) || { name: sector, value: 0, count: 0 };
      current.value += h.marketValue || 0;
      current.count += 1;
      sectorMap.set(sector, current);
    });
    sectors = Array.from(sectorMap.values());
  } else if (portfolios.length > 0) {
    selectedPortfolio = portfolios[0];
    const holdingsData = await apiFetch(`/holdings?portfolioId=${selectedPortfolio.id}`, token);
    holdings = holdingsData.error ? [] : holdingsData;
  }

  // Calculate portfolio totals
  const totals = {
    value: holdings.reduce((sum: number, h: any) => sum + (h.marketValue || 0), 0) + (selectedPortfolio?.cashBalance || 0),
    cost: holdings.reduce((sum: number, h: any) => sum + (h.totalCost || 0), 0),
    gain: holdings.reduce((sum: number, h: any) => sum + (h.gain || 0), 0),
    dayChange: holdings.reduce((sum: number, h: any) => sum + (h.dayChange || 0) * (h.shares || 0), 0),
    dividendIncome: holdings.reduce((sum: number, h: any) => sum + ((h.dividendYield || 0) / 100 * (h.marketValue || 0)), 0),
    cash: selectedPortfolio?.cashBalance || 0,
    holdingsCount: holdings.length
  };

  // Calculate asset allocation
  const allocation = {
    equity: 0,
    fixedIncome: 0,
    other: 0
  };

  holdings.forEach((h: any) => {
    const assetType = (h.assetType || 'stock').toLowerCase();
    const value = h.marketValue || 0;
    if (['stock', 'etf', 'equity'].includes(assetType)) {
      allocation.equity += value;
    } else if (['bond', 'fixed income', 'fixed_income'].includes(assetType)) {
      allocation.fixedIncome += value;
    } else {
      allocation.other += value;
    }
  });

  // Convert to percentages
  const totalInvested = allocation.equity + allocation.fixedIncome + allocation.other;
  if (totalInvested > 0) {
    allocation.equity = (allocation.equity / totalInvested) * 100;
    allocation.fixedIncome = (allocation.fixedIncome / totalInvested) * 100;
    allocation.other = (allocation.other / totalInvested) * 100;
  }

  // Format helpers
  const fmt = {
    money: (v: number) => '$' + (v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    compact: (v: number) => {
      if (v >= 1000000) return '$' + (v / 1000000).toFixed(2) + 'M';
      if (v >= 1000) return '$' + (v / 1000).toFixed(1) + 'K';
      return '$' + (v || 0).toFixed(2);
    },
    pct: (v: number) => (v >= 0 ? '+' : '') + (v || 0).toFixed(2) + '%',
    number: (v: number) => (v || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })
  };

  res.render('pages/portfolio-manager', {
    pageTitle: 'Portfolio Manager',
    portfolios,
    selectedPortfolio,
    holdings,
    sectors,
    analytics,
    totals,
    allocation,
    currentPage: 'portfolio-manager',
    fmt
  });
});

// ===================== API PROXY ROUTES =====================

// Theme toggle
app.post('/api/theme', (req, res) => {
  const theme = req.body.theme || 'dark';
  res.cookie('theme', theme, { maxAge: 365 * 24 * 60 * 60 * 1000 });
  res.json({ success: true, theme });
});

// Proxy for frontend API calls
// NOTE: File uploads are handled by http-proxy-middleware at line 30
// This fallback handler is for JSON-based API calls only
app.all('/api/*', async (req, res) => {
  const endpoint = req.path.replace('/api', '');

  // Skip multipart/form-data requests - they're handled by the proxy middleware
  const contentType = req.get('content-type') || '';
  if (contentType.includes('multipart/form-data')) {
    // This shouldn't happen if proxy middleware is working, but just in case
    console.log(`[API Fallback] Skipping multipart request for ${endpoint} - should be handled by proxy`);
    return res.status(500).json({ error: 'File upload proxy error - multipart not supported in fallback handler' });
  }

  const queryString = req.originalUrl.split('?')[1];
  const fullUrl = queryString ? `${API_URL}${endpoint}?${queryString}` : `${API_URL}${endpoint}`;
  const token = req.cookies.token;

  // Debug logging
  console.log(`[API Proxy] ${req.method} ${endpoint}${queryString ? '?' + queryString : ''} - Token: ${token ? 'present (' + token.substring(0, 20) + '...)' : 'MISSING'}`);

  try {
    const response = await fetch(fullUrl, {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` })
      },
      ...(req.method !== 'GET' && { body: JSON.stringify(req.body) })
    });

    const data = await response.json();
    if (response.status >= 400) {
      console.log(`[API Proxy] Error response: ${JSON.stringify(data)}`);
    }
    res.status(response.status).json(data);
  } catch (err) {
    console.error('[API Proxy] Fetch error:', err);
    res.status(500).json({ error: 'API request failed' });
  }
});

// ===================== PORTFOLIO TOOLS ROUTE =====================

// Portfolio Tools Route (rebalancing, tax loss harvesting, dividend forecasting)
app.get('/portfolio-tools', requireAuth, async (req, res) => {
  const token = res.locals.token;
  const selectedPortfolio = (req.query.portfolio as string) || 'all';
  const selectedTool = (req.query.tool as string) || 'rebalancing';

  // Fetch portfolios list
  const portfoliosData = await apiFetch('/portfolios', token);
  const portfolios = portfoliosData.error ? [] : portfoliosData;

  // Fetch data based on selected tool
  let toolData = null;
  let endpoint = '';

  if (selectedPortfolio && selectedPortfolio !== 'all') {
    switch(selectedTool) {
      case 'rebalancing':
        endpoint = `/portfolio-tools/rebalancing/analyze?portfolioId=${selectedPortfolio}&strategy=equal_weight`;
        break;
      case 'tax-loss':
        endpoint = `/portfolio-tools/tax-loss-harvesting/opportunities?portfolioId=${selectedPortfolio}&minLossThreshold=5`;
        break;
      case 'dividends':
        endpoint = `/portfolio-tools/dividends/forecast?portfolioId=${selectedPortfolio}`;
        break;
      case 'all':
        endpoint = `/portfolio-tools/optimize/all?portfolioId=${selectedPortfolio}`;
        break;
    }

    if (endpoint) {
      toolData = await apiFetch(endpoint, token);
    }
  }

  // Format helpers
  const fmt = {
    money: (v: number) => '$' + (v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    compact: (v: number) => '$' + (v >= 1000000 ? (v / 1000000).toFixed(2) + 'M' : v >= 1000 ? (v / 1000).toFixed(1) + 'K' : (v || 0).toFixed(2)),
    pct: (v: number) => { const safeV = v || 0; return (safeV >= 0 ? '+' : '') + safeV.toFixed(2) + '%'; },
    number: (v: number) => (v || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })
  };

  res.render('pages/portfolio-tools', {
    pageTitle: 'Portfolio Optimization Tools',
    portfolios,
    selectedPortfolio,
    selectedTool,
    toolData: toolData?.error ? null : toolData,
    currentPage: 'portfolio-tools',
    fmt
  });
});

// ===================== START SERVER =====================

app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   WealthPilot Pro - Frontend Server                          ║
║                                                              ║
║   Frontend: http://localhost:${PORT}                             ║
║   Backend API: ${API_URL}
║                                                              ║
║   Ready for connections...                                   ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
  `);
});

export default app;
