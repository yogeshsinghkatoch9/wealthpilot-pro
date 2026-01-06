/**
 * AI Chat Routes
 * Streaming chat endpoint with SSE for real-time AI responses
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const xlsx = require('xlsx');
const { authenticate } = require('../middleware/auth');
const unifiedAI = require('../services/unifiedAIService');
const { financialPrompts } = require('../services/prompts/financialPrompts');
const { prisma } = require('../db/simpleDb');

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.csv', '.xlsx', '.xls', '.txt'];
    const ext = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf('.'));
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Allowed: CSV, Excel, TXT'));
    }
  }
});

// In-memory session store (replace with Redis in production)
const chatSessions = new Map();

/**
 * Get AI service status
 * GET /api/ai/chat/status OR /api/ai/status (if mounted at /api/ai)
 */
router.get('/status', (req, res) => {
  try {
    const status = unifiedAI.getStatus();
    res.json({
      success: true,
      status,
      primaryProvider: process.env.AI_PRIMARY_PROVIDER || 'claude'
    });
  } catch (error) {
    console.error('[AIChat] Status error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to get AI status',
      status: {
        available: false,
        providers: []
      }
    });
  }
});

/**
 * Streaming chat endpoint using Server-Sent Events
 * POST /api/ai/chat/stream
 */
router.post('/stream', authenticate, async (req, res) => {
  const { message, sessionId, portfolioContext } = req.body;
  const userId = req.user.id;

  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  try {
    // Get or create session
    const session = getOrCreateSession(userId, sessionId);

    // Add user message to history
    session.messages.push({
      role: 'user',
      content: message,
      timestamp: new Date().toISOString()
    });

    // Get portfolio context if available
    let portfolioData = null;
    if (portfolioContext?.portfolioId) {
      portfolioData = await getPortfolioContext(userId, portfolioContext.portfolioId);
    }

    // Build system prompt with context
    const systemPrompt = financialPrompts.chatSystemPrompt(portfolioData);

    // Get conversation history (last 10 messages for context)
    const conversationHistory = session.messages.slice(-10).map(m => ({
      role: m.role,
      content: m.content
    }));

    // Stream the response
    let fullResponse = '';

    try {
      for await (const chunk of unifiedAI.streamCompletion(message, {
        systemPrompt,
        conversationHistory: conversationHistory.slice(0, -1), // Exclude current message
        temperature: 0.7,
        maxTokens: 2048
      })) {
        if (chunk.type === 'text') {
          fullResponse += chunk.content;
          res.write(`data: ${JSON.stringify({ type: 'text', content: chunk.content })}\n\n`);
        } else if (chunk.type === 'done') {
          // Add assistant response to history
          session.messages.push({
            role: 'assistant',
            content: fullResponse,
            timestamp: new Date().toISOString(),
            provider: chunk.provider,
            usage: chunk.usage
          });

          // Update session title if first message
          if (session.messages.length <= 2) {
            session.title = message.substring(0, 50) + (message.length > 50 ? '...' : '');
          }

          res.write(`data: ${JSON.stringify({
            type: 'done',
            sessionId: session.id,
            provider: chunk.provider,
            usage: chunk.usage
          })}\n\n`);
        }
      }
    } catch (streamError) {
      console.error('[AIChat] Stream error:', streamError.message);
      res.write(`data: ${JSON.stringify({ type: 'error', error: streamError.message })}\n\n`);
    }

    res.write('data: [DONE]\n\n');
    res.end();

  } catch (error) {
    console.error('[AIChat] Error:', error.message);
    res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
    res.end();
  }
});

/**
 * Non-streaming chat endpoint (for compatibility)
 * POST /api/ai/chat/message
 */
