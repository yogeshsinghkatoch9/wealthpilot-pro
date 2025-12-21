const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'WealthPilot Pro API',
      version: '1.0.0',
      description: 'Portfolio management and financial analytics API',
      contact: {
        name: 'WealthPilot Support'
      }
    },
    servers: [
      {
        url: 'http://localhost:4000',
        description: 'Development server'
      },
      {
        url: 'https://api.wealthpilot.example.com',
        description: 'Production server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      },
      schemas: {
        Portfolio: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            description: { type: 'string' },
            currency: { type: 'string', default: 'USD' },
            benchmark: { type: 'string', default: 'SPY' },
            cashBalance: { type: 'number' },
            createdAt: { type: 'string', format: 'date-time' }
          }
        },
        Holding: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            portfolioId: { type: 'string', format: 'uuid' },
            symbol: { type: 'string' },
            name: { type: 'string' },
            shares: { type: 'number' },
            avgCostBasis: { type: 'number' },
            sector: { type: 'string' },
            currentPrice: { type: 'number' },
            marketValue: { type: 'number' },
            gain: { type: 'number' },
            gainPct: { type: 'number' }
          }
        },
        Transaction: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            portfolioId: { type: 'string', format: 'uuid' },
            symbol: { type: 'string' },
            type: { type: 'string', enum: ['buy', 'sell', 'dividend'] },
            shares: { type: 'number' },
            price: { type: 'number' },
            amount: { type: 'number' },
            executedAt: { type: 'string', format: 'date-time' }
          }
        },
        Watchlist: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            description: { type: 'string' },
            items: {
              type: 'array',
              items: { $ref: '#/components/schemas/WatchlistItem' }
            }
          }
        },
        WatchlistItem: {
          type: 'object',
          properties: {
            symbol: { type: 'string' },
            targetPrice: { type: 'number' },
            notes: { type: 'string' }
          }
        },
        Alert: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            symbol: { type: 'string' },
            alertType: { type: 'string', enum: ['price_above', 'price_below', 'percent_change'] },
            targetValue: { type: 'number' },
            isActive: { type: 'boolean' }
          }
        },
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' }
          }
        }
      }
    },
    security: [{ bearerAuth: [] }],
    tags: [
      { name: 'Auth', description: 'Authentication endpoints' },
      { name: 'Portfolios', description: 'Portfolio management' },
      { name: 'Holdings', description: 'Holdings management' },
      { name: 'Transactions', description: 'Transaction management' },
      { name: 'Watchlists', description: 'Watchlist management' },
      { name: 'Alerts', description: 'Price alerts' },
      { name: 'Analytics', description: 'Portfolio analytics' },
      { name: 'Market', description: 'Market data' },
      { name: 'Dividends', description: 'Dividend tracking' },
      { name: 'ETF', description: 'ETF analysis' },
      { name: 'Sector', description: 'Sector analysis and heatmaps' }
    ],
    paths: {
      '/api/portfolios': {
        get: {
          tags: ['Portfolios'],
          summary: 'Get all portfolios',
          responses: {
            '200': {
              description: 'List of portfolios',
              content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Portfolio' } } } }
            }
          }
        },
        post: {
          tags: ['Portfolios'],
          summary: 'Create new portfolio',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Portfolio' } } }
          },
          responses: { '201': { description: 'Portfolio created' } }
        }
      },
      '/api/portfolios/{id}': {
        get: {
          tags: ['Portfolios'],
          summary: 'Get portfolio by ID',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'Portfolio details' } }
        },
        put: {
          tags: ['Portfolios'],
          summary: 'Update portfolio',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'Portfolio updated' } }
        },
        delete: {
          tags: ['Portfolios'],
          summary: 'Delete portfolio',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '204': { description: 'Portfolio deleted' } }
        }
      },
      '/api/auth/register': {
        post: {
          tags: ['Auth'],
          summary: 'Register new user',
          security: [],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object', required: ['email', 'password', 'firstName', 'lastName'], properties: { email: { type: 'string', format: 'email' }, password: { type: 'string', minLength: 8 }, firstName: { type: 'string' }, lastName: { type: 'string' } } } } }
          },
          responses: { '201': { description: 'User registered' }, '400': { description: 'Validation error' } }
        }
      },
      '/api/auth/login': {
        post: {
          tags: ['Auth'],
          summary: 'Login user',
          security: [],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object', required: ['email', 'password'], properties: { email: { type: 'string', format: 'email' }, password: { type: 'string' } } } } }
          },
          responses: { '200': { description: 'Login successful' }, '401': { description: 'Invalid credentials' } }
        }
      },
      '/api/market/quote/{symbol}': {
        get: {
          tags: ['Market'],
          summary: 'Get stock quote',
          parameters: [{ name: 'symbol', in: 'path', required: true, schema: { type: 'string' }, example: 'AAPL' }],
          responses: { '200': { description: 'Stock quote data' } }
        }
      }
    }
  },
  apis: ['./src/routes/*.js', './src/server.js']
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
