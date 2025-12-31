const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'WealthPilot Pro API',
      version: '1.0.0',
      description: `
# WealthPilot Pro API Documentation

Professional portfolio management and financial analytics API providing:
- Portfolio tracking and management
- Real-time market data
- Tax optimization and loss harvesting
- AI-powered analysis and reports
- Dividend and earnings calendars
- Technical and fundamental analysis

## Authentication

All authenticated endpoints require a Bearer token in the Authorization header:
\`\`\`
Authorization: Bearer <your-jwt-token>
\`\`\`

## Rate Limits

- Standard endpoints: 100 requests/minute
- Market data: 30 requests/minute
- Authentication: 5 requests/15 minutes
      `,
      contact: {
        name: 'WealthPilot Support',
        email: 'support@wealthpilot.com'
      },
      license: {
        name: 'Proprietary',
        url: 'https://wealthpilot.com/terms'
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
          bearerFormat: 'JWT',
          description: 'JWT token obtained from /api/auth/login'
        }
      },
      schemas: {
        // User & Auth
        User: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            email: { type: 'string', format: 'email' },
            firstName: { type: 'string' },
            lastName: { type: 'string' },
            phone: { type: 'string' },
            timezone: { type: 'string', default: 'America/New_York' },
            currency: { type: 'string', default: 'USD' },
            theme: { type: 'string', enum: ['light', 'dark'], default: 'dark' },
            plan: { type: 'string', enum: ['free', 'pro', 'enterprise'], default: 'free' },
            twoFactorEnabled: { type: 'boolean', default: false },
            createdAt: { type: 'string', format: 'date-time' }
          }
        },
        LoginRequest: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email', example: 'user@example.com' },
            password: { type: 'string', minLength: 8, example: 'password123' }
          }
        },
        LoginResponse: {
          type: 'object',
          properties: {
            user: { $ref: '#/components/schemas/User' },
            token: { type: 'string', description: 'JWT token' },
            expiresAt: { type: 'string', format: 'date-time' },
            requires2FA: { type: 'boolean', description: 'If true, 2FA verification required' },
            tempToken: { type: 'string', description: 'Temporary token for 2FA verification' }
          }
        },
        RegisterRequest: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string', minLength: 8 },
            firstName: { type: 'string' },
            lastName: { type: 'string' }
          }
        },
        // Portfolio
        Portfolio: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string', example: 'Growth Portfolio' },
            description: { type: 'string' },
            currency: { type: 'string', default: 'USD' },
            benchmark: { type: 'string', default: 'SPY' },
            cashBalance: { type: 'number', example: 10000.00 },
            isDefault: { type: 'boolean' },
            totalValue: { type: 'number' },
            totalGain: { type: 'number' },
            totalGainPct: { type: 'number' },
            createdAt: { type: 'string', format: 'date-time' }
          }
        },
        PortfolioWithHoldings: {
          allOf: [
            { $ref: '#/components/schemas/Portfolio' },
            {
              type: 'object',
              properties: {
                holdings: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/Holding' }
                }
              }
            }
          ]
        },
        // Holdings
        Holding: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            portfolioId: { type: 'string', format: 'uuid' },
            symbol: { type: 'string', example: 'AAPL' },
            name: { type: 'string', example: 'Apple Inc.' },
            shares: { type: 'number', example: 100 },
            avgCostBasis: { type: 'number', example: 150.00 },
            sector: { type: 'string', example: 'Technology' },
            currentPrice: { type: 'number' },
            marketValue: { type: 'number' },
            gain: { type: 'number' },
            gainPct: { type: 'number' },
            dayChange: { type: 'number' },
            dayChangePct: { type: 'number' }
          }
        },
        AddHoldingRequest: {
          type: 'object',
          required: ['symbol', 'shares', 'price'],
          properties: {
            symbol: { type: 'string', example: 'AAPL' },
            shares: { type: 'number', example: 100 },
            price: { type: 'number', example: 175.50 },
            date: { type: 'string', format: 'date', example: '2024-01-15' }
          }
        },
        // Transaction
        Transaction: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            portfolioId: { type: 'string', format: 'uuid' },
            symbol: { type: 'string' },
            type: { type: 'string', enum: ['buy', 'sell', 'dividend', 'split', 'transfer'] },
            shares: { type: 'number' },
            price: { type: 'number' },
            amount: { type: 'number' },
            fees: { type: 'number', default: 0 },
            notes: { type: 'string' },
            executedAt: { type: 'string', format: 'date-time' }
          }
        },
        // Market Data
        StockQuote: {
          type: 'object',
          properties: {
            symbol: { type: 'string' },
            name: { type: 'string' },
            price: { type: 'number' },
            change: { type: 'number' },
            changePercent: { type: 'number' },
            open: { type: 'number' },
            high: { type: 'number' },
            low: { type: 'number' },
            previousClose: { type: 'number' },
            volume: { type: 'integer' },
            marketCap: { type: 'number' },
            pe: { type: 'number' },
            eps: { type: 'number' },
            dividend: { type: 'number' },
            dividendYield: { type: 'number' },
            timestamp: { type: 'string', format: 'date-time' }
          }
        },
        // Watchlist
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
            notes: { type: 'string' },
            addedAt: { type: 'string', format: 'date-time' }
          }
        },
        // Alerts
        Alert: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            symbol: { type: 'string' },
            alertType: { type: 'string', enum: ['price_above', 'price_below', 'percent_change', 'volume_spike'] },
            targetValue: { type: 'number' },
            isActive: { type: 'boolean' },
            triggeredAt: { type: 'string', format: 'date-time' },
            createdAt: { type: 'string', format: 'date-time' }
          }
        },
        // Tax
        TaxOpportunity: {
          type: 'object',
          properties: {
            symbol: { type: 'string' },
            shares: { type: 'number' },
            costBasis: { type: 'number' },
            currentValue: { type: 'number' },
            unrealizedLoss: { type: 'number' },
            potentialTaxSavings: { type: 'number' },
            holdingPeriod: { type: 'string', enum: ['short-term', 'long-term'] },
            washSaleRisk: { type: 'boolean' },
            recommendedETFs: { type: 'array', items: { type: 'string' } }
          }
        },
        // Backup
        BackupStatus: {
          type: 'object',
          properties: {
            isConfigured: { type: 'boolean' },
            s3Bucket: { type: 'string' },
            region: { type: 'string' },
            retentionDays: { type: 'integer' },
            scheduledBackupsActive: { type: 'boolean' }
          }
        },
        // Common
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
            statusCode: { type: 'integer' }
          }
        },
        Success: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        },
        PaginatedResponse: {
          type: 'object',
          properties: {
            data: { type: 'array', items: {} },
            pagination: {
              type: 'object',
              properties: {
                page: { type: 'integer' },
                limit: { type: 'integer' },
                total: { type: 'integer' },
                totalPages: { type: 'integer' }
              }
            }
          }
        }
      },
      parameters: {
        portfolioId: {
          name: 'portfolioId',
          in: 'path',
          required: true,
          schema: { type: 'string', format: 'uuid' },
          description: 'Portfolio ID'
        },
        symbol: {
          name: 'symbol',
          in: 'path',
          required: true,
          schema: { type: 'string' },
          description: 'Stock ticker symbol',
          example: 'AAPL'
        },
        page: {
          name: 'page',
          in: 'query',
          schema: { type: 'integer', default: 1 },
          description: 'Page number for pagination'
        },
        limit: {
          name: 'limit',
          in: 'query',
          schema: { type: 'integer', default: 20, maximum: 100 },
          description: 'Number of items per page'
        }
      },
      responses: {
        Unauthorized: {
          description: 'Authentication required or token invalid',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' }
            }
          }
        },
        NotFound: {
          description: 'Resource not found',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' }
            }
          }
        },
        RateLimited: {
          description: 'Too many requests',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' }
            }
          }
        }
      }
    },
    security: [{ bearerAuth: [] }],
    tags: [
      { name: 'Auth', description: 'Authentication & user management' },
      { name: '2FA', description: 'Two-factor authentication' },
      { name: 'Portfolios', description: 'Portfolio CRUD operations' },
      { name: 'Holdings', description: 'Holdings management' },
      { name: 'Transactions', description: 'Buy/sell/dividend transactions' },
      { name: 'Watchlists', description: 'Stock watchlist management' },
      { name: 'Alerts', description: 'Price and volume alerts' },
      { name: 'Market', description: 'Real-time market data' },
      { name: 'Analytics', description: 'Portfolio performance analytics' },
      { name: 'Tax', description: 'Tax loss harvesting & optimization' },
      { name: 'Dividends', description: 'Dividend tracking and calendar' },
      { name: 'AI', description: 'AI-powered analysis and chat' },
      { name: 'Reports', description: 'PDF and Excel report generation' },
      { name: 'Exports', description: 'Data export (CSV, Excel, PDF)' },
      { name: 'Backup', description: 'Database backup management (Admin)' },
      { name: 'Settings', description: 'User settings and preferences' },
      { name: 'Sectors', description: 'Sector analysis and rotation' }
    ],
    paths: {
      // Auth
      '/api/auth/register': {
        post: {
          tags: ['Auth'],
          summary: 'Register new user',
          security: [],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/RegisterRequest' } } }
          },
          responses: {
            '201': { description: 'User registered successfully' },
            '400': { description: 'Validation error or email exists' }
          }
        }
      },
      '/api/auth/login': {
        post: {
          tags: ['Auth'],
          summary: 'Login user',
          description: 'Returns JWT token. If 2FA is enabled, returns tempToken for verification.',
          security: [],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginRequest' } } }
          },
          responses: {
            '200': {
              description: 'Login successful or 2FA required',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginResponse' } } }
            },
            '401': { description: 'Invalid credentials' }
          }
        }
      },
      '/api/auth/verify-2fa': {
        post: {
          tags: ['Auth', '2FA'],
          summary: 'Complete login with 2FA verification',
          security: [],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['tempToken', 'code'],
                  properties: {
                    tempToken: { type: 'string', description: 'Temporary token from login' },
                    code: { type: 'string', description: '6-digit TOTP code' },
                    isBackupCode: { type: 'boolean', description: 'Using backup code instead' }
                  }
                }
              }
            }
          },
          responses: {
            '200': { description: '2FA verified, login complete' },
            '401': { description: 'Invalid or expired code' }
          }
        }
      },
      '/api/auth/me': {
        get: {
          tags: ['Auth'],
          summary: 'Get current user profile',
          responses: {
            '200': {
              description: 'User profile',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } }
            }
          }
        }
      },
      '/api/auth/logout': {
        post: {
          tags: ['Auth'],
          summary: 'Logout and invalidate session',
          responses: { '200': { description: 'Logged out successfully' } }
        }
      },
      // 2FA
      '/api/2fa/setup': {
        post: {
          tags: ['2FA'],
          summary: 'Initialize 2FA setup',
          description: 'Generates QR code for authenticator app',
          responses: {
            '200': {
              description: 'QR code and manual key',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      qrCode: { type: 'string', description: 'Base64 QR code image' },
                      manualEntryKey: { type: 'string', description: 'Key for manual entry' }
                    }
                  }
                }
              }
            }
          }
        }
      },
      '/api/2fa/verify-setup': {
        post: {
          tags: ['2FA'],
          summary: 'Verify and enable 2FA',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['token'],
                  properties: { token: { type: 'string', description: '6-digit code from app' } }
                }
              }
            }
          },
          responses: {
            '200': {
              description: '2FA enabled, backup codes returned',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: { type: 'string' },
                      backupCodes: { type: 'array', items: { type: 'string' } }
                    }
                  }
                }
              }
            }
          }
        }
      },
      '/api/2fa/status': {
        get: {
          tags: ['2FA'],
          summary: 'Get 2FA status',
          responses: {
            '200': {
              description: '2FA status',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      enabled: { type: 'boolean' },
                      pending: { type: 'boolean' },
                      backupCodesRemaining: { type: 'integer' }
                    }
                  }
                }
              }
            }
          }
        }
      },
      '/api/2fa/disable': {
        post: {
          tags: ['2FA'],
          summary: 'Disable 2FA',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['token', 'password'],
                  properties: {
                    token: { type: 'string' },
                    password: { type: 'string' }
                  }
                }
              }
            }
          },
          responses: { '200': { description: '2FA disabled' } }
        }
      },
      // Portfolios
      '/api/portfolios': {
        get: {
          tags: ['Portfolios'],
          summary: 'List all portfolios',
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
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name'],
                  properties: {
                    name: { type: 'string' },
                    description: { type: 'string' },
                    currency: { type: 'string', default: 'USD' },
                    benchmark: { type: 'string', default: 'SPY' }
                  }
                }
              }
            }
          },
          responses: { '201': { description: 'Portfolio created' } }
        }
      },
      '/api/portfolios/{id}': {
        get: {
          tags: ['Portfolios'],
          summary: 'Get portfolio with holdings',
          parameters: [{ $ref: '#/components/parameters/portfolioId' }],
          responses: {
            '200': {
              description: 'Portfolio with holdings',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/PortfolioWithHoldings' } } }
            }
          }
        },
        put: {
          tags: ['Portfolios'],
          summary: 'Update portfolio',
          parameters: [{ $ref: '#/components/parameters/portfolioId' }],
          responses: { '200': { description: 'Portfolio updated' } }
        },
        delete: {
          tags: ['Portfolios'],
          summary: 'Delete portfolio',
          parameters: [{ $ref: '#/components/parameters/portfolioId' }],
          responses: { '204': { description: 'Portfolio deleted' } }
        }
      },
      // Holdings
      '/api/portfolios/{portfolioId}/holdings': {
        post: {
          tags: ['Holdings'],
          summary: 'Add holding to portfolio',
          parameters: [{ name: 'portfolioId', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/AddHoldingRequest' } } }
          },
          responses: { '201': { description: 'Holding added' } }
        }
      },
      // Market
      '/api/market/quote/{symbol}': {
        get: {
          tags: ['Market'],
          summary: 'Get stock quote',
          parameters: [{ $ref: '#/components/parameters/symbol' }],
          responses: {
            '200': {
              description: 'Stock quote',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/StockQuote' } } }
            }
          }
        }
      },
      '/api/market/search': {
        get: {
          tags: ['Market'],
          summary: 'Search stocks by name or symbol',
          parameters: [
            { name: 'q', in: 'query', required: true, schema: { type: 'string' }, description: 'Search query' }
          ],
          responses: { '200': { description: 'Search results' } }
        }
      },
      // Tax
      '/api/tax/dashboard/{portfolioId}': {
        get: {
          tags: ['Tax'],
          summary: 'Get tax dashboard',
          parameters: [{ name: 'portfolioId', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'Tax dashboard data' } }
        }
      },
      '/api/tax/opportunities/{portfolioId}': {
        get: {
          tags: ['Tax'],
          summary: 'Get tax loss harvesting opportunities',
          parameters: [{ name: 'portfolioId', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '200': {
              description: 'Tax opportunities with ETF alternatives',
              content: {
                'application/json': {
                  schema: { type: 'array', items: { $ref: '#/components/schemas/TaxOpportunity' } }
                }
              }
            }
          }
        }
      },
      '/api/tax/harvest/execute': {
        post: {
          tags: ['Tax'],
          summary: 'Execute tax loss harvest',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['portfolioId', 'symbol'],
                  properties: {
                    portfolioId: { type: 'string' },
                    symbol: { type: 'string' },
                    shares: { type: 'number' },
                    replacementSymbol: { type: 'string' }
                  }
                }
              }
            }
          },
          responses: { '200': { description: 'Harvest executed' } }
        }
      },
      // AI
      '/api/ai/chat': {
        post: {
          tags: ['AI'],
          summary: 'Chat with AI assistant',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['message'],
                  properties: {
                    message: { type: 'string' },
                    portfolioId: { type: 'string' },
                    context: { type: 'string' }
                  }
                }
              }
            }
          },
          responses: { '200': { description: 'AI response' } }
        }
      },
      '/api/ai-reports/generate': {
        post: {
          tags: ['AI', 'Reports'],
          summary: 'Generate AI analysis report',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['portfolioId', 'reportType'],
                  properties: {
                    portfolioId: { type: 'string' },
                    reportType: { type: 'string', enum: ['summary', 'detailed', 'risk', 'tax'] }
                  }
                }
              }
            }
          },
          responses: { '200': { description: 'AI report' } }
        }
      },
      // Exports
      '/api/exports/portfolio/{id}': {
        get: {
          tags: ['Exports'],
          summary: 'Export portfolio to Excel',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '200': {
              description: 'Excel file',
              content: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {} }
            }
          }
        }
      },
      '/api/exports/portfolio/{id}/csv': {
        get: {
          tags: ['Exports'],
          summary: 'Export portfolio to CSV',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '200': {
              description: 'CSV file',
              content: { 'text/csv': {} }
            }
          }
        }
      },
      '/api/exports/portfolio/{id}/pdf': {
        get: {
          tags: ['Exports'],
          summary: 'Export portfolio report as PDF',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '200': {
              description: 'PDF report',
              content: { 'application/pdf': {} }
            }
          }
        }
      },
      // Backup (Admin)
      '/api/backup/status': {
        get: {
          tags: ['Backup'],
          summary: 'Get backup service status',
          description: 'Admin only',
          responses: {
            '200': {
              description: 'Backup status',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/BackupStatus' } } }
            }
          }
        }
      },
      '/api/backup/create': {
        post: {
          tags: ['Backup'],
          summary: 'Create database backup',
          description: 'Admin only',
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    type: { type: 'string', enum: ['full', 'schema', 'data'], default: 'full' }
                  }
                }
              }
            }
          },
          responses: { '200': { description: 'Backup created' } }
        }
      },
      '/api/backup/list': {
        get: {
          tags: ['Backup'],
          summary: 'List available backups',
          description: 'Admin only',
          responses: { '200': { description: 'List of backups' } }
        }
      },
      // Health
      '/api/health': {
        get: {
          tags: ['System'],
          summary: 'Health check',
          security: [],
          responses: { '200': { description: 'Service healthy' } }
        }
      },
      '/api/ready': {
        get: {
          tags: ['System'],
          summary: 'Readiness check',
          security: [],
          responses: { '200': { description: 'Service ready' } }
        }
      }
    }
  },
  apis: ['./src/routes/*.js', './src/server.js']
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
