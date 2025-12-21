import express from 'express';
import path from 'path';
import cookieParser from 'cookie-parser';

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));
app.use(express.static(path.join(__dirname, '../public')));
app.use(express.json());
app.use(cookieParser());

app.use((req, res, next) => { res.locals.theme = req.cookies.theme || 'dark'; next(); });

// Dashboard (6)
app.get('/', (req, res) => res.render('pages/dashboard', { pageTitle: 'Dashboard' }));
app.get('/portfolio', (req, res) => res.render('pages/portfolio', { pageTitle: 'Portfolio' }));
app.get('/holdings', (req, res) => res.render('pages/holdings', { pageTitle: 'Holdings' }));
app.get('/transactions', (req, res) => res.render('pages/transactions', { pageTitle: 'Transactions' }));
app.get('/watchlist', (req, res) => res.render('pages/watchlist', { pageTitle: 'Watchlist' }));
app.get('/snapshot', (req, res) => res.render('pages/snapshot', { pageTitle: 'Daily Snapshot' }));

// Analysis (69)
app.get('/analytics', (req, res) => res.render('pages/analytics', { pageTitle: 'Analytics' }));
app.get('/performance', (req, res) => res.render('pages/performance', { pageTitle: 'Performance' }));
app.get('/attribution', (req, res) => res.render('pages/attribution', { pageTitle: 'Attribution' }));
app.get('/dividends', (req, res) => res.render('pages/dividends', { pageTitle: 'Dividends' }));
app.get('/dividend-screener', (req, res) => res.render('pages/dividend-screener', { pageTitle: 'Dividend Screener' }));
app.get('/dividend-calendar', (req, res) => res.render('pages/dividend-calendar', { pageTitle: 'Dividend Calendar' }));
app.get('/dividend-growth', (req, res) => res.render('pages/dividend-growth', { pageTitle: 'Dividend Growth' }));
app.get('/dividend-aristocrats', (req, res) => res.render('pages/dividend-aristocrats', { pageTitle: 'Dividend Aristocrats' }));
app.get('/capital-returns', (req, res) => res.render('pages/capital-returns', { pageTitle: 'Capital Returns' }));
app.get('/sectors', (req, res) => res.render('pages/sectors', { pageTitle: 'Sectors' }));
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
app.get('/correlation', (req, res) => res.render('pages/correlation', { pageTitle: 'Correlation Matrix' }));
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
app.get('/risk', (req, res) => res.render('pages/risk', { pageTitle: 'Risk Analysis' }));
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

// V23 Routes
app.get('/gross-margin', (req, res) => res.render('pages/gross-margin', { pageTitle: 'Gross Margin Trends' }));
app.get('/spac-tracker', (req, res) => res.render('pages/spac-tracker', { pageTitle: 'SPAC Tracker' }));
app.get('/fibonacci', (req, res) => res.render('pages/fibonacci', { pageTitle: 'Fibonacci Levels' }));
app.get('/debt-maturity', (req, res) => res.render('pages/debt-maturity', { pageTitle: 'Debt Maturity' }));
app.get('/esg-breakdown', (req, res) => res.render('pages/esg-breakdown', { pageTitle: 'ESG Breakdown' }));

// V24 Routes
app.get('/float-analysis', (req, res) => res.render('pages/float-analysis', { pageTitle: 'Float Analysis' }));
app.get('/momentum-screener', (req, res) => res.render('pages/momentum-screener', { pageTitle: 'Momentum Screener' }));
app.get('/payout-ratio', (req, res) => res.render('pages/payout-ratio', { pageTitle: 'Payout Ratio' }));
app.get('/interest-coverage', (req, res) => res.render('pages/interest-coverage', { pageTitle: 'Interest Coverage' }));
app.get('/options-greeks', (req, res) => res.render('pages/options-greeks', { pageTitle: 'Options Greeks' }));
app.get('/insider-transactions', (req, res) => res.render('pages/insider-transactions', { pageTitle: 'Insider Transactions' }));

