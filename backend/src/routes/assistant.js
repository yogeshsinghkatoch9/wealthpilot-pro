/**
 * Finance Assistant API Routes
 * Endpoints for the ChatGPT-like financial assistant
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const { authenticate } = require('../middleware/auth');
const financeAssistant = require('../services/financeAssistant');
const fileAnalysisService = require('../services/fileAnalysisService');

// Multer configuration for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedExts = ['.pdf', '.csv', '.xlsx', '.xls', '.txt', '.json'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type. Allowed: ${allowedExts.join(', ')}`));
    }
  }
});

/**
 * POST /api/assistant/chat/stream
 * Streaming chat endpoint using Server-Sent Events
 */
router.post('/chat/stream', authenticate, async (req, res) => {
  const { message, sessionId, portfolioId, attachments } = req.body;
  const userId = req.user.id;

  if (!message?.trim()) {
    return res.status(400).json({ error: 'Message is required' });
  }

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  let currentSessionId = sessionId;
  let fullResponse = '';

  try {
    // Create or get session
    if (!currentSessionId) {
      const session = await prisma.assistantSession.create({
        data: {
          userId,
          portfolioId: portfolioId || null,
          title: message.substring(0, 50) + (message.length > 50 ? '...' : '')
        }
      });
      currentSessionId = session.id;
    }

    // Save user message
    await prisma.assistantMessage.create({
      data: {
        sessionId: currentSessionId,
        role: 'user',
        content: message
      }
    });

    // Get attachment info if provided
    let attachmentData = [];
    if (attachments?.length) {
      attachmentData = await prisma.assistantAttachment.findMany({
        where: {
          id: { in: attachments.map(a => a.id || a) },
          sessionId: currentSessionId
        }
      });
    }

    // Stream the response
    for await (const chunk of financeAssistant.streamChat(message, {
      userId,
      portfolioId,
      sessionId: currentSessionId,
      attachments: attachmentData
    })) {
      if (chunk.type === 'text') {
        fullResponse += chunk.content;
        res.write(`data: ${JSON.stringify({ type: 'text', content: chunk.content })}\n\n`);
      } else if (chunk.type === 'tool_call') {
        res.write(`data: ${JSON.stringify({ type: 'tool_call', tool: chunk.tool, params: chunk.params })}\n\n`);
      } else if (chunk.type === 'done') {
        // Save assistant message
        await prisma.assistantMessage.create({
          data: {
            sessionId: currentSessionId,
            role: 'assistant',
            content: fullResponse,
            provider: chunk.provider,
            tokens: chunk.usage?.outputTokens
          }
        });

        // Update session title if it's the first exchange
        const messageCount = await prisma.assistantMessage.count({
          where: { sessionId: currentSessionId }
        });

        if (messageCount <= 2) {
          await prisma.assistantSession.update({
            where: { id: currentSessionId },
            data: { title: message.substring(0, 50) + (message.length > 50 ? '...' : '') }
          });
        }

        res.write(`data: ${JSON.stringify({
          type: 'done',
          sessionId: currentSessionId,
          provider: chunk.provider,
          usage: chunk.usage
        })}\n\n`);
      } else if (chunk.type === 'error') {
        res.write(`data: ${JSON.stringify({ type: 'error', error: chunk.error })}\n\n`);
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error) {
    console.error('[Assistant] Stream error:', error);
    res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  }
});

/**
 * POST /api/assistant/chat
 * Non-streaming chat endpoint
 */
router.post('/chat', authenticate, async (req, res) => {
  const { message, sessionId, portfolioId } = req.body;
  const userId = req.user.id;

  if (!message?.trim()) {
    return res.status(400).json({ error: 'Message is required' });
  }

  try {
    let fullResponse = '';
    let responseData = {};

    for await (const chunk of financeAssistant.streamChat(message, {
      userId,
      portfolioId,
      sessionId
    })) {
      if (chunk.type === 'text') {
        fullResponse += chunk.content;
      } else if (chunk.type === 'done') {
        responseData = {
          sessionId: chunk.sessionId || sessionId,
          provider: chunk.provider,
          usage: chunk.usage
        };
      }
    }

    res.json({
      success: true,
      response: fullResponse,
      ...responseData
    });
  } catch (error) {
    console.error('[Assistant] Chat error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/assistant/upload
 * Upload and analyze a file
 */
router.post('/upload', authenticate, upload.single('file'), async (req, res) => {
  const userId = req.user.id;
  const { sessionId } = req.body;

  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  try {
    // Analyze the file
    const analysis = await fileAnalysisService.analyzeFile(
      req.file.buffer,
      req.file.mimetype,
      req.file.originalname
    );

    // Get or create session
    let currentSessionId = sessionId;
    if (!currentSessionId) {
      const session = await prisma.assistantSession.create({
        data: {
          userId,
          title: `Analysis: ${req.file.originalname}`
        }
      });
      currentSessionId = session.id;
    }

    // Save attachment
    const attachment = await prisma.assistantAttachment.create({
      data: {
        sessionId: currentSessionId,
        filename: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
        content: analysis.text,
        analysis: analysis.analysis
      }
    });

    res.json({
      success: true,
      attachment: {
        id: attachment.id,
        filename: attachment.filename,
        mimeType: attachment.mimeType,
        size: attachment.size,
        analysis: attachment.analysis
      },
      sessionId: currentSessionId
    });
  } catch (error) {
    console.error('[Assistant] Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/assistant/sessions
 * List user's chat sessions
 */
router.get('/sessions', authenticate, async (req, res) => {
  const userId = req.user.id;
  const { limit = 50, offset = 0 } = req.query;

  try {
    const sessions = await prisma.assistantSession.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: parseInt(limit),
      skip: parseInt(offset),
      include: {
        _count: {
          select: { messages: true }
        }
      }
    });

    res.json({
      success: true,
      sessions: sessions.map(s => ({
        id: s.id,
        title: s.title,
        portfolioId: s.portfolioId,
        messageCount: s._count.messages,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt
      }))
    });
  } catch (error) {
    console.error('[Assistant] Sessions list error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/assistant/sessions/:id
 * Get a specific session with messages
 */
router.get('/sessions/:id', authenticate, async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;

  try {
    const session = await prisma.assistantSession.findFirst({
      where: { id, userId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' }
        },
        attachments: true
      }
    });

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json({
      success: true,
      session: {
        id: session.id,
        title: session.title,
        portfolioId: session.portfolioId,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        messages: session.messages.map(m => ({
          id: m.id,
          role: m.role,
          content: m.content,
          provider: m.provider,
          createdAt: m.createdAt
        })),
        attachments: session.attachments.map(a => ({
          id: a.id,
          filename: a.filename,
          mimeType: a.mimeType,
          analysis: a.analysis,
          createdAt: a.createdAt
        }))
      }
    });
  } catch (error) {
    console.error('[Assistant] Session get error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/assistant/sessions
 * Create a new session
 */
router.post('/sessions', authenticate, async (req, res) => {
  const userId = req.user.id;
  const { title, portfolioId } = req.body;

  try {
    const session = await prisma.assistantSession.create({
      data: {
        userId,
        title: title || 'New Conversation',
        portfolioId: portfolioId || null
      }
    });

    res.json({
      success: true,
      session: {
        id: session.id,
        title: session.title,
        portfolioId: session.portfolioId,
        createdAt: session.createdAt
      }
    });
  } catch (error) {
    console.error('[Assistant] Session create error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/assistant/sessions/:id
 * Delete a session
 */
router.delete('/sessions/:id', authenticate, async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;

  try {
    // Verify ownership
    const session = await prisma.assistantSession.findFirst({
      where: { id, userId }
    });

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Delete session (cascades to messages and attachments)
    await prisma.assistantSession.delete({
      where: { id }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('[Assistant] Session delete error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/assistant/suggestions
 * Get context-aware prompt suggestions
 */
router.get('/suggestions', authenticate, async (req, res) => {
  const userId = req.user.id;
  const { portfolioId } = req.query;

  try {
    const suggestions = await financeAssistant.getSuggestions(userId, portfolioId);

    res.json({
      success: true,
      suggestions
    });
  } catch (error) {
    console.error('[Assistant] Suggestions error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/assistant/quick-insight
 * Get a quick insight
 */
router.post('/quick-insight', authenticate, async (req, res) => {
  const userId = req.user.id;
  const { type, portfolioId } = req.body;

  const validTypes = ['portfolioHealth', 'dailySummary', 'riskAlert', 'tradeIdea'];
  if (!validTypes.includes(type)) {
    return res.status(400).json({ error: `Invalid type. Must be one of: ${validTypes.join(', ')}` });
  }

  try {
    const insight = await financeAssistant.generateQuickInsight(type, userId, portfolioId);

    res.json({
      success: true,
      ...insight
    });
  } catch (error) {
    console.error('[Assistant] Quick insight error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/assistant/tools/execute
 * Execute a tool directly
 */
router.post('/tools/execute', authenticate, async (req, res) => {
  const userId = req.user.id;
  const { tool, params } = req.body;

  if (!tool) {
    return res.status(400).json({ error: 'Tool name is required' });
  }

  try {
    const result = await financeAssistant.executeTool(tool, params || {}, userId);

    res.json({
      success: true,
      tool,
      result
    });
  } catch (error) {
    console.error('[Assistant] Tool execute error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/assistant/tools
 * List available tools
 */
router.get('/tools', authenticate, (req, res) => {
  const tools = financeAssistant.getToolsList();

  res.json({
    success: true,
    tools
  });
});

/**
 * GET /api/assistant/status
 * Get assistant status
 */
router.get('/status', authenticate, async (req, res) => {
  try {
    // Check AI service status
    const unifiedAI = require('../services/unifiedAIService');

    res.json({
      success: true,
      status: {
        claude: !!unifiedAI.anthropic,
        openai: !!unifiedAI.openai,
        ready: !!(unifiedAI.anthropic || unifiedAI.openai)
      }
    });
  } catch (error) {
    res.json({
      success: false,
      status: { ready: false },
      error: error.message
    });
  }
});

module.exports = router;
