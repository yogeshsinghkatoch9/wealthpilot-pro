/**
 * Help & Documentation Content Service
 * Provides structured help content, FAQs, and guides
 */

const helpContent = {
  categories: [
    {
      id: 'getting-started',
      name: 'Getting Started',
      icon: '🚀',
      description: 'Learn the basics of WealthPilot Pro',
      order: 1
    },
    {
      id: 'portfolios',
      name: 'Portfolio Management',
      icon: '💼',
      description: 'Manage your investment portfolios',
      order: 2
    },
    {
      id: 'analysis',
      name: 'Analytics & Analysis',
      icon: '📊',
      description: 'Advanced portfolio analytics and insights',
      order: 3
    },
    {
      id: 'alerts',
      name: 'Alerts & Notifications',
      icon: '🔔',
      description: 'Set up price alerts and notifications',
      order: 4
    },
    {
      id: 'reports',
      name: 'Reports & Export',
      icon: '📄',
      description: 'Generate PDF reports and export data',
      order: 5
    },
    {
      id: 'settings',
      name: 'Settings & Account',
      icon: '⚙️',
      description: 'Manage your account and preferences',
      order: 6
    }
  ],

  articles: [
    // Getting Started
    {
      id: 'welcome',
      categoryId: 'getting-started',
      title: 'Welcome to WealthPilot Pro',
      slug: 'welcome',
      summary: 'Get started with WealthPilot Pro in minutes',
      content: `
# Welcome to WealthPilot Pro

WealthPilot Pro is a comprehensive portfolio management platform designed for serious investors. This guide will help you get started.

## Quick Start

1. **Create Your Portfolio**: Navigate to Portfolios and click "Create Portfolio"
2. **Add Holdings**: Add your stocks, ETFs, or other securities
3. **View Analytics**: Access the Dashboard for real-time insights
4. **Set Alerts**: Create price alerts to monitor your investments
5. **Generate Reports**: Create professional PDF reports

## Key Features

### Real-Time Market Data
- Live stock quotes and market indices
- WebSocket-powered real-time updates
- 100+ technical indicators

### Advanced Analytics
- Performance attribution analysis
- Risk decomposition and VaR calculations
- Sector rotation and allocation analysis
- 20+ professional analytics tools

### Portfolio Management
- Multiple portfolio support
- Tax-loss harvesting optimization
- Dividend tracking and forecasting
- Transaction history and cost basis tracking

### Alerts & Notifications
- Price alerts (above/below/percentage change)
- Portfolio value alerts
- Dividend and earnings notifications
- Real-time WebSocket notifications

## Need Help?

Browse the articles in this help center or contact support at support@wealthpilot.com
      `,
      tags: ['basics', 'introduction', 'quickstart'],
      featured: true,
      order: 1
    },
    {
      id: 'create-portfolio',
      categoryId: 'getting-started',
      title: 'Creating Your First Portfolio',
      slug: 'create-portfolio',
      summary: 'Step-by-step guide to creating and managing portfolios',
      content: `
# Creating Your First Portfolio

## Step 1: Navigate to Portfolios

Click on "Portfolios" in the main navigation menu.

## Step 2: Click "Create Portfolio"

Click the "+ Create Portfolio" button in the top right.

## Step 3: Enter Portfolio Details

- **Name**: Give your portfolio a descriptive name (e.g., "Retirement", "Growth Portfolio")
- **Description**: Optional description for your reference
- **Currency**: Select your base currency (default: USD)
- **Benchmark**: Choose a benchmark index (SPY, QQQ, DIA, etc.)
- **Cash Balance**: Enter your starting cash position

## Step 4: Add Holdings

After creating the portfolio:

1. Click "Add Holding"
2. Enter the stock symbol (e.g., AAPL, MSFT)
3. Enter the number of shares
4. Enter your average cost basis (purchase price)
5. Click "Add"

## Step 5: Track Performance

Your portfolio will now appear on the Dashboard with:
- Total value and daily gain/loss
- Performance charts
- Sector allocation
- Risk metrics

## Tips

- Use meaningful names for easy identification
- Set appropriate benchmarks for comparison
- Keep your cash balance updated
- Review and rebalance regularly
      `,
      tags: ['portfolio', 'setup', 'basics'],
      featured: true,
      order: 2
    },

    // Portfolio Management
    {
      id: 'add-transactions',
      categoryId: 'portfolios',
      title: 'Adding Transactions',
      slug: 'add-transactions',
      summary: 'Record buy, sell, and dividend transactions',
      content: `
# Adding Transactions

Track all your investment activity with WealthPilot Pro's transaction system.

## Transaction Types

### Buy
- Record stock purchases
- Updates holdings and cost basis
- Reduces cash balance

### Sell
- Record stock sales
- Calculates realized gains/losses
- Increases cash balance

### Dividend
- Record dividend payments
- Tracks dividend income
- Updates cash balance

### Deposit/Withdrawal
- Track cash movements
- Manage portfolio liquidity

## How to Add a Transaction

1. Go to your Portfolio page
2. Click the "Transactions" tab
3. Click "+ Add Transaction"
4. Fill in the details:
   - Type (Buy/Sell/Dividend)
   - Symbol
   - Shares (for Buy/Sell)
   - Price per share
   - Fees (optional)
   - Date
5. Click "Add Transaction"

## Best Practices

- Record transactions promptly for accurate tracking
- Include all fees and commissions
- Use the correct transaction date
- Keep receipts and confirmations
- Review transaction history regularly
      `,
      tags: ['transactions', 'buy', 'sell', 'dividend'],
      order: 1
    },
    {
      id: 'tax-optimization',
      categoryId: 'portfolios',
      title: 'Tax-Loss Harvesting',
      slug: 'tax-optimization',
      summary: 'Optimize your portfolio for tax efficiency',
      content: `
# Tax-Loss Harvesting

WealthPilot Pro helps you identify tax-loss harvesting opportunities to reduce your tax liability.

## What is Tax-Loss Harvesting?

Tax-loss harvesting is the practice of selling securities at a loss to offset capital gains in other positions.

## How WealthPilot Pro Helps

### Automatic Identification
- Scans your portfolio for positions with unrealized losses
- Calculates potential tax savings
- Identifies wash sale risks

### Tax Reports
- Annual tax summary
- Capital gains/losses breakdown
- Dividend income tracking
- Tax lot analysis

## Using the Tax Optimization Page

1. Navigate to Tax Optimization
2. Review "Harvestable Losses"
3. Check "Wash Sale Warnings"
4. Review opportunities list
5. Execute harvesting trades

## Important Considerations

- **Wash Sale Rule**: Don't repurchase the same security within 30 days
- **Long-term vs Short-term**: Consider holding period implications
- **Transaction Costs**: Factor in commissions and fees
- **Alternative Investments**: Consider similar securities as replacements

## Tax Brackets

The system estimates tax savings based on:
- 37% for short-term capital gains (highest bracket)
- 20% for long-term capital gains (highest bracket)
- Your actual rate may vary

## Consult a Professional

Always consult with a tax professional for personalized advice.
      `,
      tags: ['tax', 'optimization', 'harvesting'],
      featured: true,
      order: 2
    },

    // Analytics
    {
      id: 'dashboard-analytics',
      categoryId: 'analysis',
      title: 'Understanding Dashboard Analytics',
      slug: 'dashboard-analytics',
      summary: 'Navigate and interpret the advanced analytics dashboard',
      content: `
# Understanding Dashboard Analytics

The WealthPilot Pro dashboard provides 20 professional analytics tools across 5 categories.

## Performance Tab

### 1. Performance Attribution
- **Allocation Effect**: Impact of sector/asset allocation decisions
- **Selection Effect**: Impact of individual stock selection
- **Waterfall Chart**: Visual breakdown of return sources

### 2. Excess Return vs Benchmark
- Compare your returns to your chosen benchmark
- Shaded bands show outperformance/underperformance periods
- Alpha calculation

### 3. Drawdown Analysis
- Maximum drawdown identification
- Recovery periods
- Peak-to-trough visualization

### 4. Rolling Statistics
- Rolling Sharpe ratio
- Rolling volatility
- Rolling returns
- Violin plots for distribution analysis

## Risk Tab

### 5. Risk Decomposition
- Factor exposures (Fama-French 5-factor model)
- Beta to market
- Factor contribution to risk

### 6. VaR & Stress Scenarios
- Value at Risk (95% and 99% confidence)
- Conditional VaR (CVaR)
- Historical stress test scenarios

### 7. Correlation Heatmap
- Correlation matrix of holdings
- Diversification analysis
- Cluster identification

### 8. Stress Testing
- Predefined scenarios (2008 crisis, COVID-19, etc.)
- Custom scenario builder
- Portfolio P&L estimates

### 9. Holdings Concentration
- Pareto analysis (80/20 rule)
- Treemap visualization
- Concentration risk metrics

## Navigation Tips

- Use the portfolio toggle to switch between single and all portfolios
- Hover over charts for detailed tooltips
- Click on chart elements for drill-down analysis
- Export charts as images using the menu button
      `,
      tags: ['analytics', 'dashboard', 'performance', 'risk'],
      featured: true,
      order: 1
    },

    // Alerts
    {
      id: 'price-alerts',
      categoryId: 'alerts',
      title: 'Setting Up Price Alerts',
      slug: 'price-alerts',
      summary: 'Create and manage price alerts for your investments',
      content: `
# Setting Up Price Alerts

Never miss important price movements with WealthPilot Pro's alert system.

## Alert Types

### Price Above
Alert when a stock reaches or exceeds a target price.

**Example**: Alert me when AAPL reaches $200

### Price Below
Alert when a stock drops to or below a target price.

**Example**: Alert me if TSLA drops below $150

### Price Change %
Alert on percentage price movements (up or down).

**Example**: Alert me if NVDA moves up/down 5% in a day

### Portfolio Value
Alert when portfolio value crosses a threshold.

**Example**: Alert me when my portfolio reaches $100,000

### Portfolio Gain/Loss
Alert based on portfolio percentage gains or losses.

**Example**: Alert me if my portfolio is up 10%

### Dividend Alerts
Notifications for upcoming dividend payments (7 days ahead).

### Earnings Alerts
Notifications for upcoming earnings reports (7 days ahead).

## Creating an Alert

1. Navigate to Alerts page
2. Click "Create Alert"
3. Choose alert type
4. Enter symbol (for stock-specific alerts)
5. Set condition parameters
6. Add custom message (optional)
7. Click "Create Alert"

## How Alerts Work

- **Monitoring**: System checks alerts every 30 seconds
- **Triggering**: Alert activates when condition is met
- **Notification**: Real-time notification via WebSocket
- **Status**: Alert marked as "Triggered" with timestamp

## Managing Alerts

- **View All**: See all your active and triggered alerts
- **Edit**: Modify alert conditions
- **Disable**: Temporarily disable without deleting
- **Reset**: Reset triggered alerts to active status
- **Delete**: Permanently remove alerts

## Best Practices

- Set realistic price targets
- Don't create too many overlapping alerts
- Review and clean up triggered alerts regularly
- Use portfolio alerts for overall strategy monitoring
- Combine with stop-loss orders for risk management
      `,
      tags: ['alerts', 'notifications', 'price', 'monitoring'],
      featured: true,
      order: 1
    },

    // Reports
    {
      id: 'generate-reports',
      categoryId: 'reports',
      title: 'Generating PDF Reports',
      slug: 'generate-reports',
      summary: 'Create professional PDF reports for your portfolios',
      content: `
# Generating PDF Reports

Create professional, print-ready PDF reports for your portfolios.

## Report Types

### Portfolio Overview
Comprehensive summary with:
- Holdings breakdown
- Sector allocation charts
- Performance metrics
- Top gainers/losers
- Asset allocation

### Performance Report
Detailed performance analysis:
- Historical returns
- Benchmark comparison
- Performance attribution
- Rolling statistics
- Risk-adjusted returns

### Tax Report
Tax optimization analysis:
- Capital gains/losses summary
- Tax-loss harvesting opportunities
- Dividend income
- Tax lot details
- Year-end tax planning

### Client Report
Professional client-facing report:
- Executive summary
- Portfolio snapshot
- Market commentary
- Performance analysis
- Investment recommendations
- Legal disclosures

## How to Generate Reports

1. Navigate to Reports page
2. Select report type
3. Choose portfolio
4. Configure options (period, benchmark, etc.)
5. Click "Generate PDF"
6. Wait for generation (typically 10-30 seconds)
7. PDF downloads automatically

## Report Options

### Portfolio Report Options
- Include charts (Yes/No)
- Include transaction history (Yes/No)

### Performance Report Options
- Time period (1M, 3M, 6M, 1Y, YTD, ALL)
- Benchmark (SPY, QQQ, DIA)

### Tax Report Options
- Tax year
- Include recommendations (Yes/No)

### Client Report Options
- Client name
- Include disclosures (Yes/No)

## Report Features

All reports include:
- Professional Bloomberg-style formatting
- Charts and visualizations
- Detailed tables
- Headers and footers
- Page numbers
- Generation timestamp

## Tips

- Generate reports monthly for tracking
- Use client reports for advisor presentations
- Keep tax reports for year-end filing
- Share via email or print for meetings
      `,
      tags: ['reports', 'pdf', 'export', 'client'],
      featured: true,
      order: 1
    },

    // Settings
    {
      id: 'account-settings',
      categoryId: 'settings',
      title: 'Managing Account Settings',
      slug: 'account-settings',
      summary: 'Configure your account preferences and settings',
      content: `
# Managing Account Settings

Customize WealthPilot Pro to match your preferences.

## Profile Settings

Update your personal information:
- Name
- Email address
- Phone number
- Avatar/profile picture

## Preferences

### Display Settings
- **Theme**: Light or Dark mode
- **Currency**: Default currency (USD, EUR, GBP, etc.)
- **Timezone**: Your local timezone
- **Date Format**: US or International format

### Dashboard Layout
- Customize widget arrangement
- Show/hide specific analytics
- Set default time periods

## Notification Settings

Control what notifications you receive:
- **Email Notifications**: Daily/weekly summaries
- **Push Notifications**: Real-time alerts (if enabled)
- **Alert Types**:
  - Price alerts
  - Dividend alerts
  - Earnings alerts
  - Portfolio alerts

### Email Preferences
- Weekly portfolio summary
- Monthly performance report
- Marketing emails
- Product updates

## API Keys

Generate API keys for third-party integrations:
1. Go to API Keys tab
2. Click "Create API Key"
3. Enter key name
4. Set expiration (optional)
5. Copy and save the key securely
6. Use in API requests

**Security**: Keep API keys confidential. They provide full account access.

## Security

### Change Password
1. Go to Security tab
2. Enter current password
3. Enter new password (min 8 characters)
4. Confirm new password
5. Click "Change Password"

### Active Sessions
- View all active login sessions
- See device and location information
- Revoke suspicious sessions
- Revoke all sessions (except current)

### Two-Factor Authentication
Enable 2FA for additional security:
1. Click "Enable 2FA"
2. Scan QR code with authenticator app
3. Enter verification code
4. Save backup codes

## Data & Privacy

### Export Your Data
Download all your data in JSON format:
- Profile information
- Portfolios and holdings
- Transaction history
- Watchlists and alerts

### Delete Account
Permanently delete your account and all data:
1. Go to Data & Privacy tab
2. Click "Delete My Account"
3. Enter password
4. Type "DELETE" to confirm
5. Click "Delete Account"

**Warning**: This action cannot be undone.

## Support

Need help? Contact support at support@wealthpilot.com
      `,
      tags: ['settings', 'account', 'preferences', 'security'],
      order: 1
    }
  ],

  faqs: [
    {
      id: 'faq-1',
      categoryId: 'getting-started',
      question: 'Is WealthPilot Pro free to use?',
      answer: 'WealthPilot Pro offers both free and premium plans. The free plan includes basic portfolio tracking and analytics. Premium plans unlock advanced features like tax optimization, professional reports, and unlimited portfolios.',
      order: 1
    },
    {
      id: 'faq-2',
      categoryId: 'getting-started',
      question: 'How do I get started?',
      answer: 'Simply create an account, add your first portfolio, and start adding holdings. The system will automatically fetch market data and calculate analytics.',
      order: 2
    },
    {
      id: 'faq-3',
      categoryId: 'portfolios',
      question: 'Can I track multiple portfolios?',
      answer: 'Yes! You can create and track unlimited portfolios. Each portfolio maintains its own holdings, transactions, and performance history.',
      order: 1
    },
    {
      id: 'faq-4',
      categoryId: 'portfolios',
      question: 'How is cost basis calculated?',
      answer: 'Cost basis is calculated using the average cost method. When you add holdings or transactions, the system automatically updates the weighted average cost basis for each position.',
      order: 2
    },
    {
      id: 'faq-5',
      categoryId: 'portfolios',
      question: 'Can I import my existing portfolio?',
      answer: 'Yes! You can import portfolios from CSV files or connect brokerage accounts (premium feature). Go to Import section in Portfolio settings.',
      order: 3
    },
    {
      id: 'faq-6',
      categoryId: 'analysis',
      question: 'How accurate are the analytics?',
      answer: 'Our analytics use real-time market data and industry-standard calculations. Performance metrics are accurate to the minute, while risk calculations are based on historical data and statistical models.',
      order: 1
    },
    {
      id: 'faq-7',
      categoryId: 'analysis',
      question: 'What benchmarks can I use?',
      answer: 'You can compare against major indices including SPY (S&P 500), QQQ (NASDAQ), DIA (Dow Jones), and custom benchmarks.',
      order: 2
    },
    {
      id: 'faq-8',
      categoryId: 'alerts',
      question: 'How quickly do alerts trigger?',
      answer: 'The alert system checks conditions every 30 seconds. When triggered, you receive an immediate real-time notification via WebSocket.',
      order: 1
    },
    {
      id: 'faq-9',
      categoryId: 'alerts',
      question: 'Can I get email notifications for alerts?',
      answer: 'Yes! Enable email notifications in your Settings under Notifications. You\'ll receive emails when alerts trigger.',
      order: 2
    },
    {
      id: 'faq-10',
      categoryId: 'reports',
      question: 'Are the PDF reports customizable?',
      answer: 'Yes! Each report type offers configuration options. You can choose time periods, include/exclude sections, and add custom messages.',
      order: 1
    },
    {
      id: 'faq-11',
      categoryId: 'reports',
      question: 'Can I schedule automatic reports?',
      answer: 'Premium users can schedule weekly or monthly reports to be automatically generated and emailed.',
      order: 2
    },
    {
      id: 'faq-12',
      categoryId: 'settings',
      question: 'How do I change my email address?',
      answer: 'Go to Settings > Profile, update your email address, and verify the new email via the confirmation link sent to your inbox.',
      order: 1
    },
    {
      id: 'faq-13',
      categoryId: 'settings',
      question: 'Is my data secure?',
      answer: 'Yes! We use industry-standard encryption (AES-256), secure authentication, and follow best practices for data protection. Your data is backed up daily.',
      order: 2
    }
  ],

  quickLinks: [
    { label: 'Create Portfolio', url: '/portfolios', icon: '💼' },
    { label: 'View Dashboard', url: '/dashboard', icon: '📊' },
    { label: 'Set Up Alerts', url: '/alerts', icon: '🔔' },
    { label: 'Generate Report', url: '/reports', icon: '📄' },
    { label: 'Account Settings', url: '/settings', icon: '⚙️' }
  ]
};

module.exports = helpContent;