// V25 Routes
app.get('/bollinger-bands', (req, res) => res.render('pages/bollinger-bands', { pageTitle: 'Bollinger Bands' }));
app.get('/volume-profile', (req, res) => res.render('pages/volume-profile', { pageTitle: 'Volume Profile' }));
app.get('/dividend-yield-curve', (req, res) => res.render('pages/dividend-yield-curve', { pageTitle: 'Dividend Yield Curve' }));
app.get('/working-capital', (req, res) => res.render('pages/working-capital', { pageTitle: 'Working Capital' }));
app.get('/peer-rankings', (req, res) => res.render('pages/peer-rankings', { pageTitle: 'Peer Rankings' }));
app.get('/options-straddle', (req, res) => res.render('pages/options-straddle', { pageTitle: 'Options Straddles' }));

// V26 Routes
app.get('/iv-surface', (req, res) => res.render('pages/iv-surface', { pageTitle: 'IV Surface' }));
app.get('/earnings-whispers', (req, res) => res.render('pages/earnings-whispers', { pageTitle: 'Earnings Whispers' }));
app.get('/revenue-per-employee', (req, res) => res.render('pages/revenue-per-employee', { pageTitle: 'Revenue Per Employee' }));
app.get('/margin-expansion', (req, res) => res.render('pages/margin-expansion', { pageTitle: 'Margin Expansion' }));
app.get('/price-to-sales', (req, res) => res.render('pages/price-to-sales', { pageTitle: 'Price to Sales' }));
app.get('/tax-lots', (req, res) => res.render('pages/tax-lots', { pageTitle: 'Tax Lots' }));

// Reports & Tax (4)
app.get('/reports', (req, res) => res.render('pages/reports', { pageTitle: 'Reports' }));
app.get('/tax', (req, res) => res.render('pages/tax', { pageTitle: 'Tax Center' }));
app.get('/export', (req, res) => res.render('pages/export', { pageTitle: 'Export' }));
app.get('/journal', (req, res) => res.render('pages/journal', { pageTitle: 'Trading Journal' }));

// Planning (12)
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

// Tools (12)
app.get('/alerts', (req, res) => res.render('pages/alerts', { pageTitle: 'Alerts' }));
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

// Community (5)
app.get('/social', (req, res) => res.render('pages/social', { pageTitle: 'Social Feed' }));
app.get('/leaderboard', (req, res) => res.render('pages/leaderboard', { pageTitle: 'Leaderboard' }));
app.get('/forum', (req, res) => res.render('pages/forum', { pageTitle: 'Forum' }));
app.get('/news', (req, res) => res.render('pages/news', { pageTitle: 'News' }));
app.get('/calendar', (req, res) => res.render('pages/calendar', { pageTitle: 'Calendar' }));

// Account (2)
app.get('/settings', (req, res) => res.render('pages/settings', { pageTitle: 'Settings' }));
app.get('/profile', (req, res) => res.render('pages/profile', { pageTitle: 'Profile' }));

// Auth Pages
app.get('/login', (req, res) => res.render('pages/login', { pageTitle: 'Login' }));
app.get('/register', (req, res) => res.render('pages/register', { pageTitle: 'Register' }));
app.get('/logout', (req, res) => { res.clearCookie('wealthpilot_token'); res.redirect('/login'); });
app.get('/dashboard', (req, res) => res.render('pages/dashboard', { pageTitle: 'Dashboard' }));

// API
app.post('/api/theme', (req, res) => {
  const theme = req.body.theme || 'dark';
  res.cookie('theme', theme, { maxAge: 365 * 24 * 60 * 60 * 1000 });
  res.json({ success: true, theme });
});

app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   🚀 WealthPilot Pro V26 - READY                             ║
║                                                              ║
║   V26: IV Surface, Earnings Whispers, Rev/Employee,          ║
║        Margin Expansion, Price to Sales, Tax Lots            ║
║                                                              ║
║   Server: http://localhost:${PORT}                              ║
║   137 Dashboard Pages | Full Feature Set                     ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
  `);
});

export default app;