router.post('/message', authenticate, async (req, res) => {
  try {
    const { message, sessionId, portfolioContext } = req.body;
    const userId = req.user.id;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Get or create session
    const session = getOrCreateSession(userId, sessionId);

    // Add user message
    session.messages.push({
      role: 'user',
      content: message,
      timestamp: new Date().toISOString()
    });

    // Get portfolio context
    let portfolioData = null;
    if (portfolioContext?.portfolioId) {
      portfolioData = await getPortfolioContext(userId, portfolioContext.portfolioId);
    } else {
      // Try to get all user holdings if no specific portfolio
      portfolioData = await getAllUserHoldings(userId);
    }

    // Include uploaded portfolio data if available
    if (portfolioContext?.uploadedPortfolio) {
      portfolioData = {
        ...portfolioData,
        uploadedPortfolio: portfolioContext.uploadedPortfolio
      };
    }

    // Generate response
    const response = await unifiedAI.answerQuestion(message, {
      portfolioData,
      conversationHistory: session.messages.slice(-10)
    });

    // Add assistant response
    session.messages.push({
      role: 'assistant',
      content: response.content,
      timestamp: new Date().toISOString(),
      provider: response.provider
    });

    res.json({
      success: true,
      sessionId: session.id,
      message: response.content,
      provider: response.provider,
      usage: response.usage
    });

  } catch (error) {
    console.error('[AIChat] Message error:', error.message);
    res.status(500).json({ error: 'Failed to process message' });
  }
});

/**
 * Get chat sessions
 * GET /api/ai/chat/sessions
 */
router.get('/sessions', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const userSessions = [];

    // Get sessions from memory
    for (const [id, session] of chatSessions.entries()) {
      if (session.userId === userId) {
        userSessions.push({
          id: session.id,
          title: session.title,
          messageCount: session.messages.length,
          createdAt: session.createdAt,
          updatedAt: session.messages[session.messages.length - 1]?.timestamp || session.createdAt
        });
      }
    }

    // Sort by most recent
    userSessions.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

    res.json({
      success: true,
      sessions: userSessions.slice(0, 20)
    });

  } catch (error) {
    console.error('[AIChat] Sessions error:', error.message);
    res.status(500).json({ error: 'Failed to get sessions' });
  }
});

/**
 * Get single session with messages
 * GET /api/ai/chat/sessions/:id
 */
router.get('/sessions/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const session = chatSessions.get(id);

    if (!session || session.userId !== userId) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json({
      success: true,
      session: {
        id: session.id,
        title: session.title,
        messages: session.messages,
        createdAt: session.createdAt
      }
    });

  } catch (error) {
    console.error('[AIChat] Get session error:', error.message);
    res.status(500).json({ error: 'Failed to get session' });
  }
});

/**
 * Delete a session
 * DELETE /api/ai/chat/sessions/:id
 */
router.delete('/sessions/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const session = chatSessions.get(id);

    if (!session || session.userId !== userId) {
      return res.status(404).json({ error: 'Session not found' });
    }

    chatSessions.delete(id);

    res.json({
      success: true,
      message: 'Session deleted'
    });

  } catch (error) {
    console.error('[AIChat] Delete session error:', error.message);
    res.status(500).json({ error: 'Failed to delete session' });
  }
});

/**
 * Create new session
 * POST /api/ai/chat/sessions
 */
