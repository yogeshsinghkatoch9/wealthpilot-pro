/**
 * WealthPilot Pro - Comprehensive Feature Routes
 * All end-to-end functionality for Reports, Tax, Goals, Trading, Social, etc.
 */

const express = require('express');
const logger = require('../utils/logger');
const router = express.Router();
const Database = require('../db/database');
const { v4: uuidv4 } = require('uuid');
const liveDataService = require('../services/liveDataService');
const { authenticate } = require('../middleware/auth');

// Apply authentication to all routes
router.use(authenticate);

// ==================== ALERTS ====================

router.get('/alerts', (req, res) => {
  try {
    const alerts = Database.getAlertsByUser(req.user.id);
    res.json(alerts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/alerts/active', (req, res) => {
  try {
    const alerts = Database.getActiveAlerts(req.user.id);
    res.json(alerts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/alerts', (req, res) => {
  try {
    const { symbol, alertType, condition, targetValue, message } = req.body;
    const alert = Database.createAlert(req.user.id, symbol, alertType, condition, targetValue, message);
    res.status(201).json(alert);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/alerts/:id', (req, res) => {
  try {
    const alert = Database.updateAlert(req.params.id, req.body);
    res.json(alert);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/alerts/:id', (req, res) => {
  try {
    Database.deleteAlert(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/alerts/history', (req, res) => {
  try {
    const history = Database.getAlertHistory(req.user.id, parseInt(req.query.limit) || 50);
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== GOALS ====================

router.get('/goals', (req, res) => {
  try {
    const goals = Database.getGoalsByUser(req.user.id);
    // Calculate progress for each goal
    const goalsWithProgress = goals.map(goal => ({
      ...goal,
      progress: goal.target_amount > 0 ? (goal.current_amount / goal.target_amount * 100).toFixed(1) : 0,
      daysRemaining: goal.target_date ? Math.max(0, Math.ceil((new Date(goal.target_date) - new Date()) / (1000 * 60 * 60 * 24))) : null
    }));
    res.json(goalsWithProgress);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/goals', (req, res) => {
  try {
    const { name, targetAmount, targetDate, category, priority, notes } = req.body;
    const goal = Database.createGoal(req.user.id, name, targetAmount, targetDate, category, priority, notes);
    res.status(201).json(goal);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/goals/:id', (req, res) => {
  try {
    const goal = Database.updateGoal(req.params.id, req.body);
    res.json(goal);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/goals/:id', (req, res) => {
  try {
    Database.deleteGoal(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== JOURNAL ====================

router.get('/journal', (req, res) => {
  try {
    const entries = Database.getJournalEntries(req.user.id, parseInt(req.query.limit) || 50);
    res.json(entries);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/journal/stats', (req, res) => {
  try {
    const stats = Database.getJournalStats(req.user.id);
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/journal', (req, res) => {
  try {
    const entry = Database.createJournalEntry(req.user.id, req.body);
    res.status(201).json(entry);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/journal/:id', (req, res) => {
  try {
    const entry = Database.updateJournalEntry(req.params.id, req.body);
    res.json(entry);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/journal/:id', (req, res) => {
  try {
    Database.deleteJournalEntry(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== TAX ====================

router.get('/tax/documents', (req, res) => {
  try {
    const year = req.query.year ? parseInt(req.query.year) : null;
    const documents = Database.getTaxDocuments(req.user.id, year);
    res.json(documents);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/tax/lots', (req, res) => {
  try {
    const lots = Database.getTaxLots(req.user.id, req.query.portfolioId);
    res.json(lots);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/tax/summary', (req, res) => {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const transactions = Database.getTransactionsByUser(req.user.id, 1000);

    // Filter by year and calculate gains/losses
    const yearTransactions = transactions.filter(t => {
      const txYear = new Date(t.executed_at).getFullYear();
      return txYear === year;
    });

    const sells = yearTransactions.filter(t => t.type === 'sell');
    let shortTermGains = 0;
    const longTermGains = 0;
    let dividends = 0;

    yearTransactions.forEach(t => {
      if (t.type === 'dividend') {
        dividends += t.amount || 0;
      }
    });

    // Simplified gain calculation
    sells.forEach(s => {
      const gain = (s.price - (s.avg_cost || s.price * 0.9)) * s.shares;
      shortTermGains += gain; // Simplified - would need holding period analysis
    });

    res.json({
      year,
      shortTermGains,
      longTermGains,
      totalGains: shortTermGains + longTermGains,
      dividendIncome: dividends,
      estimatedTax: (shortTermGains * 0.22 + longTermGains * 0.15 + dividends * 0.15).toFixed(2),
      transactionCount: yearTransactions.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== REAL ESTATE ====================

router.get('/real-estate', (req, res) => {
  try {
    const properties = Database.getRealEstateByUser(req.user.id);
    const enriched = properties.map(p => ({
      ...p,
      equity: p.current_value - p.mortgage_balance,
      annualIncome: (p.monthly_rent - p.expenses) * 12,
      capRate: p.current_value > 0 ? (((p.monthly_rent - p.expenses) * 12) / p.current_value * 100).toFixed(2) : 0,
      appreciation: p.purchase_price > 0 ? ((p.current_value - p.purchase_price) / p.purchase_price * 100).toFixed(2) : 0
    }));

    const totals = enriched.reduce((acc, p) => ({
      totalValue: acc.totalValue + (p.current_value || 0),
      totalEquity: acc.totalEquity + (p.equity || 0),
      totalIncome: acc.totalIncome + (p.annualIncome || 0),
      totalMortgage: acc.totalMortgage + (p.mortgage_balance || 0)
    }), { totalValue: 0, totalEquity: 0, totalIncome: 0, totalMortgage: 0 });

    res.json({ properties: enriched, totals });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/real-estate', (req, res) => {
  try {
    const property = Database.createRealEstate(req.user.id, req.body);
    res.status(201).json(property);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/real-estate/:id', (req, res) => {
  try {
    const property = Database.updateRealEstate(req.params.id, req.body);
    res.json(property);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/real-estate/:id', (req, res) => {
  try {
    Database.deleteRealEstate(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== BONDS ====================

router.get('/bonds', (req, res) => {
  try {
    const bonds = Database.getBondsByUser(req.user.id);
    const enriched = bonds.map(b => {
      const yearsToMaturity = Math.max(0, (new Date(b.maturity_date) - new Date()) / (1000 * 60 * 60 * 24 * 365));
      const annualIncome = b.face_value * (b.coupon_rate / 100);
      return {
        ...b,
        yearsToMaturity: yearsToMaturity.toFixed(1),
        annualIncome,
        currentYield: b.purchase_price > 0 ? (annualIncome / b.purchase_price * 100).toFixed(2) : 0
      };
    });

    const totals = enriched.reduce((acc, b) => ({
      totalFaceValue: acc.totalFaceValue + (b.face_value || 0),
      totalPurchasePrice: acc.totalPurchasePrice + (b.purchase_price || 0),
      totalAnnualIncome: acc.totalAnnualIncome + (b.annualIncome || 0)
    }), { totalFaceValue: 0, totalPurchasePrice: 0, totalAnnualIncome: 0 });

    res.json({ bonds: enriched, totals });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/bonds', (req, res) => {
  try {
    const bond = Database.createBond(req.user.id, req.body.portfolioId, req.body);
    res.status(201).json(bond);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/bonds/:id', (req, res) => {
  try {
    const bond = Database.updateBond(req.params.id, req.body);
    res.json(bond);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/bonds/:id', (req, res) => {
  try {
    Database.deleteBond(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== DRIP ====================

router.get('/drip', (req, res) => {
  try {
    const settings = Database.getDripSettings(req.user.id, req.query.portfolioId);
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/drip', (req, res) => {
  try {
    const { portfolioId, symbol, isEnabled, reinvestPercent } = req.body;
    const setting = Database.setDripSetting(req.user.id, portfolioId, symbol, isEnabled, reinvestPercent);
    res.json(setting);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== PAPER TRADING ====================

router.get('/paper-trading/portfolio', async (req, res) => {
  try {
    const portfolio = await Database.getPaperPortfolio(req.user.id);
    const openTrades = await Database.getPaperTrades(req.user.id, 'open');
    const closedTrades = await Database.getPaperTrades(req.user.id, 'closed');

    const totalPL = closedTrades.reduce((sum, t) => sum + (t.profit_loss || 0), 0);
    const wins = closedTrades.filter(t => t.profit_loss > 0).length;
    const losses = closedTrades.filter(t => t.profit_loss < 0).length;

    res.json({
      portfolio,
      openTrades,
      stats: {
        totalTrades: closedTrades.length,
        wins,
        losses,
        winRate: closedTrades.length > 0 ? (wins / closedTrades.length * 100).toFixed(1) : 0,
        totalProfitLoss: totalPL
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/paper-trading/trades', async (req, res) => {
  try {
    const trades = await Database.getPaperTrades(req.user.id, req.query.status);
    res.json(trades);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/paper-trading/trade', async (req, res) => {
  try {
    const { symbol, tradeType, quantity, entryPrice, notes } = req.body;
    const trade = await Database.createPaperTrade(req.user.id, symbol, tradeType, quantity, entryPrice, notes);

    // Update paper portfolio balance
    const cost = quantity * entryPrice;
    if (tradeType === 'buy') {
      await Database.updatePaperPortfolioBalance(req.user.id, -cost);
    }

    res.status(201).json(trade);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/paper-trading/close/:id', async (req, res) => {
  try {
    const { exitPrice } = req.body;
    const trade = await Database.closePaperTrade(req.params.id, exitPrice);

    // Update paper portfolio balance
    if (trade) {
      const proceeds = trade.quantity * exitPrice;
      if (trade.trade_type === 'buy') {
        await Database.updatePaperPortfolioBalance(req.user.id, proceeds);
      }
    }

    res.json(trade);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/paper-trading/reset', async (req, res) => {
  try {
    await Database.resetPaperPortfolio(req.user.id);
    res.json({ success: true, message: 'Paper trading account reset to $100,000' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== CRYPTO ====================

router.get('/crypto', async (req, res) => {
  try {
    const holdings = Database.getCryptoHoldings(req.user.id);

    // Fetch LIVE crypto prices from CoinGecko API
    const symbols = holdings.map(h => h.symbol);
    const livePrices = await liveDataService.getCryptoPrices(symbols);

    const enriched = holdings.map(h => {
      const liveData = livePrices[h.symbol];
      const currentPrice = liveData ? liveData.price : h.avg_cost;

      return {
        ...h,
        currentPrice,
        marketValue: h.quantity * currentPrice,
        gain: 0,
        gainPct: 0,
        change24h: liveData?.change24h || 0,
        dataSource: liveData?.source || 'No live data'
      };
    });

    enriched.forEach(h => {
      h.marketValue = h.quantity * h.currentPrice;
      h.gain = h.marketValue - (h.quantity * h.avg_cost);
      h.gainPct = h.avg_cost > 0 ? (h.gain / (h.quantity * h.avg_cost) * 100) : 0;
    });

    const totals = enriched.reduce((acc, h) => ({
      totalValue: acc.totalValue + h.marketValue,
      totalCost: acc.totalCost + (h.quantity * h.avg_cost),
      totalGain: acc.totalGain + h.gain
    }), { totalValue: 0, totalCost: 0, totalGain: 0 });

    res.json({ holdings: enriched, totals });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/crypto', (req, res) => {
  try {
    const { symbol, name, quantity, avgCost, exchange, walletAddress } = req.body;
    const holding = Database.createCryptoHolding(req.user.id, symbol, name, quantity, avgCost, exchange, walletAddress);
    res.status(201).json(holding);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/crypto/:id', (req, res) => {
  try {
    const holding = Database.updateCryptoHolding(req.params.id, req.body);
    res.json(holding);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/crypto/:id', (req, res) => {
  try {
    Database.deleteCryptoHolding(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== BROKER ====================

router.get('/broker/connections', (req, res) => {
  try {
    const connections = Database.getBrokerConnections(req.user.id);
    res.json(connections);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/broker/connect', (req, res) => {
  try {
    const { brokerName, accountId, accessToken, refreshToken } = req.body;
    const connection = Database.createBrokerConnection(req.user.id, brokerName, accountId, accessToken, refreshToken);
    res.status(201).json(connection);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/broker/connections/:id', (req, res) => {
  try {
    Database.deleteBrokerConnection(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/broker/supported', (req, res) => {
  res.json({
    brokers: [
      { id: 'tdameritrade', name: 'TD Ameritrade', status: 'available' },
      { id: 'schwab', name: 'Charles Schwab', status: 'available' },
      { id: 'fidelity', name: 'Fidelity', status: 'available' },
      { id: 'etrade', name: 'E*TRADE', status: 'available' },
      { id: 'robinhood', name: 'Robinhood', status: 'coming_soon' },
      { id: 'interactive', name: 'Interactive Brokers', status: 'available' },
      { id: 'webull', name: 'Webull', status: 'coming_soon' }
    ]
  });
});

// ==================== API KEYS ====================

router.get('/api-keys', (req, res) => {
  try {
    const keys = Database.getUserApiKeys(req.user.id);
    // Mask the API keys
    const maskedKeys = keys.map(k => ({
      ...k,
      api_key: k.api_key.substring(0, 10) + '...' + k.api_key.substring(k.api_key.length - 4)
    }));
    res.json(maskedKeys);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api-keys', (req, res) => {
  try {
    const { name, permissions } = req.body;
    const key = Database.createUserApiKey(req.user.id, name, permissions || ['read']);
    res.status(201).json(key);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/api-keys/:id', (req, res) => {
  try {
    Database.deleteUserApiKey(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== AI CHAT ====================

router.get('/chat/history', (req, res) => {
  try {
    const history = Database.getAiChatHistory(req.user.id, req.query.sessionId, parseInt(req.query.limit) || 50);
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/chat/message', async (req, res) => {
  try {
    const { sessionId, message } = req.body;
    const chatSessionId = sessionId || uuidv4();

    // Save user message
    Database.addAiChatMessage(req.user.id, chatSessionId, 'user', message);

    // Generate AI response (using OpenAI if available)
    let aiResponse = "I'm your AI investment assistant. I can help you with portfolio analysis, market research, and investment strategies. What would you like to know?";

    // Try to use OpenAI for real response
    if (process.env.OPENAI_API_KEY) {
      try {
        const OpenAI = require('openai');
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

        const completion = await openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: [
            { role: 'system', content: 'You are a helpful investment assistant for WealthPilot Pro. Provide concise, actionable investment advice. Always remind users that this is not financial advice and they should consult a professional.' },
            { role: 'user', content: message }
          ],
          max_tokens: 500
        });

        aiResponse = completion.choices[0].message.content;
      } catch (aiErr) {
        logger.error('OpenAI error:', aiErr.message);
      }
    }

    // Save AI response
    Database.addAiChatMessage(req.user.id, chatSessionId, 'assistant', aiResponse);

    res.json({
      sessionId: chatSessionId,
      response: aiResponse
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== COPY TRADING ====================

router.get('/copy-trading/traders', (req, res) => {
  try {
    const myTraders = Database.getCopyTraders(req.user.id);

    // Get available traders from leaderboard
    const topTraders = Database.getLeaderboard(20).map(t => ({
      id: t.user_id,
      name: t.display_name,
      totalReturn: t.total_return,
      monthlyReturn: t.monthly_return,
      winRate: t.win_rate,
      totalTrades: t.total_trades,
      rank: t.rank,
      badge: t.badge
    }));

    res.json({
      following: myTraders,
      availableTraders: topTraders
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/copy-trading/follow', (req, res) => {
  try {
    const { traderId, traderName, allocationPercent } = req.body;
    const trader = Database.addCopyTrader(req.user.id, traderId, traderName, allocationPercent);
    res.status(201).json(trader);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/copy-trading/:id', (req, res) => {
  try {
    const trader = Database.updateCopyTrader(req.params.id, req.body);
    res.json(trader);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/copy-trading/:id', (req, res) => {
  try {
    Database.deleteCopyTrader(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== SOCIAL ====================

router.get('/social/feed', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const posts = Database.getSocialFeed(limit, offset);
    res.json(posts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/social/posts', (req, res) => {
  try {
    const posts = Database.getUserPosts(req.user.id, parseInt(req.query.limit) || 20);
    res.json(posts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/social/posts', (req, res) => {
  try {
    const { content, tradeSymbol, tradeType } = req.body;
    const post = Database.createSocialPost(req.user.id, content, tradeSymbol, tradeType);
    res.status(201).json(post);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/social/posts/:id', (req, res) => {
  try {
    Database.deleteSocialPost(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/social/posts/:id/comments', (req, res) => {
  try {
    const comments = Database.getPostComments(req.params.id);
    res.json(comments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/social/posts/:id/comments', (req, res) => {
  try {
    const comment = Database.addComment(req.params.id, req.user.id, req.body.content);
    res.status(201).json(comment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/social/posts/:id/like', (req, res) => {
  try {
    const post = Database.likePost(req.params.id);
    res.json(post);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/social/follow/:userId', (req, res) => {
  try {
    Database.followUser(req.user.id, req.params.userId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/social/follow/:userId', (req, res) => {
  try {
    Database.unfollowUser(req.user.id, req.params.userId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/social/followers', (req, res) => {
  try {
    const followers = Database.getFollowers(req.user.id);
    res.json(followers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/social/following', (req, res) => {
  try {
    const following = Database.getFollowing(req.user.id);
    res.json(following);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== LEADERBOARD ====================

router.get('/leaderboard', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const leaderboard = Database.getLeaderboard(limit);
    res.json(leaderboard);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/leaderboard/join', (req, res) => {
  try {
    const { displayName } = req.body;
    const journalStats = Database.getJournalStats(req.user.id);

    const entry = Database.updateLeaderboardEntry(req.user.id, displayName, {
      totalReturn: journalStats.totalProfitLoss,
      monthlyReturn: journalStats.avgProfitLoss,
      winRate: journalStats.winRate,
      totalTrades: journalStats.totalTrades
    });

    res.json(entry);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== FORUM ====================

router.get('/forum/categories', (req, res) => {
  try {
    const categories = Database.getForumCategories();
    res.json(categories);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/forum/posts', (req, res) => {
  try {
    const posts = Database.getForumPosts(req.query.categoryId, parseInt(req.query.limit) || 50);
    res.json(posts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/forum/posts/:id', (req, res) => {
  try {
    const post = Database.getForumPost(req.params.id);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    const replies = Database.getForumReplies(req.params.id);
    res.json({ post, replies });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/forum/posts', (req, res) => {
  try {
    const { categoryId, title, content } = req.body;
    const post = Database.createForumPost(categoryId, req.user.id, title, content);
    res.status(201).json(post);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/forum/posts/:id/reply', (req, res) => {
  try {
    const reply = Database.addForumReply(req.params.id, req.user.id, req.body.content);
    res.status(201).json(reply);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== CALENDAR ====================

router.get('/calendar/events', (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const events = Database.getCalendarEvents(req.user.id, startDate, endDate);
    res.json(events);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/calendar/events', (req, res) => {
  try {
    const { title, description, eventType, eventDate, symbol, reminder } = req.body;
    const event = Database.createCalendarEvent(req.user.id, title, description, eventType, eventDate, symbol, reminder);
    res.status(201).json(event);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/calendar/events/:id', (req, res) => {
  try {
    const event = Database.updateCalendarEvent(req.params.id, req.body);
    res.json(event);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/calendar/events/:id', (req, res) => {
  try {
    Database.deleteCalendarEvent(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== SHARE PORTFOLIO ====================

router.post('/share/portfolio/:portfolioId', (req, res) => {
  try {
    const { isPublic } = req.body;
    const shared = Database.sharePortfolio(req.params.portfolioId, req.user.id, isPublic);
    res.json(shared);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/share/:shareCode', (req, res) => {
  try {
    const portfolio = Database.getSharedPortfolio(req.params.shareCode);
    if (!portfolio) {
      return res.status(404).json({ error: 'Shared portfolio not found' });
    }
    res.json(portfolio);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/share/portfolio/:portfolioId', (req, res) => {
  try {
    Database.unsharePortfolio(req.params.portfolioId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== SETTINGS ====================

router.get('/settings', (req, res) => {
  try {
    const user = Database.getUserById(req.user.id);
    const settings = Database.getUserSettings(req.user.id);
    res.json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        theme: user.theme,
        currency: user.currency,
        timezone: user.timezone,
        plan: user.plan
      },
      settings
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/settings', (req, res) => {
  try {
    const { user: userUpdates, settings: settingsUpdates } = req.body;

    if (userUpdates) {
      Database.updateUser(req.user.id, userUpdates);
    }

    if (settingsUpdates) {
      Database.updateUserSettings(req.user.id, settingsUpdates);
    }

    const user = Database.getUserById(req.user.id);
    const settings = Database.getUserSettings(req.user.id);

    res.json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        theme: user.theme,
        currency: user.currency,
        timezone: user.timezone,
        plan: user.plan
      },
      settings
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== REPORTS ====================

router.get('/reports', (req, res) => {
  try {
    const reports = Database.getGeneratedReports(req.user.id, parseInt(req.query.limit) || 20);
    res.json(reports);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/reports/generate', (req, res) => {
  try {
    const { reportType, reportName, parameters } = req.body;
    // In production, this would generate actual report files
    const report = Database.createGeneratedReport(
      req.user.id,
      reportType,
      reportName,
      parameters,
      `/reports/${req.user.id}/${Date.now()}_${reportType}.pdf`
    );
    res.status(201).json(report);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== TEMPLATES ====================

router.get('/templates', (req, res) => {
  try {
    const templates = Database.getPortfolioTemplates();
    res.json(templates);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/templates/:id', (req, res) => {
  try {
    const template = Database.getTemplateById(req.params.id);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    res.json(template);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/templates/:id/use', (req, res) => {
  try {
    const template = Database.useTemplate(req.params.id);
    res.json(template);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== EDUCATION ====================

router.get('/education/courses', (req, res) => {
  try {
    // Static course data - in production would be from database
    const courses = [
      {
        id: 'basics',
        title: 'Investment Basics',
        description: 'Learn the fundamentals of investing',
        lessons: [
          { id: 'intro', title: 'Introduction to Investing', duration: '15 min' },
          { id: 'stocks', title: 'Understanding Stocks', duration: '20 min' },
          { id: 'bonds', title: 'Bond Investing', duration: '18 min' },
          { id: 'etfs', title: 'ETFs and Index Funds', duration: '22 min' },
          { id: 'risk', title: 'Risk Management', duration: '25 min' }
        ],
        level: 'Beginner'
      },
      {
        id: 'technical',
        title: 'Technical Analysis',
        description: 'Master chart patterns and indicators',
        lessons: [
          { id: 'charts', title: 'Reading Charts', duration: '20 min' },
          { id: 'patterns', title: 'Chart Patterns', duration: '30 min' },
          { id: 'indicators', title: 'Technical Indicators', duration: '35 min' },
          { id: 'trends', title: 'Trend Analysis', duration: '25 min' }
        ],
        level: 'Intermediate'
      },
      {
        id: 'options',
        title: 'Options Trading',
        description: 'Advanced options strategies',
        lessons: [
          { id: 'basics', title: 'Options Fundamentals', duration: '25 min' },
          { id: 'calls', title: 'Call Options', duration: '30 min' },
          { id: 'puts', title: 'Put Options', duration: '30 min' },
          { id: 'spreads', title: 'Options Spreads', duration: '40 min' },
          { id: 'greeks', title: 'The Greeks', duration: '35 min' }
        ],
        level: 'Advanced'
      },
      {
        id: 'dividends',
        title: 'Dividend Investing',
        description: 'Build passive income through dividends',
        lessons: [
          { id: 'intro', title: 'Dividend Basics', duration: '15 min' },
          { id: 'yield', title: 'Understanding Yield', duration: '20 min' },
          { id: 'aristocrats', title: 'Dividend Aristocrats', duration: '25 min' },
          { id: 'drip', title: 'DRIP Investing', duration: '20 min' },
          { id: 'portfolio', title: 'Building a Dividend Portfolio', duration: '30 min' }
        ],
        level: 'Beginner'
      }
    ];

    const progress = Database.getEducationProgress(req.user.id);

    // Add progress to courses
    const coursesWithProgress = courses.map(course => {
      const courseProgress = progress.filter(p => p.course_id === course.id);
      const completedLessons = courseProgress.filter(p => p.completed).length;
      return {
        ...course,
        progress: (completedLessons / course.lessons.length * 100).toFixed(0),
        completedLessons
      };
    });

    res.json(coursesWithProgress);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/education/progress', (req, res) => {
  try {
    const progress = Database.getEducationProgress(req.user.id);
    res.json(progress);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/education/progress', (req, res) => {
  try {
    const { courseId, lessonId, completed, score } = req.body;
    const progress = Database.updateEducationProgress(req.user.id, courseId, lessonId, completed, score);
    res.json(progress);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== CALCULATORS ====================

router.post('/calculators/compound', (req, res) => {
  try {
    const { principal, rate, years, contribution, frequency } = req.body;

    const monthlyRate = rate / 100 / 12;
    const months = years * 12;
    const monthlyContribution = frequency === 'monthly' ? contribution : contribution / 12;

    let balance = principal;
    const projections = [];

    for (let month = 1; month <= months; month++) {
      balance = balance * (1 + monthlyRate) + monthlyContribution;
      if (month % 12 === 0) {
        projections.push({
          year: month / 12,
          balance: balance.toFixed(2),
          contributions: principal + (monthlyContribution * month),
          earnings: (balance - principal - (monthlyContribution * month)).toFixed(2)
        });
      }
    }

    res.json({
      finalBalance: balance.toFixed(2),
      totalContributions: (principal + monthlyContribution * months).toFixed(2),
      totalEarnings: (balance - principal - monthlyContribution * months).toFixed(2),
      projections
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/calculators/retirement', (req, res) => {
  try {
    const { currentAge, retirementAge, currentSavings, monthlyContribution, expectedReturn, retirementIncome } = req.body;

    const years = retirementAge - currentAge;
    const monthlyRate = expectedReturn / 100 / 12;
    const months = years * 12;

    let balance = currentSavings;
    for (let i = 0; i < months; i++) {
      balance = balance * (1 + monthlyRate) + monthlyContribution;
    }

    // Calculate how long savings will last
    const withdrawalRate = 0.04; // 4% rule
    const annualWithdrawal = balance * withdrawalRate;
    const monthlyWithdrawal = annualWithdrawal / 12;

    res.json({
      projectedSavings: balance.toFixed(2),
      annualIncome: annualWithdrawal.toFixed(2),
      monthlyIncome: monthlyWithdrawal.toFixed(2),
      yearsOfIncome: (balance / (retirementIncome * 12)).toFixed(1),
      onTrack: monthlyWithdrawal >= retirementIncome
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/calculators/position-size', (req, res) => {
  try {
    const { accountSize, riskPercent, entryPrice, stopLoss } = req.body;

    const riskAmount = accountSize * (riskPercent / 100);
    const riskPerShare = Math.abs(entryPrice - stopLoss);
    const shares = Math.floor(riskAmount / riskPerShare);
    const positionSize = shares * entryPrice;

    res.json({
      shares,
      positionSize: positionSize.toFixed(2),
      riskAmount: riskAmount.toFixed(2),
      riskPerShare: riskPerShare.toFixed(2),
      percentOfAccount: ((positionSize / accountSize) * 100).toFixed(2)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/calculators/margin', (req, res) => {
  try {
    const { accountValue, marginRate, currentMarginUsed } = req.body;

    const buyingPower = accountValue * marginRate;
    const availableMargin = buyingPower - currentMarginUsed;
    const marginUtilization = (currentMarginUsed / buyingPower) * 100;
    const maintenanceMargin = currentMarginUsed * 0.25; // 25% maintenance requirement

    res.json({
      buyingPower: buyingPower.toFixed(2),
      availableMargin: availableMargin.toFixed(2),
      marginUtilization: marginUtilization.toFixed(2),
      maintenanceMargin: maintenanceMargin.toFixed(2),
      marginCallPrice: (maintenanceMargin / accountValue).toFixed(2)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== REBALANCER ====================

router.get('/rebalancer/analysis', (req, res) => {
  try {
    const portfolios = Database.getPortfoliosByUser(req.user.id);
    if (portfolios.length === 0) {
      return res.json({ recommendations: [], currentAllocation: [], targetAllocation: [] });
    }

    const holdings = Database.getHoldingsByPortfolio(portfolios[0].id);

    // Calculate current allocation by sector
    const sectorTotals = {};
    let totalValue = 0;

    holdings.forEach(h => {
      const value = h.shares * h.avg_cost_basis;
      totalValue += value;
      const sector = h.sector || 'Unknown';
      sectorTotals[sector] = (sectorTotals[sector] || 0) + value;
    });

    const currentAllocation = Object.entries(sectorTotals).map(([sector, value]) => ({
      sector,
      value,
      percentage: ((value / totalValue) * 100).toFixed(2)
    }));

    // Default target allocation
    const targetAllocation = [
      { sector: 'Technology', percentage: 25 },
      { sector: 'Healthcare', percentage: 15 },
      { sector: 'Financial', percentage: 15 },
      { sector: 'Consumer', percentage: 15 },
      { sector: 'Industrial', percentage: 10 },
      { sector: 'Energy', percentage: 10 },
      { sector: 'Other', percentage: 10 }
    ];

    // Generate recommendations
    const recommendations = currentAllocation.map(current => {
      const target = targetAllocation.find(t => t.sector === current.sector) || { percentage: 10 };
      const diff = parseFloat(current.percentage) - target.percentage;
      return {
        sector: current.sector,
        currentPct: current.percentage,
        targetPct: target.percentage,
        difference: diff.toFixed(2),
        action: diff > 2 ? 'Reduce' : diff < -2 ? 'Increase' : 'Hold',
        amount: Math.abs(diff * totalValue / 100).toFixed(2)
      };
    });

    res.json({
      currentAllocation,
      targetAllocation,
      recommendations: recommendations.filter(r => r.action !== 'Hold'),
      totalValue
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== INCOME PROJECTIONS ====================

router.get('/income/projections', async (req, res) => {
  try {
    const holdings = Database.getAllHoldingsByUser(req.user.id);

    // Fetch LIVE dividend data from Yahoo Finance API
    const symbols = holdings.map(h => h.symbol);
    const liveDividends = await liveDataService.getDividendData(symbols);

    const dividendHoldings = holdings.map(h => {
      const dividendInfo = liveDividends[h.symbol];
      const annualDividend = dividendInfo?.annualDividend || 0;
      const annualIncome = annualDividend * h.shares;
      const marketValue = h.shares * h.avg_cost_basis;
      return {
        symbol: h.symbol,
        shares: h.shares,
        dividendPerShare: annualDividend,
        annualIncome,
        quarterlyIncome: annualIncome / 4,
        monthlyIncome: annualIncome / 12,
        yield: marketValue > 0 ? (annualIncome / marketValue * 100).toFixed(2) : 0
      };
    }).filter(h => h.annualIncome > 0);

    const totalAnnualIncome = dividendHoldings.reduce((sum, h) => sum + h.annualIncome, 0);

    // Monthly projections
    const monthlyProjections = [];
    for (let month = 1; month <= 12; month++) {
      monthlyProjections.push({
        month,
        income: (totalAnnualIncome / 12).toFixed(2),
        cumulative: ((totalAnnualIncome / 12) * month).toFixed(2)
      });
    }

    res.json({
      holdings: dividendHoldings,
      summary: {
        totalAnnualIncome: totalAnnualIncome.toFixed(2),
        totalMonthlyIncome: (totalAnnualIncome / 12).toFixed(2),
        averageYield: (dividendHoldings.reduce((sum, h) => sum + parseFloat(h.yield), 0) / dividendHoldings.length || 0).toFixed(2)
      },
      monthlyProjections
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== NEWS (MarketAux API) ====================

router.get('/news', async (req, res) => {
  try {
    const NewsService = require('../services/newsService');
    const newsService = new NewsService();

    const { symbols, limit = 20, category } = req.query;

    let news;
    if (symbols) {
      // Get news for specific symbols
      news = await newsService.getStockNews(symbols, parseInt(limit));
    } else {
      // Get general market news
      news = await newsService.getMarketNews(parseInt(limit));
    }

    // Add sentiment summary
    const sentimentSummary = newsService.calculateSentimentSummary(news);

    res.json({
      news,
      sentiment: sentimentSummary,
      count: news.length,
      source: 'MarketAux'
    });
  } catch (err) {
    logger.error('[News Route] Error:', err.message);
    // Return minimal fallback
    res.json({
      news: [
        {
          id: '1',
          headline: 'Markets Update',
          title: 'Markets Update',
          summary: 'Stay tuned for the latest market news and updates.',
          source: 'WealthPilot',
          datetime: new Date().toISOString(),
          published_at: new Date().toISOString(),
          symbol: 'MARKET',
          sentiment: 'neutral',
          category: 'general'
        }
      ],
      sentiment: { bullish: 0, neutral: 100, bearish: 0 },
      count: 1,
      source: 'fallback'
    });
  }
});

// Get news for user's portfolio holdings
router.get('/news/holdings', async (req, res) => {
  try {
    const NewsService = require('../services/newsService');
    const newsService = new NewsService();
    const db = require('../db/database');

    const userId = req.user?.id;
    if (!userId) {
      return res.json(await newsService.getMarketNews(20));
    }

    // Get user's holdings
    const holdings = db.prepare(`
      SELECT DISTINCT symbol FROM holdings WHERE user_id = ?
    `).all(userId);

    const news = await newsService.getHoldingsNews(holdings, parseInt(req.query.limit) || 20);
    const sentimentSummary = newsService.calculateSentimentSummary(news);

    res.json({
      news,
      sentiment: sentimentSummary,
      count: news.length,
      source: 'MarketAux'
    });
  } catch (err) {
    logger.error('[Holdings News Route] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ==================== CURRENCY ====================

router.get('/currency/rates', async (req, res) => {
  try {
    // Fetch LIVE forex rates from ExchangeRate-API
    const liveRates = await liveDataService.getForexRates('USD');

    res.json({
      base: liveRates.base,
      rates: liveRates.rates,
      lastUpdated: liveRates.timestamp,
      source: liveRates.source
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/currency/convert', async (req, res) => {
  try {
    const { amount, from, to } = req.body;

    // Fetch LIVE forex rates
    const liveRates = await liveDataService.getForexRates(from);
    const rates = { [from]: 1, ...liveRates.rates };

    const inBase = amount;
    const converted = inBase * rates[to];

    res.json({
      from,
      to,
      amount,
      converted: converted.toFixed(2),
      rate: rates[to].toFixed(4),
      source: liveRates.source
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
