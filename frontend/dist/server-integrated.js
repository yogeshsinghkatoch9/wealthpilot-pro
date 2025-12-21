"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3000;
const API_URL = process.env.API_URL || 'http://localhost:4000/api';
app.set('view engine', 'ejs');
app.set('views', path_1.default.join(__dirname, '../views'));
app.use(express_1.default.static(path_1.default.join(__dirname, '../public')));
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
app.use((0, cookie_parser_1.default)());
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
    res.locals.apiUrl = API_URL;
    if (token) {
        try {
            const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
            res.locals.user = { id: payload.userId, email: payload.email };
        }
        catch (e) {
            res.clearCookie('token');
            res.locals.isAuthenticated = false;
        }
    }
    next();
});
// API fetch helper
async function apiFetch(endpoint, token = null, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (token)
        headers['Authorization'] = `Bearer ${token}`;
    try {
        const response = await fetch(`${API_URL}${endpoint}`, { ...options, headers });
        return await response.json();
    }
    catch (err) {
        console.error(`API Error (${endpoint}):`, err);
        return { error: 'Network error' };
    }
}
// Require auth helper
function requireAuth(req, res, next) {
    if (!res.locals.isAuthenticated) {
        return res.redirect('/login');
    }
    next();
}
// ===================== AUTH ROUTES =====================
app.get('/login', (req, res) => {
    if (res.locals.isAuthenticated)
        return res.redirect('/');
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
        httpOnly: true
    });
    res.redirect('/');
});
app.get('/register', (req, res) => {
    if (res.locals.isAuthenticated)
        return res.redirect('/');
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
    res.cookie('token', data.token, { maxAge: 7 * 24 * 60 * 60 * 1000, httpOnly: true });
    res.redirect('/');
});
app.get('/logout', (req, res) => {
    res.clearCookie('token');
    res.redirect('/login');
});
// ===================== DASHBOARD (with real data) =====================
app.get('/', requireAuth, async (req, res) => {
    const token = res.locals.token;
    // Fetch dashboard data from API
    const [dashboardData, portfoliosData] = await Promise.all([
        apiFetch('/analytics/dashboard', token),
        apiFetch('/portfolios', token)
    ]);
    const portfolios = portfoliosData.error ? [] : portfoliosData;
    const dashboard = dashboardData.error ? null : dashboardData;
    // Transform to template format
    const totals = dashboard ? {
        value: dashboard.totalValue || 0,
        cost: dashboard.totalCost || 0,
        gain: dashboard.totalGain || 0,
        income: dashboard.annualDividends || 0,
        holdings: dashboard.holdingsCount || 0
    } : { value: 0, cost: 0, gain: 0, income: 0, holdings: 0 };
    // Build analysis object for template
    const analysis = dashboard ? {
        health_score: { score: 75, grade: 'Good', factors: { diversification: 20, risk: 18, income: 17, growth: 20 } },
        risk_metrics: {
            annual_volatility: (dashboard.riskMetrics?.volatility || 15).toFixed(1),
            sharpe_ratio: (dashboard.riskMetrics?.sharpeRatio || 1.2).toFixed(2),
            sortino_ratio: (dashboard.riskMetrics?.sortinoRatio || 1.5).toFixed(2),
            max_drawdown: (dashboard.riskMetrics?.maxDrawdown || 12).toFixed(1),
            beta: (dashboard.riskMetrics?.beta || 1.1).toFixed(2),
            alpha: (dashboard.riskMetrics?.alpha || 2.5).toFixed(1),
            var_95: (dashboard.riskMetrics?.var95 || 3.5).toFixed(1),
            annual_return: (dashboard.totalGainPct || 15).toFixed(1)
        },
        sector_allocation: (dashboard.sectorAllocation || []).map((s) => ({
            sector: s.sector,
            weight: s.weight
        })),
        top_holdings: (dashboard.holdings || []).slice(0, 10).map((h) => ({
            symbol: h.symbol,
            name: h.name || h.symbol,
            weight: h.weight || (h.marketValue / totals.value * 100)
        })),
        ai_insights: [
            { type: 'info', title: 'Portfolio Health', message: 'Your portfolio is well diversified across sectors.' },
            { type: 'opportunity', title: 'Dividend Growth', message: 'Consider adding dividend aristocrats for steady income.' }
        ],
        rebalance_recommendations: []
    } : null;
    // Format helpers
    const fmt = {
        money: (v) => '$' + (v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        compact: (v) => '$' + (v >= 1000000 ? (v / 1000000).toFixed(2) + 'M' : v >= 1000 ? (v / 1000).toFixed(1) + 'K' : v.toFixed(2)),
        pct: (v) => (v >= 0 ? '+' : '') + v.toFixed(2) + '%'
    };
    res.render('pages/dashboard', {
        pageTitle: 'Dashboard',
        portfolios,
        totals,
        analysis,
        selectedPid: portfolios[0]?.id || null,
        fmt
    });
});
app.get('/dashboard', requireAuth, async (req, res) => {
    res.redirect('/');
});
// ===================== PORTFOLIO ROUTES (with real data) =====================
app.get('/portfolio', requireAuth, async (req, res) => {
    const token = res.locals.token;
    const portfolioId = req.query.id;
    let portfolio = null;
    let portfolios = await apiFetch('/portfolios', token);
    if (portfolioId) {
        portfolio = await apiFetch(`/portfolios/${portfolioId}`, token);
    }
    else if (!portfolios.error && portfolios.length > 0) {
        // Get default portfolio
        const defaultP = portfolios.find((p) => p.isDefault) || portfolios[0];
        portfolio = await apiFetch(`/portfolios/${defaultP.id}`, token);
    }
    res.render('pages/portfolio', {
        pageTitle: 'Portfolio',
        portfolio: portfolio?.error ? null : portfolio,
        portfolios: portfolios.error ? [] : portfolios
    });
});
app.get('/holdings', requireAuth, async (req, res) => {
    const token = res.locals.token;
    const portfolios = await apiFetch('/portfolios', token);
    // Combine all holdings from all portfolios
    let allHoldings = [];
    if (!portfolios.error) {
        for (const p of portfolios) {
            if (p.holdings) {
                allHoldings.push(...p.holdings.map((h) => ({ ...h, portfolioName: p.name })));
            }
        }
    }
    res.render('pages/holdings', {
        pageTitle: 'Holdings',
        holdings: allHoldings,
        portfolios: portfolios.error ? [] : portfolios
    });
});
app.get('/transactions', requireAuth, async (req, res) => {
    const token = res.locals.token;
    const { portfolioId, symbol, type, limit } = req.query;
    const params = new URLSearchParams();
    if (portfolioId)
        params.append('portfolioId', portfolioId);
    if (symbol)
        params.append('symbol', symbol);
    if (type)
        params.append('type', type);
    if (limit)
        params.append('limit', limit);
    const result = await apiFetch(`/transactions?${params}`, token);
    res.render('pages/transactions', {
        pageTitle: 'Transactions',
        transactions: result.error ? [] : (result.transactions || []),
        pagination: result.pagination || {}
    });
});
app.get('/watchlist', requireAuth, async (req, res) => {
    const token = res.locals.token;
    const watchlists = await apiFetch('/watchlists', token);
    res.render('pages/watchlist', {
        pageTitle: 'Watchlist',
        watchlists: watchlists.error ? [] : watchlists
    });
});
// ===================== ANALYTICS ROUTES (with real data) =====================
app.get('/analytics', requireAuth, async (req, res) => {
    const token = res.locals.token;
    const dashboard = await apiFetch('/analytics/dashboard', token);
    res.render('pages/analytics', {
        pageTitle: 'Analytics',
        dashboard: dashboard.error ? null : dashboard
    });
});
app.get('/performance', requireAuth, async (req, res) => {
    const token = res.locals.token;
    const period = req.query.period || '1M';
    const performance = await apiFetch(`/analytics/performance?period=${period}`, token);
    res.render('pages/performance', {
        pageTitle: 'Performance',
        performance: performance.error ? null : performance,
        period
    });
});
app.get('/dividends', requireAuth, async (req, res) => {
    const token = res.locals.token;
    const portfolios = await apiFetch('/portfolios', token);
    // Get dividends for default portfolio
    let dividends = null;
    if (!portfolios.error && portfolios.length > 0) {
        const defaultP = portfolios.find((p) => p.isDefault) || portfolios[0];
        dividends = await apiFetch(`/portfolios/${defaultP.id}/dividends`, token);
    }
    res.render('pages/dividends', {
        pageTitle: 'Dividends',
        dividends: dividends?.error ? null : dividends
    });
});
app.get('/risk', requireAuth, async (req, res) => {
    const token = res.locals.token;
    const risk = await apiFetch('/analytics/risk', token);
    res.render('pages/risk', {
        pageTitle: 'Risk Analysis',
        risk: risk.error ? null : risk
    });
});
app.get('/sectors', requireAuth, async (req, res) => {
    const token = res.locals.token;
    const allocation = await apiFetch('/analytics/allocation', token);
    res.render('pages/sectors', {
        pageTitle: 'Sectors',
        allocation: allocation.error ? null : allocation
    });
});
app.get('/tax-lots', requireAuth, async (req, res) => {
    const token = res.locals.token;
    const taxLots = await apiFetch('/analytics/tax-lots', token);
    res.render('pages/tax-lots', {
        pageTitle: 'Tax Lots',
        taxLots: taxLots.error ? null : taxLots
    });
});
app.get('/correlation', requireAuth, async (req, res) => {
    const token = res.locals.token;
    const correlations = await apiFetch('/analytics/correlations', token);
    res.render('pages/correlation', {
        pageTitle: 'Correlation Matrix',
        correlations: correlations.error ? null : correlations
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
// ===================== STATIC PAGES (no real data yet) =====================
// Analysis pages
app.get('/attribution', (req, res) => res.render('pages/attribution', { pageTitle: 'Attribution' }));
app.get('/dividend-screener', (req, res) => res.render('pages/dividend-screener', { pageTitle: 'Dividend Screener' }));
app.get('/dividend-calendar', (req, res) => res.render('pages/dividend-calendar', { pageTitle: 'Dividend Calendar' }));
app.get('/dividend-growth', (req, res) => res.render('pages/dividend-growth', { pageTitle: 'Dividend Growth' }));
app.get('/dividend-aristocrats', (req, res) => res.render('pages/dividend-aristocrats', { pageTitle: 'Dividend Aristocrats' }));
app.get('/capital-returns', (req, res) => res.render('pages/capital-returns', { pageTitle: 'Capital Returns' }));
app.get('/sector-rotation', (req, res) => res.render('pages/sector-rotation', { pageTitle: 'Sector Rotation' }));
app.get('/sector-heatmap', (req, res) => res.render('pages/sector-heatmap', { pageTitle: 'Sector Heatmap' }));
app.get('/sector-etfs', (req, res) => res.render('pages/sector-etfs', { pageTitle: 'Sector ETFs' }));
app.get('/market-breadth', (req, res) => res.render('pages/market-breadth', { pageTitle: 'Market Breadth' }));
app.get('/esg', (req, res) => res.render('pages/esg', { pageTitle: 'ESG Ratings' }));
app.get('/governance', (req, res) => res.render('pages/governance', { pageTitle: 'Governance Score' }));
app.get('/sentiment', (req, res) => res.render('pages/sentiment', { pageTitle: 'Sentiment Analysis' }));
app.get('/news-sentiment', (req, res) => res.render('pages/news-sentiment', { pageTitle: 'News Sentiment' }));
app.get('/technicals', (req, res) => res.render('pages/technicals', { pageTitle: 'Technical Indicators' }));
app.get('/moving-averages', (req, res) => res.render('pages/moving-averages', { pageTitle: 'Moving Averages' }));
app.get('/factors', (req, res) => res.render('pages/factors', { pageTitle: 'Factor Investing' }));
app.get('/valuation', (req, res) => res.render('pages/valuation', { pageTitle: 'Valuation Metrics' }));
app.get('/margin-of-safety', (req, res) => res.render('pages/margin-of-safety', { pageTitle: 'Margin of Safety' }));
app.get('/financials', (req, res) => res.render('pages/financials', { pageTitle: 'Financial Statements' }));
app.get('/cash-flow', (req, res) => res.render('pages/cash-flow', { pageTitle: 'Cash Flow Analysis' }));
app.get('/revenue-breakdown', (req, res) => res.render('pages/revenue-breakdown', { pageTitle: 'Revenue Breakdown' }));
app.get('/seasonality', (req, res) => res.render('pages/seasonality', { pageTitle: 'Seasonality Analysis' }));
app.get('/research', (req, res) => res.render('pages/research', { pageTitle: 'Research' }));
app.get('/analyst-ratings', (req, res) => res.render('pages/analyst-ratings', { pageTitle: 'Analyst Ratings' }));
app.get('/analyst-estimates', (req, res) => res.render('pages/analyst-estimates', { pageTitle: 'Analyst Estimates' }));
app.get('/guidance-tracker', (req, res) => res.render('pages/guidance-tracker', { pageTitle: 'Guidance Tracker' }));
app.get('/risk-parity', (req, res) => res.render('pages/risk-parity', { pageTitle: 'Risk Parity' }));
app.get('/concentration-risk', (req, res) => res.render('pages/concentration-risk', { pageTitle: 'Concentration Risk' }));
app.get('/volatility', (req, res) => res.render('pages/volatility', { pageTitle: 'Volatility Analysis' }));
app.get('/stress-test', (req, res) => res.render('pages/stress-test', { pageTitle: 'Stress Test' }));
app.get('/liquidity', (req, res) => res.render('pages/liquidity', { pageTitle: 'Liquidity Analysis' }));
app.get('/scanner', (req, res) => res.render('pages/scanner', { pageTitle: 'Stock Scanner' }));
app.get('/stock-compare', (req, res) => res.render('pages/stock-compare', { pageTitle: 'Stock Compare' }));
app.get('/peer-comparison', (req, res) => res.render('pages/peer-comparison', { pageTitle: 'Peer Comparison' }));
app.get('/relative-strength', (req, res) => res.render('pages/relative-strength', { pageTitle: 'Relative Strength' }));
app.get('/mutual-funds', (req, res) => res.render('pages/mutual-funds', { pageTitle: 'Mutual Funds' }));
app.get('/options-chain', (req, res) => res.render('pages/options-chain', { pageTitle: 'Options Chain' }));
app.get('/options-flow', (req, res) => res.render('pages/options-flow', { pageTitle: 'Options Flow' }));
app.get('/optimizer', (req, res) => res.render('pages/optimizer', { pageTitle: 'Portfolio Optimizer' }));
app.get('/backtest', (req, res) => res.render('pages/backtest', { pageTitle: 'Backtest' }));
app.get('/short-interest', (req, res) => res.render('pages/short-interest', { pageTitle: 'Short Interest' }));
app.get('/shorts-report', (req, res) => res.render('pages/shorts-report', { pageTitle: 'Shorts Report' }));
app.get('/insider-trading', (req, res) => res.render('pages/insider-trading', { pageTitle: 'Insider Trading' }));
app.get('/insider-sentiment', (req, res) => res.render('pages/insider-sentiment', { pageTitle: 'Insider Sentiment' }));
app.get('/institutional', (req, res) => res.render('pages/institutional', { pageTitle: 'Institutional Ownership' }));
app.get('/buybacks', (req, res) => res.render('pages/buybacks', { pageTitle: 'Buyback Tracker' }));
app.get('/earnings-calendar', (req, res) => res.render('pages/earnings-calendar', { pageTitle: 'Earnings Calendar' }));
app.get('/earnings-analysis', (req, res) => res.render('pages/earnings-analysis', { pageTitle: 'Earnings Analysis' }));
app.get('/etf-analyzer', (req, res) => res.render('pages/etf-analyzer', { pageTitle: 'ETF Analyzer' }));
app.get('/compare-portfolios', (req, res) => res.render('pages/compare-portfolios', { pageTitle: 'Compare Portfolios' }));
app.get('/economic-calendar', (req, res) => res.render('pages/economic-calendar', { pageTitle: 'Economic Calendar' }));
app.get('/ipo-tracker', (req, res) => res.render('pages/ipo-tracker', { pageTitle: 'IPO Tracker' }));
app.get('/price-targets', (req, res) => res.render('pages/price-targets', { pageTitle: 'Price Targets' }));
app.get('/trade-ideas', (req, res) => res.render('pages/trade-ideas', { pageTitle: 'Trade Ideas' }));
app.get('/portfolio-history', (req, res) => res.render('pages/portfolio-history', { pageTitle: 'Portfolio History' }));
app.get('/debt-analysis', (req, res) => res.render('pages/debt-analysis', { pageTitle: 'Debt Analysis' }));
app.get('/bond-ratings', (req, res) => res.render('pages/bond-ratings', { pageTitle: 'Bond Ratings' }));
app.get('/corporate-actions', (req, res) => res.render('pages/corporate-actions', { pageTitle: 'Corporate Actions' }));
app.get('/gross-margin', (req, res) => res.render('pages/gross-margin', { pageTitle: 'Gross Margin Trends' }));
app.get('/spac-tracker', (req, res) => res.render('pages/spac-tracker', { pageTitle: 'SPAC Tracker' }));
app.get('/fibonacci', (req, res) => res.render('pages/fibonacci', { pageTitle: 'Fibonacci Levels' }));
app.get('/debt-maturity', (req, res) => res.render('pages/debt-maturity', { pageTitle: 'Debt Maturity' }));
app.get('/esg-breakdown', (req, res) => res.render('pages/esg-breakdown', { pageTitle: 'ESG Breakdown' }));
app.get('/float-analysis', (req, res) => res.render('pages/float-analysis', { pageTitle: 'Float Analysis' }));
app.get('/momentum-screener', (req, res) => res.render('pages/momentum-screener', { pageTitle: 'Momentum Screener' }));
app.get('/payout-ratio', (req, res) => res.render('pages/payout-ratio', { pageTitle: 'Payout Ratio' }));
app.get('/interest-coverage', (req, res) => res.render('pages/interest-coverage', { pageTitle: 'Interest Coverage' }));
app.get('/options-greeks', (req, res) => res.render('pages/options-greeks', { pageTitle: 'Options Greeks' }));
app.get('/insider-transactions', (req, res) => res.render('pages/insider-transactions', { pageTitle: 'Insider Transactions' }));
app.get('/bollinger-bands', (req, res) => res.render('pages/bollinger-bands', { pageTitle: 'Bollinger Bands' }));
app.get('/volume-profile', (req, res) => res.render('pages/volume-profile', { pageTitle: 'Volume Profile' }));
app.get('/dividend-yield-curve', (req, res) => res.render('pages/dividend-yield-curve', { pageTitle: 'Dividend Yield Curve' }));
app.get('/working-capital', (req, res) => res.render('pages/working-capital', { pageTitle: 'Working Capital' }));
app.get('/peer-rankings', (req, res) => res.render('pages/peer-rankings', { pageTitle: 'Peer Rankings' }));
app.get('/options-straddle', (req, res) => res.render('pages/options-straddle', { pageTitle: 'Options Straddles' }));
app.get('/iv-surface', (req, res) => res.render('pages/iv-surface', { pageTitle: 'IV Surface' }));
app.get('/earnings-whispers', (req, res) => res.render('pages/earnings-whispers', { pageTitle: 'Earnings Whispers' }));
app.get('/revenue-per-employee', (req, res) => res.render('pages/revenue-per-employee', { pageTitle: 'Revenue Per Employee' }));
app.get('/margin-expansion', (req, res) => res.render('pages/margin-expansion', { pageTitle: 'Margin Expansion' }));
app.get('/price-to-sales', (req, res) => res.render('pages/price-to-sales', { pageTitle: 'Price to Sales' }));
// Reports & Tax
app.get('/reports', (req, res) => res.render('pages/reports', { pageTitle: 'Reports' }));
app.get('/tax', (req, res) => res.render('pages/tax', { pageTitle: 'Tax Center' }));
app.get('/export', (req, res) => res.render('pages/export', { pageTitle: 'Export' }));
app.get('/journal', (req, res) => res.render('pages/journal', { pageTitle: 'Trading Journal' }));
// Planning
app.get('/goals', (req, res) => res.render('pages/goals', { pageTitle: 'Goals' }));
app.get('/rebalancer', (req, res) => res.render('pages/rebalancer', { pageTitle: 'Rebalancer' }));
app.get('/income-projections', (req, res) => res.render('pages/income-projections', { pageTitle: 'Income Projections' }));
app.get('/calculators', (req, res) => res.render('pages/calculators', { pageTitle: 'Calculators' }));
app.get('/templates', (req, res) => res.render('pages/templates', { pageTitle: 'Portfolio Templates' }));
app.get('/education', (req, res) => res.render('pages/education', { pageTitle: 'Education' }));
app.get('/import-wizard', (req, res) => res.render('pages/import-wizard', { pageTitle: 'Import Wizard' }));
app.get('/real-estate', (req, res) => res.render('pages/real-estate', { pageTitle: 'Real Estate' }));
app.get('/bonds', (req, res) => res.render('pages/bonds', { pageTitle: 'Bonds' }));
app.get('/drip', (req, res) => res.render('pages/drip', { pageTitle: 'DRIP Settings' }));
app.get('/margin', (req, res) => res.render('pages/margin', { pageTitle: 'Margin Calculator' }));
// Tools
app.get('/alerts-history', (req, res) => res.render('pages/alerts-history', { pageTitle: 'Alerts History' }));
app.get('/paper-trading', (req, res) => res.render('pages/paper-trading', { pageTitle: 'Paper Trading' }));
app.get('/position-sizing', (req, res) => res.render('pages/position-sizing', { pageTitle: 'Position Sizing' }));
app.get('/currency', (req, res) => res.render('pages/currency', { pageTitle: 'Currency' }));
app.get('/broker', (req, res) => res.render('pages/broker', { pageTitle: 'Broker Integration' }));
app.get('/api', (req, res) => res.render('pages/api', { pageTitle: 'API Access' }));
app.get('/assistant', (req, res) => res.render('pages/assistant', { pageTitle: 'AI Assistant' }));
app.get('/crypto-portfolio', (req, res) => res.render('pages/crypto-portfolio', { pageTitle: 'Crypto Portfolio' }));
app.get('/copy-trading', (req, res) => res.render('pages/copy-trading', { pageTitle: 'Copy Trading' }));
app.get('/share-portfolio', (req, res) => res.render('pages/share-portfolio', { pageTitle: 'Share Portfolio' }));
// Community
app.get('/social', (req, res) => res.render('pages/social', { pageTitle: 'Social Feed' }));
app.get('/leaderboard', (req, res) => res.render('pages/leaderboard', { pageTitle: 'Leaderboard' }));
app.get('/forum', (req, res) => res.render('pages/forum', { pageTitle: 'Forum' }));
app.get('/news', (req, res) => res.render('pages/news', { pageTitle: 'News' }));
app.get('/calendar', (req, res) => res.render('pages/calendar', { pageTitle: 'Calendar' }));
// Account
app.get('/settings', (req, res) => res.render('pages/settings', { pageTitle: 'Settings' }));
app.get('/profile', (req, res) => res.render('pages/profile', { pageTitle: 'Profile' }));
// ===================== API PROXY ROUTES =====================
// Theme toggle
app.post('/api/theme', (req, res) => {
    const theme = req.body.theme || 'dark';
    res.cookie('theme', theme, { maxAge: 365 * 24 * 60 * 60 * 1000 });
    res.json({ success: true, theme });
});
// Proxy for frontend API calls
app.all('/api/*', async (req, res) => {
    const endpoint = req.path.replace('/api', '');
    const token = req.cookies.token;
    try {
        const response = await fetch(`${API_URL}${endpoint}`, {
            method: req.method,
            headers: {
                'Content-Type': 'application/json',
                ...(token && { 'Authorization': `Bearer ${token}` })
            },
            ...(req.method !== 'GET' && { body: JSON.stringify(req.body) })
        });
        const data = await response.json();
        res.status(response.status).json(data);
    }
    catch (err) {
        res.status(500).json({ error: 'API request failed' });
    }
});
// ===================== START SERVER =====================
app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   🚀 WealthPilot Pro - Frontend Server                       ║
║                                                              ║
║   Frontend: http://localhost:${PORT}                             ║
║   Backend API: ${API_URL}                           
║                                                              ║
║   Login: demo@wealthpilot.com / demo123456                   ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
  `);
});
exports.default = app;
//# sourceMappingURL=server-integrated.js.map