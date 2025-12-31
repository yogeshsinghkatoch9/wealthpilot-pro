/**
 * AI Chat Routes
 * Streaming chat endpoint with SSE for real-time AI responses
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const unifiedAI = require('../services/unifiedAIService');
const { financialPrompts } = require('../services/prompts/financialPrompts');
const { prisma } = require('../db/simpleDb');

// In-memory session store (replace with Redis in production)
const chatSessions = new Map();

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

module.exports = router;
