/**
 * Unified AI Service
 * Abstracts Claude and OpenAI behind a single interface
 * Claude is primary, OpenAI is fallback
 */

const Anthropic = require('@anthropic-ai/sdk');
const OpenAI = require('openai');

class UnifiedAIService {
  constructor() {
    this.anthropic = null;
    this.openai = null;
    this.primaryProvider = process.env.AI_PRIMARY_PROVIDER || 'claude';
    this.initializeClients();
  }

  initializeClients() {
    // Initialize Claude
    if (process.env.ANTHROPIC_API_KEY) {
      try {
        this.anthropic = new Anthropic({
          apiKey: process.env.ANTHROPIC_API_KEY
        });
        console.log('[UnifiedAI] Claude client initialized');
      } catch (error) {
        console.error('[UnifiedAI] Failed to initialize Claude:', error.message);
      }
    } else {
      console.log('[UnifiedAI] No ANTHROPIC_API_KEY found, Claude disabled');
    }

    // Initialize OpenAI
    if (process.env.OPENAI_API_KEY) {
      try {
        this.openai = new OpenAI({
          apiKey: process.env.OPENAI_API_KEY
        });
        console.log('[UnifiedAI] OpenAI client initialized');
      } catch (error) {
        console.error('[UnifiedAI] Failed to initialize OpenAI:', error.message);
      }
    } else {
      console.log('[UnifiedAI] No OPENAI_API_KEY found, OpenAI disabled');
    }
  }

  /**
   * Generate a completion using the preferred provider
   * Falls back to alternative if primary fails
   */
  async generateCompletion(prompt, options = {}) {
    const {
      systemPrompt = 'You are a professional financial analyst and portfolio advisor.',
      maxTokens = 4096,
      temperature = 0.7,
      provider = this.primaryProvider
    } = options;

    try {
      if (provider === 'claude' && this.anthropic) {
        return await this.claudeCompletion(prompt, systemPrompt, maxTokens, temperature);
      } else if (this.openai) {
        return await this.openaiCompletion(prompt, systemPrompt, maxTokens, temperature);
      }
      throw new Error('No AI provider available');
    } catch (error) {
      console.error(`[UnifiedAI] ${provider} failed:`, error.message);

      // Try fallback provider
      if (provider === 'claude' && this.openai) {
        console.log('[UnifiedAI] Falling back to OpenAI');
        return await this.openaiCompletion(prompt, systemPrompt, maxTokens, temperature);
      } else if (provider === 'openai' && this.anthropic) {
        console.log('[UnifiedAI] Falling back to Claude');
        return await this.claudeCompletion(prompt, systemPrompt, maxTokens, temperature);
      }

      throw error;
    }
  }