router.post('/sessions', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { title } = req.body;

    const session = createSession(userId);
    if (title) {
      session.title = title;
    }

    res.json({
      success: true,
      session: {
        id: session.id,
        title: session.title,
        createdAt: session.createdAt
      }
    });

  } catch (error) {
    console.error('[AIChat] Create session error:', error.message);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

/**
 * Quick insights endpoint
 * POST /api/ai/chat/quick-insight
 */
router.post('/quick-insight', authenticate, async (req, res) => {
  try {
    const { type, data } = req.body;
    const userId = req.user.id;

    if (!type || !data) {
      return res.status(400).json({ error: 'Type and data are required' });
    }

    let prompt;
    switch (type) {
      case 'portfolioHealth':
        prompt = financialPrompts.quickInsight.portfolioHealth(data);
        break;
      case 'dailySummary':
        prompt = financialPrompts.quickInsight.dailySummary(data);
        break;
      case 'riskAlert':
        prompt = financialPrompts.quickInsight.riskAlert(data);
        break;
      case 'tradeIdea':
        prompt = financialPrompts.quickInsight.tradeIdea(data);
        break;
      default:
        return res.status(400).json({ error: 'Invalid insight type' });
    }

    const response = await unifiedAI.generateCompletion(prompt, {
      maxTokens: 256,
      temperature: 0.5
    });

    res.json({
      success: true,
      insight: response.content,
      provider: response.provider
    });

  } catch (error) {
    console.error('[AIChat] Quick insight error:', error.message);
    res.status(500).json({ error: 'Failed to generate insight' });
  }
});

// Helper functions

function createSession(userId) {
  const id = `session_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const session = {
    id,
    userId,
    title: 'New Conversation',
    messages: [],
    createdAt: new Date().toISOString()
  };
  chatSessions.set(id, session);
  return session;
}

function getOrCreateSession(userId, sessionId) {
  if (sessionId && chatSessions.has(sessionId)) {
    const session = chatSessions.get(sessionId);
    if (session.userId === userId) {
      return session;
    }
  }
  return createSession(userId);
}

async function getPortfolioContext(userId, portfolioId) {
  try {
    const portfolio = await prisma.portfolio.findFirst({
      where: { id: portfolioId, userId },
      include: { holdings: true }
    });

    if (!portfolio) return null;

    const holdings = portfolio.holdings.map(h => {
      const shares = parseFloat(h.shares) || 0;
      const currentPrice = parseFloat(h.currentPrice) || parseFloat(h.avgCostBasis) || 0;
      return {
        symbol: h.symbol,
        name: h.name,
        sector: h.sector,
        shares,
        currentPrice,
        marketValue: shares * currentPrice
      };
    });

    const totalValue = holdings.reduce((sum, h) => sum + h.marketValue, 0);

    return {
      name: portfolio.name,
      totalValue,
      holdings: holdings.sort((a, b) => b.marketValue - a.marketValue),
      performance: {
        ytd: null // Would calculate from historical data
      }
    };
  } catch (error) {
    console.error('[AIChat] Portfolio context error:', error.message);
    return null;
  }
}

/**
 * Get all user holdings across all portfolios
 */
async function getAllUserHoldings(userId) {
  try {
    const portfolios = await prisma.portfolios.findMany({
      where: { user_id: userId },
      include: { holdings: true }
    });

    if (!portfolios || portfolios.length === 0) return null;

    const allHoldings = [];
    portfolios.forEach(p => {
      if (p.holdings) {
        p.holdings.forEach(h => {
          const shares = parseFloat(h.shares) || 0;
          const avgCost = parseFloat(h.avg_cost_basis) || 0;
          allHoldings.push({
            symbol: h.symbol,
            name: h.name || h.symbol,
            sector: h.sector || 'Unknown',
            shares,
            avgCost,
            marketValue: shares * avgCost,
            portfolioName: p.name
          });
        });
      }
    });

    if (allHoldings.length === 0) return null;

    const totalValue = allHoldings.reduce((sum, h) => sum + h.marketValue, 0);

    return {
      name: 'All Portfolios',
      totalValue,
      holdingCount: allHoldings.length,
      holdings: allHoldings.slice(0, 30).sort((a, b) => b.marketValue - a.marketValue)
    };
  } catch (error) {
    console.error('[AIChat] Get all holdings error:', error.message);
    return null;
  }
}

/**
 * Parse portfolio file (CSV/Excel)
 * POST /api/ai/chat/parse-portfolio
 */
router.post('/parse-portfolio', authenticate, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const filename = req.file.originalname.toLowerCase();
    let data;

    if (filename.endsWith('.xlsx') || filename.endsWith('.xls')) {
      // Parse Excel file
      const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
    } else if (filename.endsWith('.csv') || filename.endsWith('.txt')) {
      // Parse CSV
      const text = req.file.buffer.toString('utf-8');
      data = text.split('\n').map(line => parseCSVRow(line));
    } else {
      return res.status(400).json({ success: false, error: 'Unsupported file format' });
    }

    if (!data || data.length < 2) {
      return res.status(400).json({ success: false, error: 'File appears to be empty' });
    }

    // Parse headers
    const headers = data[0];
    const headerMap = {};
    headers.forEach((h, i) => {
      if (h) {
        const normalized = String(h).toLowerCase().replace(/[^a-z0-9]/g, '');
        headerMap[normalized] = i;
      }
    });

    // Column mapping
    const colMap = {
      description: findColumn(headerMap, ['description', 'name', 'holdingname', 'security']),
      symbol: findColumn(headerMap, ['symbol', 'ticker', 'tickersymbol', 'sym']),
      quantity: findColumn(headerMap, ['quantity', 'shares', 'qty', 'units']),
      price: findColumn(headerMap, ['price', 'currentprice', 'lastprice', 'closingprice']),
      value: findColumn(headerMap, ['value', 'marketvalue', 'totalvalue', 'currentvalue']),
      assetsPercent: findColumn(headerMap, ['assets', 'assetspercent', 'weight', 'allocation']),
      accountType: findColumn(headerMap, ['accounttype', 'account', 'accttype']),
      principal: findColumn(headerMap, ['principal', 'costbasis', 'cost', 'purchaseprice']),
      principalGL: findColumn(headerMap, ['principalgl', 'gainloss', 'gl', 'unrealizedgl']),
      assetType: findColumn(headerMap, ['assettype', 'securitytype', 'type']),
      assetCategory: findColumn(headerMap, ['assetcategory', 'category', 'sector']),
      estAnnualIncome: findColumn(headerMap, ['estannualincome', 'annualincome', 'income', 'dividend']),
      currentYield: findColumn(headerMap, ['currentyield', 'yield', 'yieldrate', 'divyield']),
      purchaseDate: findColumn(headerMap, ['initialpurchasedate', 'purchasedate', 'dateacquired'])
    };

    // Parse holdings
    const holdings = [];
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row || row.length < 2) continue;

      const holding = {
        description: getVal(row, colMap.description, ''),
        symbol: String(getVal(row, colMap.symbol, '')).toUpperCase().replace(/[^A-Z]/g, ''),
        quantity: parseNum(getVal(row, colMap.quantity, 0)),
        price: parseNum(getVal(row, colMap.price, 0)),
        value: parseNum(getVal(row, colMap.value, 0)),
        assetsPercent: parseNum(getVal(row, colMap.assetsPercent, 0)),
        accountType: getVal(row, colMap.accountType, ''),
        principal: parseNum(getVal(row, colMap.principal, 0)),
        principalGL: parseNum(getVal(row, colMap.principalGL, 0)),
        assetType: getVal(row, colMap.assetType, ''),
        assetCategory: getVal(row, colMap.assetCategory, ''),
        estAnnualIncome: parseNum(getVal(row, colMap.estAnnualIncome, 0)),
        currentYield: parseNum(getVal(row, colMap.currentYield, 0)),
        purchaseDate: getVal(row, colMap.purchaseDate, '')
      };

      // Calculate value if not provided
      if (!holding.value && holding.quantity && holding.price) {
        holding.value = holding.quantity * holding.price;
      }

      if (holding.symbol || holding.description) {
        holdings.push(holding);
      }
    }

    if (holdings.length === 0) {
      return res.status(400).json({ success: false, error: 'No valid holdings found' });
    }

    // Calculate summary
    const totalValue = holdings.reduce((sum, h) => sum + (h.value || 0), 0);
    const totalGL = holdings.reduce((sum, h) => sum + (h.principalGL || 0), 0);
    const totalIncome = holdings.reduce((sum, h) => sum + (h.estAnnualIncome || 0), 0);

    res.json({
      success: true,
      portfolio: {
        holdings,
        summary: {
          totalHoldings: holdings.length,
          totalValue,
          totalGL,
          totalGLPercent: totalValue > 0 ? (totalGL / (totalValue - totalGL)) * 100 : 0,
          totalEstAnnualIncome: totalIncome,
          portfolioYield: totalValue > 0 ? (totalIncome / totalValue) * 100 : 0
        }
      }
    });

  } catch (error) {
    console.error('[AIChat] Parse portfolio error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to parse portfolio file' });
  }
});

// Helper functions for file parsing
function parseCSVRow(row) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < row.length; i++) {
    const char = row[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function findColumn(headerMap, possibleNames) {
  for (const name of possibleNames) {
    if (headerMap[name] !== undefined) {
      return headerMap[name];
    }
  }
  return -1;
}

function getVal(row, colIndex, defaultVal) {
  if (colIndex < 0 || colIndex >= row.length) return defaultVal;
  return row[colIndex] || defaultVal;
}

function parseNum(val) {
  if (!val) return 0;
  const cleaned = String(val).replace(/[$,%()]/g, '').replace(/,/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

module.exports = router;