  /**
   * Claude completion
   */
  async claudeCompletion(prompt, systemPrompt, maxTokens, temperature) {
    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      temperature: temperature,
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }]
    });

    return {
      content: response.content[0].text,
      provider: 'claude',
      model: 'claude-sonnet-4-20250514',
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens
      }
    };
  }

  /**
   * OpenAI completion
   */
  async openaiCompletion(prompt, systemPrompt, maxTokens, temperature) {
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: maxTokens,
      temperature: temperature,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ]
    });

    return {
      content: response.choices[0].message.content,
      provider: 'openai',
      model: 'gpt-4o-mini',
      usage: {
        inputTokens: response.usage.prompt_tokens,
        outputTokens: response.usage.completion_tokens
      }
    };
  }

  /**
   * Stream completion for chat interface (SSE)
   */
  async *streamCompletion(prompt, options = {}) {
    const {
      systemPrompt = 'You are a professional financial analyst and portfolio advisor.',
      maxTokens = 4096,
      temperature = 0.7,
      conversationHistory = [],
      provider = this.primaryProvider
    } = options;

    try {
      if (provider === 'claude' && this.anthropic) {
        yield* this.streamClaude(prompt, systemPrompt, maxTokens, temperature, conversationHistory);
      } else if (this.openai) {
        yield* this.streamOpenAI(prompt, systemPrompt, maxTokens, temperature, conversationHistory);
      } else {
        throw new Error('No AI provider available');
      }
    } catch (error) {
      console.error(`[UnifiedAI] Stream ${provider} failed:`, error.message);

      // Try fallback
      if (provider === 'claude' && this.openai) {
        console.log('[UnifiedAI] Stream falling back to OpenAI');
        yield* this.streamOpenAI(prompt, systemPrompt, maxTokens, temperature, conversationHistory);
      } else if (provider === 'openai' && this.anthropic) {
        console.log('[UnifiedAI] Stream falling back to Claude');
        yield* this.streamClaude(prompt, systemPrompt, maxTokens, temperature, conversationHistory);
      } else {
        throw error;
      }
    }
  }

  /**
   * Stream from Claude
   */
  async *streamClaude(prompt, systemPrompt, maxTokens, temperature, conversationHistory) {
    const messages = [
      ...conversationHistory.map(msg => ({
        role: msg.role,
        content: msg.content
      })),
      { role: 'user', content: prompt }
    ];

    const stream = await this.anthropic.messages.stream({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      temperature: temperature,
      system: systemPrompt,
      messages: messages
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield {
          type: 'text',
          content: event.delta.text,
          provider: 'claude'
        };
      }
    }

    const finalMessage = await stream.finalMessage();
    yield {
      type: 'done',
      provider: 'claude',
      usage: {
        inputTokens: finalMessage.usage.input_tokens,
        outputTokens: finalMessage.usage.output_tokens
      }
    };
  }

  /**
   * Stream from OpenAI
   */
  async *streamOpenAI(prompt, systemPrompt, maxTokens, temperature, conversationHistory) {
    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory.map(msg => ({
        role: msg.role,
        content: msg.content
      })),
      { role: 'user', content: prompt }
    ];

    const stream = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: maxTokens,
      temperature: temperature,
      messages: messages,
      stream: true
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        yield {
          type: 'text',
          content: content,
          provider: 'openai'
        };
      }
    }

    yield {
      type: 'done',
      provider: 'openai'
    };
  }

  /**
   * Analyze portfolio with AI
   */
  async analyzePortfolio(portfolioData, analysisType = 'comprehensive') {
    const { financialPrompts } = require('./prompts/financialPrompts');

    const prompt = financialPrompts.portfolioAnalysis(portfolioData, analysisType);

    const systemPrompt = `You are an expert financial analyst with deep knowledge of portfolio management,
risk assessment, and investment strategies. Analyze the portfolio data provided and give actionable insights.
Always use proper financial metrics and formulas in your analysis.`;

    return await this.generateCompletion(prompt, {
      systemPrompt,
      maxTokens: 4096,
      temperature: 0.3
    });
  }

  /**
   * Generate AI-powered insights for a specific topic
   */
  async generateInsight(topic, data, options = {}) {
    const { financialPrompts } = require('./prompts/financialPrompts');

    let prompt;
    switch (topic) {
      case 'risk':
        prompt = financialPrompts.riskAssessment(data);
        break;
      case 'dividend':
        prompt = financialPrompts.dividendAnalysis(data);
        break;
      case 'sector':
        prompt = financialPrompts.sectorAnalysis(data);
        break;
      case 'recommendation':
        prompt = financialPrompts.recommendations(data);
        break;
      case 'market':
        prompt = financialPrompts.marketOutlook(data);
        break;
      default:
        prompt = financialPrompts.generalAnalysis(data);
    }

    return await this.generateCompletion(prompt, {
      maxTokens: 2048,
      temperature: 0.5,
      ...options
    });
  }

  /**
   * Generate complete portfolio report
   */
  async generateReport(portfolioData, reportConfig = {}) {
    const { financialPrompts } = require('./prompts/financialPrompts');

    const sections = reportConfig.sections || [
      'executiveSummary',
      'portfolioOverview',
      'performanceAnalysis',
      'riskAssessment',
      'sectorAnalysis',
      'holdingsAnalysis',
      'dividendAnalysis',
      'recommendations',
      'marketOutlook'
    ];

    const reportSections = {};

    for (const section of sections) {
      try {
        const prompt = financialPrompts.reportSection(section, portfolioData);
        const result = await this.generateCompletion(prompt, {
          systemPrompt: financialPrompts.reportSystemPrompt(),
          maxTokens: 2048,
          temperature: 0.4
        });
        reportSections[section] = result.content;
      } catch (error) {
        console.error(`[UnifiedAI] Error generating ${section}:`, error.message);
        reportSections[section] = `Unable to generate ${section} at this time.`;
      }
    }

    return reportSections;
  }

  /**
   * Answer user questions about portfolio/investments
   */
  async answerQuestion(question, context = {}) {
    const { portfolioData, conversationHistory = [] } = context;

    let contextPrompt = '';
    if (portfolioData) {
      contextPrompt = `
Current Portfolio Context:
- Total Value: $${portfolioData.totalValue?.toLocaleString() || 'N/A'}
- Holdings: ${portfolioData.holdings?.length || 0} positions
- Top Holdings: ${portfolioData.holdings?.slice(0, 5).map(h => h.symbol).join(', ') || 'N/A'}
- Performance: ${portfolioData.performance?.ytd ? `${portfolioData.performance.ytd.toFixed(2)}% YTD` : 'N/A'}

User Question: ${question}`;
    } else {
      contextPrompt = question;
    }

    const systemPrompt = `You are WealthPilot AI, a professional financial advisor assistant.
You help users understand their investments, provide market insights, and answer financial questions.
Be concise but thorough. Use data and metrics when available.
Always provide balanced perspectives and appropriate disclaimers for financial advice.`;

    return await this.generateCompletion(contextPrompt, {
      systemPrompt,
      maxTokens: 2048,
      temperature: 0.7
    });
  }

  /**
   * Check if AI services are available
   */
  getStatus() {
    return {
      claude: !!this.anthropic,
      openai: !!this.openai,
      primaryProvider: this.primaryProvider,
      ready: !!(this.anthropic || this.openai)
    };
  }
}

module.exports = new UnifiedAIService();
