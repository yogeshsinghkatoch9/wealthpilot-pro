-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "first_name" TEXT,
    "last_name" TEXT,
    "phone" TEXT,
    "avatar_url" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "theme" TEXT NOT NULL DEFAULT 'dark',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "plan_expires_at" TIMESTAMP(3),
    "two_factor_enabled" BOOLEAN NOT NULL DEFAULT false,
    "two_factor_secret" TEXT,
    "two_factor_pending" BOOLEAN NOT NULL DEFAULT false,
    "backup_codes" TEXT,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "user_agent" TEXT,
    "ip_address" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhooks" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "events" TEXT NOT NULL,
    "description" TEXT,
    "headers" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "disabled_reason" TEXT,
    "disabled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "webhooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_deliveries" (
    "id" TEXT NOT NULL,
    "webhook_id" TEXT NOT NULL,
    "delivery_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "status_code" INTEGER,
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_tokens" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'email_verification',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emailNotifications" BOOLEAN NOT NULL DEFAULT true,
    "pushNotifications" BOOLEAN NOT NULL DEFAULT false,
    "alertsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "dividendAlerts" BOOLEAN NOT NULL DEFAULT true,
    "earningsAlerts" BOOLEAN NOT NULL DEFAULT true,
    "priceAlerts" BOOLEAN NOT NULL DEFAULT true,
    "weeklyReport" BOOLEAN NOT NULL DEFAULT true,
    "monthlyReport" BOOLEAN NOT NULL DEFAULT true,
    "defaultPortfolioId" TEXT,
    "dashboardLayout" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolios" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "benchmark" TEXT NOT NULL DEFAULT 'SPY',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "cash_balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "portfolios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holdings" (
    "id" TEXT NOT NULL,
    "portfolio_id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "shares" DOUBLE PRECISION NOT NULL,
    "avg_cost_basis" DOUBLE PRECISION NOT NULL,
    "sector" TEXT,
    "asset_type" TEXT NOT NULL DEFAULT 'stock',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "holdings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_lots" (
    "id" TEXT NOT NULL,
    "holding_id" TEXT NOT NULL,
    "shares" DOUBLE PRECISION NOT NULL,
    "cost_basis" DOUBLE PRECISION NOT NULL,
    "purchase_date" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tax_lots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "portfolio_id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "shares" DOUBLE PRECISION,
    "price" DOUBLE PRECISION,
    "amount" DOUBLE PRECISION NOT NULL,
    "fees" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "executed_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioSnapshot" (
    "id" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "totalValue" DOUBLE PRECISION NOT NULL,
    "cashBalance" DOUBLE PRECISION NOT NULL,
    "dayGain" DOUBLE PRECISION NOT NULL,
    "dayGainPct" DOUBLE PRECISION NOT NULL,
    "totalGain" DOUBLE PRECISION NOT NULL,
    "totalGainPct" DOUBLE PRECISION NOT NULL,
    "holdings" TEXT NOT NULL,
    "snapshotDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortfolioSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolio_shares" (
    "id" TEXT NOT NULL,
    "portfolio_id" TEXT NOT NULL,
    "share_token" TEXT NOT NULL,
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "expires_at" TIMESTAMP(3),
    "allowed_fields" TEXT NOT NULL DEFAULT '["holdings","performance","allocation"]',
    "show_values" BOOLEAN NOT NULL DEFAULT true,
    "show_quantities" BOOLEAN NOT NULL DEFAULT true,
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "portfolio_shares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "share_events" (
    "id" TEXT NOT NULL,
    "portfolio_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "event_data" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "share_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Watchlist" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Watchlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "watchlist_items" (
    "id" TEXT NOT NULL,
    "watchlist_id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "target_price" DOUBLE PRECISION,
    "notes" TEXT,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "watchlist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "symbol" TEXT,
    "type" TEXT NOT NULL,
    "condition" TEXT NOT NULL,
    "message" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_triggered" BOOLEAN NOT NULL DEFAULT false,
    "triggered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "data" TEXT,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_data_tracker" (
    "symbol" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "history_start_date" TIMESTAMP(3),
    "history_end_date" TIMESTAMP(3),
    "history_record_count" INTEGER NOT NULL DEFAULT 0,
    "last_quote_update" TIMESTAMP(3),
    "last_history_update" TIMESTAMP(3),
    "last_dividend_update" TIMESTAMP(3),
    "last_earnings_update" TIMESTAMP(3),
    "last_profile_update" TIMESTAMP(3),
    "last_financials_update" TIMESTAMP(3),
    "initial_fetch_started" TIMESTAMP(3),
    "initial_fetch_completed" TIMESTAMP(3),
    "error_count" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "last_error_at" TIMESTAMP(3),
    "primary_data_source" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_data_tracker_pkey" PRIMARY KEY ("symbol")
);

-- CreateTable
CREATE TABLE "stock_quotes" (
    "symbol" TEXT NOT NULL,
    "name" TEXT,
    "exchange" TEXT,
    "sector" TEXT,
    "industry" TEXT,
    "price" DOUBLE PRECISION NOT NULL,
    "previous_close" DOUBLE PRECISION,
    "open_price" DOUBLE PRECISION,
    "high" DOUBLE PRECISION,
    "low" DOUBLE PRECISION,
    "volume" BIGINT,
    "market_cap" BIGINT,
    "pe_ratio" DOUBLE PRECISION,
    "dividend" DOUBLE PRECISION,
    "dividend_yield" DOUBLE PRECISION,
    "beta" DOUBLE PRECISION,
    "week_52_high" DOUBLE PRECISION,
    "week_52_low" DOUBLE PRECISION,
    "change_amount" DOUBLE PRECISION,
    "change_percent" DOUBLE PRECISION,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_quotes_pkey" PRIMARY KEY ("symbol")
);

-- CreateTable
CREATE TABLE "stock_history" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "open" DOUBLE PRECISION NOT NULL,
    "high" DOUBLE PRECISION NOT NULL,
    "low" DOUBLE PRECISION NOT NULL,
    "close" DOUBLE PRECISION NOT NULL,
    "adj_close" DOUBLE PRECISION NOT NULL,
    "volume" BIGINT NOT NULL,
    "vwap" DOUBLE PRECISION,
    "change_percent" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DividendHistory" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "exDate" TIMESTAMP(3) NOT NULL,
    "payDate" TIMESTAMP(3),
    "recordDate" TIMESTAMP(3),
    "amount" DOUBLE PRECISION NOT NULL,
    "frequency" TEXT,
    "type" TEXT,

    CONSTRAINT "DividendHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EarningsCalendar" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "reportDate" TIMESTAMP(3) NOT NULL,
    "fiscalQuarter" TEXT,
    "fiscalYear" INTEGER,
    "epsEstimate" DOUBLE PRECISION,
    "epsActual" DOUBLE PRECISION,
    "revenueEstimate" DOUBLE PRECISION,
    "revenueActual" DOUBLE PRECISION,
    "surprise" DOUBLE PRECISION,
    "timing" TEXT,

    CONSTRAINT "EarningsCalendar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyProfile" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "exchange" TEXT,
    "sector" TEXT,
    "industry" TEXT,
    "employees" INTEGER,
    "ceo" TEXT,
    "headquarters" TEXT,
    "website" TEXT,
    "ipoDate" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialStatement" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "fiscalDate" TIMESTAMP(3) NOT NULL,
    "reportedDate" TIMESTAMP(3),
    "revenue" DOUBLE PRECISION,
    "costOfRevenue" DOUBLE PRECISION,
    "grossProfit" DOUBLE PRECISION,
    "operatingExpenses" DOUBLE PRECISION,
    "operatingIncome" DOUBLE PRECISION,
    "netIncome" DOUBLE PRECISION,
    "eps" DOUBLE PRECISION,
    "epsDiluted" DOUBLE PRECISION,
    "totalAssets" DOUBLE PRECISION,
    "totalLiabilities" DOUBLE PRECISION,
    "totalEquity" DOUBLE PRECISION,
    "cash" DOUBLE PRECISION,
    "totalDebt" DOUBLE PRECISION,
    "operatingCashFlow" DOUBLE PRECISION,
    "capitalExpenditure" DOUBLE PRECISION,
    "freeCashFlow" DOUBLE PRECISION,
    "dividendsPaid" DOUBLE PRECISION,
    "grossMargin" DOUBLE PRECISION,
    "operatingMargin" DOUBLE PRECISION,
    "netMargin" DOUBLE PRECISION,
    "roe" DOUBLE PRECISION,
    "roa" DOUBLE PRECISION,
    "currentRatio" DOUBLE PRECISION,
    "debtToEquity" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialStatement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsiderTransaction" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "filingDate" TIMESTAMP(3) NOT NULL,
    "transactionDate" TIMESTAMP(3),
    "ownerName" TEXT NOT NULL,
    "ownerTitle" TEXT,
    "transactionType" TEXT NOT NULL,
    "shares" DOUBLE PRECISION NOT NULL,
    "pricePerShare" DOUBLE PRECISION,
    "totalValue" DOUBLE PRECISION,
    "sharesOwned" DOUBLE PRECISION,

    CONSTRAINT "InsiderTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstitutionalHolding" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "holderName" TEXT NOT NULL,
    "shares" DOUBLE PRECISION NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "percentOwned" DOUBLE PRECISION,
    "changeShares" DOUBLE PRECISION,
    "changePercent" DOUBLE PRECISION,
    "reportDate" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstitutionalHolding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalystRating" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "firm" TEXT NOT NULL,
    "analyst" TEXT,
    "rating" TEXT NOT NULL,
    "priceTarget" DOUBLE PRECISION,
    "previousRating" TEXT,
    "previousTarget" DOUBLE PRECISION,
    "date" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnalystRating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsArticle" (
    "id" TEXT NOT NULL,
    "symbol" TEXT,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "source" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "imageUrl" TEXT,
    "sentiment" TEXT,
    "sentimentScore" DOUBLE PRECISION,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NewsArticle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BenchmarkHistory" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "close" DOUBLE PRECISION NOT NULL,
    "adjustedClose" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "BenchmarkHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FactorReturns" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "mktRf" DOUBLE PRECISION NOT NULL,
    "smb" DOUBLE PRECISION NOT NULL,
    "hml" DOUBLE PRECISION NOT NULL,
    "rmw" DOUBLE PRECISION NOT NULL,
    "cma" DOUBLE PRECISION NOT NULL,
    "mom" DOUBLE PRECISION NOT NULL,
    "rf" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "FactorReturns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ESGScores" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "esgScore" DOUBLE PRECISION NOT NULL,
    "environmentScore" DOUBLE PRECISION NOT NULL,
    "socialScore" DOUBLE PRECISION NOT NULL,
    "governanceScore" DOUBLE PRECISION NOT NULL,
    "carbonFootprint" DOUBLE PRECISION,

    CONSTRAINT "ESGScores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiquidityMetrics" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "bidAskSpread" DOUBLE PRECISION NOT NULL,
    "bidAskSpreadPct" DOUBLE PRECISION NOT NULL,
    "avgDailyVolume" INTEGER NOT NULL,
    "avgDollarVolume" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "LiquidityMetrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SentimentData" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "overallScore" DOUBLE PRECISION NOT NULL,
    "overallSentiment" TEXT NOT NULL,
    "socialMediaScore" DOUBLE PRECISION NOT NULL,
    "newsScore" DOUBLE PRECISION NOT NULL,
    "analystScore" DOUBLE PRECISION NOT NULL,
    "mentionVolume" INTEGER NOT NULL,
    "correlationScore" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SentimentData_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialMediaMention" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "content" TEXT,
    "sentiment" TEXT NOT NULL,
    "sentimentScore" DOUBLE PRECISION NOT NULL,
    "author" TEXT,
    "mentions" INTEGER NOT NULL DEFAULT 1,
    "likes" INTEGER,
    "retweets" INTEGER,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialMediaMention_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrendingTopic" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "mentionCount" INTEGER NOT NULL,
    "sentiment" TEXT NOT NULL,
    "trendingScore" DOUBLE PRECISION NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrendingTopic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SentimentHistory" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "volume" INTEGER NOT NULL,
    "source" TEXT NOT NULL,

    CONSTRAINT "SentimentHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SectorData" (
    "id" TEXT NOT NULL,
    "sectorName" TEXT NOT NULL,
    "sectorCode" TEXT NOT NULL,
    "description" TEXT,
    "currentPrice" DOUBLE PRECISION,
    "change" DOUBLE PRECISION,
    "changePercent" DOUBLE PRECISION,
    "volume" INTEGER,
    "marketCap" DOUBLE PRECISION,
    "peRatio" DOUBLE PRECISION,
    "dividendYield" DOUBLE PRECISION,
    "week52High" DOUBLE PRECISION,
    "week52Low" DOUBLE PRECISION,
    "ytdReturn" DOUBLE PRECISION,
    "oneMonthReturn" DOUBLE PRECISION,
    "threeMonthReturn" DOUBLE PRECISION,
    "oneYearReturn" DOUBLE PRECISION,
    "volatility" DOUBLE PRECISION,
    "beta" DOUBLE PRECISION,
    "sharpeRatio" DOUBLE PRECISION,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SectorData_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SectorPerformance" (
    "id" TEXT NOT NULL,
    "sectorName" TEXT NOT NULL,
    "sectorCode" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "open" DOUBLE PRECISION NOT NULL,
    "high" DOUBLE PRECISION NOT NULL,
    "low" DOUBLE PRECISION NOT NULL,
    "close" DOUBLE PRECISION NOT NULL,
    "volume" INTEGER,
    "returnPct" DOUBLE PRECISION,
    "relativeStrength" DOUBLE PRECISION,
    "momentumScore" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SectorPerformance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioSectorAllocation" (
    "id" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "sectorName" TEXT NOT NULL,
    "sectorCode" TEXT,
    "totalValue" DOUBLE PRECISION NOT NULL,
    "percentAlloc" DOUBLE PRECISION NOT NULL,
    "numHoldings" INTEGER NOT NULL,
    "avgCostBasis" DOUBLE PRECISION,
    "currentReturn" DOUBLE PRECISION,
    "returnPct" DOUBLE PRECISION,
    "weight" DOUBLE PRECISION,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortfolioSectorAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SectorRotation" (
    "id" TEXT NOT NULL,
    "fromSector" TEXT NOT NULL,
    "toSector" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "flowAmount" DOUBLE PRECISION NOT NULL,
    "flowPercent" DOUBLE PRECISION NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SectorRotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_chat_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT,
    "messages" TEXT NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_chat_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_reports" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "portfolio_id" TEXT NOT NULL,
    "report_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "file_path" TEXT,
    "metadata" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usage" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "input_tokens" INTEGER NOT NULL,
    "output_tokens" INTEGER NOT NULL,
    "cost" DOUBLE PRECISION,
    "endpoint" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paper_trading_accounts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "cash_balance" DOUBLE PRECISION NOT NULL DEFAULT 100000,
    "initial_balance" DOUBLE PRECISION NOT NULL DEFAULT 100000,
    "total_trades" INTEGER NOT NULL DEFAULT 0,
    "winning_trades" INTEGER NOT NULL DEFAULT 0,
    "losing_trades" INTEGER NOT NULL DEFAULT 0,
    "total_pnl" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "paper_trading_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paper_positions" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "avg_cost" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "paper_positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paper_orders" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "order_type" TEXT NOT NULL DEFAULT 'market',
    "limit_price" DOUBLE PRECISION,
    "stop_price" DOUBLE PRECISION,
    "time_in_force" TEXT NOT NULL DEFAULT 'day',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "submitted_price" DOUBLE PRECISION,
    "filled_price" DOUBLE PRECISION,
    "filled_quantity" DOUBLE PRECISION,
    "filled_at" TIMESTAMP(3),
    "commission" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "paper_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "broker_connections" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "broker_type" TEXT NOT NULL,
    "account_id" TEXT,
    "name" TEXT NOT NULL,
    "is_paper" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "last_sync_at" TIMESTAMP(3),
    "last_error" TEXT,
    "settings" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "broker_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "broker_credentials" (
    "id" TEXT NOT NULL,
    "connection_id" TEXT NOT NULL,
    "encrypted_api_key" TEXT NOT NULL,
    "encrypted_secret" TEXT NOT NULL,
    "encrypted_token" TEXT,
    "token_expires_at" TIMESTAMP(3),
    "scopes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "broker_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "broker_orders" (
    "id" TEXT NOT NULL,
    "connection_id" TEXT NOT NULL,
    "portfolio_id" TEXT,
    "broker_order_id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "order_type" TEXT NOT NULL,
    "limit_price" DOUBLE PRECISION,
    "stop_price" DOUBLE PRECISION,
    "time_in_force" TEXT NOT NULL DEFAULT 'day',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "filled_price" DOUBLE PRECISION,
    "filled_quantity" DOUBLE PRECISION,
    "filled_at" TIMESTAMP(3),
    "commission" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "broker_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "access_token" TEXT NOT NULL,
    "refresh_token" TEXT,
    "expires_in" INTEGER NOT NULL DEFAULT 3600,
    "token_type" TEXT NOT NULL DEFAULT 'Bearer',
    "scope" TEXT,
    "obtained_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "oauth_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "options_positions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "option_type" TEXT NOT NULL,
    "strike_price" DOUBLE PRECISION NOT NULL,
    "expiration_date" TIMESTAMP(3) NOT NULL,
    "contracts" INTEGER NOT NULL,
    "premium" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "entry_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "exit_date" TIMESTAMP(3),
    "exit_price" DOUBLE PRECISION,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "options_positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crypto_holdings" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL,
    "avg_cost" DOUBLE PRECISION NOT NULL,
    "wallet_address" TEXT,
    "exchange" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crypto_holdings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crypto_transactions" (
    "id" TEXT NOT NULL,
    "holding_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "fees" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "exchange" TEXT,
    "tx_hash" TEXT,
    "notes" TEXT,
    "executed_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crypto_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backtest_results" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "strategy_name" TEXT NOT NULL,
    "strategy_type" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "initial_capital" DOUBLE PRECISION NOT NULL,
    "final_value" DOUBLE PRECISION NOT NULL,
    "total_return" DOUBLE PRECISION NOT NULL,
    "total_return_pct" DOUBLE PRECISION NOT NULL,
    "annualized_return" DOUBLE PRECISION,
    "sharpe_ratio" DOUBLE PRECISION,
    "max_drawdown" DOUBLE PRECISION,
    "max_drawdown_pct" DOUBLE PRECISION,
    "win_rate" DOUBLE PRECISION,
    "total_trades" INTEGER NOT NULL,
    "winning_trades" INTEGER,
    "losing_trades" INTEGER,
    "avg_win" DOUBLE PRECISION,
    "avg_loss" DOUBLE PRECISION,
    "profit_factor" DOUBLE PRECISION,
    "parameters" TEXT,
    "trades" TEXT,
    "equityCurve" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "backtest_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_harvesting_opportunities" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "portfolio_id" TEXT,
    "symbol" TEXT NOT NULL,
    "shares" DOUBLE PRECISION NOT NULL,
    "current_price" DOUBLE PRECISION NOT NULL,
    "cost_basis" DOUBLE PRECISION NOT NULL,
    "unrealized_loss" DOUBLE PRECISION NOT NULL,
    "potential_savings" DOUBLE PRECISION NOT NULL,
    "holding_period" TEXT NOT NULL,
    "wash_sale_risk" BOOLEAN NOT NULL DEFAULT false,
    "wash_sale_end_date" TIMESTAMP(3),
    "suggested_action" TEXT NOT NULL,
    "alternative_symbols" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "harvested_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_harvesting_opportunities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_harvesting_reports" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "total_harvested" DOUBLE PRECISION NOT NULL,
    "short_term_losses" DOUBLE PRECISION NOT NULL,
    "long_term_losses" DOUBLE PRECISION NOT NULL,
    "estimated_tax_savings" DOUBLE PRECISION NOT NULL,
    "transactions_count" INTEGER NOT NULL,
    "reportData" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tax_harvesting_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assistant_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'New Conversation',
    "portfolio_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assistant_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assistant_messages" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "tool_calls" TEXT,
    "tool_results" TEXT,
    "tokens" INTEGER,
    "provider" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assistant_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assistant_attachments" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "message_id" TEXT,
    "filename" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "content" TEXT,
    "analysis" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assistant_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "sessions_token_idx" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "ApiKey_keyHash_idx" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "webhooks_user_id_idx" ON "webhooks"("user_id");

-- CreateIndex
CREATE INDEX "webhooks_is_active_idx" ON "webhooks"("is_active");

-- CreateIndex
CREATE INDEX "webhook_deliveries_webhook_id_idx" ON "webhook_deliveries"("webhook_id");

-- CreateIndex
CREATE INDEX "webhook_deliveries_delivery_id_idx" ON "webhook_deliveries"("delivery_id");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_token_key" ON "verification_tokens"("token");

-- CreateIndex
CREATE INDEX "verification_tokens_token_idx" ON "verification_tokens"("token");

-- CreateIndex
CREATE INDEX "verification_tokens_email_idx" ON "verification_tokens"("email");

-- CreateIndex
CREATE UNIQUE INDEX "UserSettings_userId_key" ON "UserSettings"("userId");

-- CreateIndex
CREATE INDEX "portfolios_user_id_idx" ON "portfolios"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "portfolios_user_id_name_key" ON "portfolios"("user_id", "name");

-- CreateIndex
CREATE INDEX "holdings_portfolio_id_idx" ON "holdings"("portfolio_id");

-- CreateIndex
CREATE INDEX "holdings_symbol_idx" ON "holdings"("symbol");

-- CreateIndex
CREATE UNIQUE INDEX "holdings_portfolio_id_symbol_key" ON "holdings"("portfolio_id", "symbol");

-- CreateIndex
CREATE INDEX "tax_lots_holding_id_idx" ON "tax_lots"("holding_id");

-- CreateIndex
CREATE INDEX "transactions_portfolio_id_idx" ON "transactions"("portfolio_id");

-- CreateIndex
CREATE INDEX "transactions_user_id_idx" ON "transactions"("user_id");

-- CreateIndex
CREATE INDEX "transactions_symbol_idx" ON "transactions"("symbol");

-- CreateIndex
CREATE INDEX "transactions_executed_at_idx" ON "transactions"("executed_at");

-- CreateIndex
CREATE INDEX "PortfolioSnapshot_portfolioId_idx" ON "PortfolioSnapshot"("portfolioId");

-- CreateIndex
CREATE INDEX "PortfolioSnapshot_snapshotDate_idx" ON "PortfolioSnapshot"("snapshotDate");

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioSnapshot_portfolioId_snapshotDate_key" ON "PortfolioSnapshot"("portfolioId", "snapshotDate");

-- CreateIndex
CREATE UNIQUE INDEX "portfolio_shares_portfolio_id_key" ON "portfolio_shares"("portfolio_id");

-- CreateIndex
CREATE UNIQUE INDEX "portfolio_shares_share_token_key" ON "portfolio_shares"("share_token");

-- CreateIndex
CREATE INDEX "portfolio_shares_share_token_idx" ON "portfolio_shares"("share_token");

-- CreateIndex
CREATE INDEX "portfolio_shares_portfolio_id_idx" ON "portfolio_shares"("portfolio_id");

-- CreateIndex
CREATE INDEX "share_events_portfolio_id_idx" ON "share_events"("portfolio_id");

-- CreateIndex
CREATE INDEX "share_events_event_type_idx" ON "share_events"("event_type");

-- CreateIndex
CREATE INDEX "share_events_created_at_idx" ON "share_events"("created_at");

-- CreateIndex
CREATE INDEX "Watchlist_userId_idx" ON "Watchlist"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Watchlist_userId_name_key" ON "Watchlist"("userId", "name");

-- CreateIndex
CREATE INDEX "watchlist_items_watchlist_id_idx" ON "watchlist_items"("watchlist_id");

-- CreateIndex
CREATE UNIQUE INDEX "watchlist_items_watchlist_id_symbol_key" ON "watchlist_items"("watchlist_id", "symbol");

-- CreateIndex
CREATE INDEX "alerts_user_id_idx" ON "alerts"("user_id");

-- CreateIndex
CREATE INDEX "alerts_symbol_idx" ON "alerts"("symbol");

-- CreateIndex
CREATE INDEX "alerts_is_active_idx" ON "alerts"("is_active");

-- CreateIndex
CREATE INDEX "notifications_user_id_idx" ON "notifications"("user_id");

-- CreateIndex
CREATE INDEX "notifications_is_read_idx" ON "notifications"("is_read");

-- CreateIndex
CREATE INDEX "notifications_created_at_idx" ON "notifications"("created_at");

-- CreateIndex
CREATE INDEX "stock_data_tracker_is_active_idx" ON "stock_data_tracker"("is_active");

-- CreateIndex
CREATE INDEX "stock_data_tracker_last_history_update_idx" ON "stock_data_tracker"("last_history_update");

-- CreateIndex
CREATE INDEX "stock_data_tracker_initial_fetch_completed_idx" ON "stock_data_tracker"("initial_fetch_completed");

-- CreateIndex
CREATE INDEX "stock_history_symbol_idx" ON "stock_history"("symbol");

-- CreateIndex
CREATE INDEX "stock_history_date_idx" ON "stock_history"("date");

-- CreateIndex
CREATE INDEX "stock_history_symbol_date_idx" ON "stock_history"("symbol", "date" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "stock_history_symbol_date_key" ON "stock_history"("symbol", "date");

-- CreateIndex
CREATE INDEX "DividendHistory_symbol_idx" ON "DividendHistory"("symbol");

-- CreateIndex
CREATE INDEX "DividendHistory_exDate_idx" ON "DividendHistory"("exDate");

-- CreateIndex
CREATE UNIQUE INDEX "DividendHistory_symbol_exDate_key" ON "DividendHistory"("symbol", "exDate");

-- CreateIndex
CREATE INDEX "EarningsCalendar_symbol_idx" ON "EarningsCalendar"("symbol");

-- CreateIndex
CREATE INDEX "EarningsCalendar_reportDate_idx" ON "EarningsCalendar"("reportDate");

-- CreateIndex
CREATE UNIQUE INDEX "EarningsCalendar_symbol_reportDate_key" ON "EarningsCalendar"("symbol", "reportDate");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyProfile_symbol_key" ON "CompanyProfile"("symbol");

-- CreateIndex
CREATE INDEX "CompanyProfile_symbol_idx" ON "CompanyProfile"("symbol");

-- CreateIndex
CREATE INDEX "CompanyProfile_sector_idx" ON "CompanyProfile"("sector");

-- CreateIndex
CREATE INDEX "FinancialStatement_symbol_idx" ON "FinancialStatement"("symbol");

-- CreateIndex
CREATE INDEX "FinancialStatement_fiscalDate_idx" ON "FinancialStatement"("fiscalDate");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialStatement_symbol_period_fiscalDate_key" ON "FinancialStatement"("symbol", "period", "fiscalDate");

-- CreateIndex
CREATE INDEX "InsiderTransaction_symbol_idx" ON "InsiderTransaction"("symbol");

-- CreateIndex
CREATE INDEX "InsiderTransaction_filingDate_idx" ON "InsiderTransaction"("filingDate");

-- CreateIndex
CREATE INDEX "InstitutionalHolding_symbol_idx" ON "InstitutionalHolding"("symbol");

-- CreateIndex
CREATE INDEX "InstitutionalHolding_reportDate_idx" ON "InstitutionalHolding"("reportDate");

-- CreateIndex
CREATE UNIQUE INDEX "InstitutionalHolding_symbol_holderName_reportDate_key" ON "InstitutionalHolding"("symbol", "holderName", "reportDate");

-- CreateIndex
CREATE INDEX "AnalystRating_symbol_idx" ON "AnalystRating"("symbol");

-- CreateIndex
CREATE INDEX "AnalystRating_date_idx" ON "AnalystRating"("date");

-- CreateIndex
CREATE INDEX "NewsArticle_symbol_idx" ON "NewsArticle"("symbol");

-- CreateIndex
CREATE INDEX "NewsArticle_publishedAt_idx" ON "NewsArticle"("publishedAt");

-- CreateIndex
CREATE INDEX "BenchmarkHistory_symbol_idx" ON "BenchmarkHistory"("symbol");

-- CreateIndex
CREATE INDEX "BenchmarkHistory_date_idx" ON "BenchmarkHistory"("date");

-- CreateIndex
CREATE UNIQUE INDEX "BenchmarkHistory_symbol_date_key" ON "BenchmarkHistory"("symbol", "date");

-- CreateIndex
CREATE UNIQUE INDEX "FactorReturns_date_key" ON "FactorReturns"("date");

-- CreateIndex
CREATE INDEX "FactorReturns_date_idx" ON "FactorReturns"("date");

-- CreateIndex
CREATE INDEX "ESGScores_symbol_idx" ON "ESGScores"("symbol");

-- CreateIndex
CREATE INDEX "ESGScores_date_idx" ON "ESGScores"("date");

-- CreateIndex
CREATE UNIQUE INDEX "ESGScores_symbol_date_key" ON "ESGScores"("symbol", "date");

-- CreateIndex
CREATE INDEX "LiquidityMetrics_symbol_idx" ON "LiquidityMetrics"("symbol");

-- CreateIndex
CREATE INDEX "LiquidityMetrics_date_idx" ON "LiquidityMetrics"("date");

-- CreateIndex
CREATE UNIQUE INDEX "LiquidityMetrics_symbol_date_key" ON "LiquidityMetrics"("symbol", "date");

-- CreateIndex
CREATE INDEX "SentimentData_symbol_idx" ON "SentimentData"("symbol");

-- CreateIndex
CREATE INDEX "SentimentData_date_idx" ON "SentimentData"("date");

-- CreateIndex
CREATE INDEX "SentimentData_overallScore_idx" ON "SentimentData"("overallScore");

-- CreateIndex
CREATE UNIQUE INDEX "SentimentData_symbol_date_key" ON "SentimentData"("symbol", "date");

-- CreateIndex
CREATE INDEX "SocialMediaMention_symbol_idx" ON "SocialMediaMention"("symbol");

-- CreateIndex
CREATE INDEX "SocialMediaMention_platform_idx" ON "SocialMediaMention"("platform");

-- CreateIndex
CREATE INDEX "SocialMediaMention_publishedAt_idx" ON "SocialMediaMention"("publishedAt");

-- CreateIndex
CREATE INDEX "SocialMediaMention_sentiment_idx" ON "SocialMediaMention"("sentiment");

-- CreateIndex
CREATE INDEX "TrendingTopic_symbol_idx" ON "TrendingTopic"("symbol");

-- CreateIndex
CREATE INDEX "TrendingTopic_date_idx" ON "TrendingTopic"("date");

-- CreateIndex
CREATE INDEX "TrendingTopic_trendingScore_idx" ON "TrendingTopic"("trendingScore");

-- CreateIndex
CREATE UNIQUE INDEX "TrendingTopic_symbol_topic_date_key" ON "TrendingTopic"("symbol", "topic", "date");

-- CreateIndex
CREATE INDEX "SentimentHistory_symbol_idx" ON "SentimentHistory"("symbol");

-- CreateIndex
CREATE INDEX "SentimentHistory_timestamp_idx" ON "SentimentHistory"("timestamp");

-- CreateIndex
CREATE INDEX "SentimentHistory_source_idx" ON "SentimentHistory"("source");

-- CreateIndex
CREATE UNIQUE INDEX "SectorData_sectorName_key" ON "SectorData"("sectorName");

-- CreateIndex
CREATE UNIQUE INDEX "SectorData_sectorCode_key" ON "SectorData"("sectorCode");

-- CreateIndex
CREATE INDEX "SectorData_sectorName_idx" ON "SectorData"("sectorName");

-- CreateIndex
CREATE INDEX "SectorData_sectorCode_idx" ON "SectorData"("sectorCode");

-- CreateIndex
CREATE INDEX "SectorPerformance_sectorCode_idx" ON "SectorPerformance"("sectorCode");

-- CreateIndex
CREATE INDEX "SectorPerformance_sectorName_idx" ON "SectorPerformance"("sectorName");

-- CreateIndex
CREATE INDEX "SectorPerformance_date_idx" ON "SectorPerformance"("date");

-- CreateIndex
CREATE UNIQUE INDEX "SectorPerformance_sectorCode_date_key" ON "SectorPerformance"("sectorCode", "date");

-- CreateIndex
CREATE INDEX "PortfolioSectorAllocation_portfolioId_idx" ON "PortfolioSectorAllocation"("portfolioId");

-- CreateIndex
CREATE INDEX "PortfolioSectorAllocation_sectorName_idx" ON "PortfolioSectorAllocation"("sectorName");

-- CreateIndex
CREATE INDEX "PortfolioSectorAllocation_date_idx" ON "PortfolioSectorAllocation"("date");

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioSectorAllocation_portfolioId_sectorName_date_key" ON "PortfolioSectorAllocation"("portfolioId", "sectorName", "date");

-- CreateIndex
CREATE INDEX "SectorRotation_date_idx" ON "SectorRotation"("date");

-- CreateIndex
CREATE INDEX "SectorRotation_fromSector_idx" ON "SectorRotation"("fromSector");

-- CreateIndex
CREATE INDEX "SectorRotation_toSector_idx" ON "SectorRotation"("toSector");

-- CreateIndex
CREATE INDEX "ai_chat_sessions_user_id_idx" ON "ai_chat_sessions"("user_id");

-- CreateIndex
CREATE INDEX "ai_chat_sessions_created_at_idx" ON "ai_chat_sessions"("created_at");

-- CreateIndex
CREATE INDEX "ai_reports_user_id_idx" ON "ai_reports"("user_id");

-- CreateIndex
CREATE INDEX "ai_reports_portfolio_id_idx" ON "ai_reports"("portfolio_id");

-- CreateIndex
CREATE INDEX "ai_reports_status_idx" ON "ai_reports"("status");

-- CreateIndex
CREATE INDEX "ai_reports_created_at_idx" ON "ai_reports"("created_at");

-- CreateIndex
CREATE INDEX "ai_usage_user_id_idx" ON "ai_usage"("user_id");

-- CreateIndex
CREATE INDEX "ai_usage_provider_idx" ON "ai_usage"("provider");

-- CreateIndex
CREATE INDEX "ai_usage_created_at_idx" ON "ai_usage"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "paper_trading_accounts_user_id_key" ON "paper_trading_accounts"("user_id");

-- CreateIndex
CREATE INDEX "paper_trading_accounts_user_id_idx" ON "paper_trading_accounts"("user_id");

-- CreateIndex
CREATE INDEX "paper_positions_account_id_idx" ON "paper_positions"("account_id");

-- CreateIndex
CREATE INDEX "paper_positions_symbol_idx" ON "paper_positions"("symbol");

-- CreateIndex
CREATE UNIQUE INDEX "paper_positions_account_id_symbol_key" ON "paper_positions"("account_id", "symbol");

-- CreateIndex
CREATE INDEX "paper_orders_account_id_idx" ON "paper_orders"("account_id");

-- CreateIndex
CREATE INDEX "paper_orders_symbol_idx" ON "paper_orders"("symbol");

-- CreateIndex
CREATE INDEX "paper_orders_status_idx" ON "paper_orders"("status");

-- CreateIndex
CREATE INDEX "paper_orders_created_at_idx" ON "paper_orders"("created_at");

-- CreateIndex
CREATE INDEX "broker_connections_user_id_idx" ON "broker_connections"("user_id");

-- CreateIndex
CREATE INDEX "broker_connections_broker_type_idx" ON "broker_connections"("broker_type");

-- CreateIndex
CREATE INDEX "broker_connections_is_active_idx" ON "broker_connections"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "broker_connections_user_id_broker_type_account_id_key" ON "broker_connections"("user_id", "broker_type", "account_id");

-- CreateIndex
CREATE UNIQUE INDEX "broker_credentials_connection_id_key" ON "broker_credentials"("connection_id");

-- CreateIndex
CREATE INDEX "broker_orders_connection_id_idx" ON "broker_orders"("connection_id");

-- CreateIndex
CREATE INDEX "broker_orders_symbol_idx" ON "broker_orders"("symbol");

-- CreateIndex
CREATE INDEX "broker_orders_status_idx" ON "broker_orders"("status");

-- CreateIndex
CREATE INDEX "broker_orders_created_at_idx" ON "broker_orders"("created_at");

-- CreateIndex
CREATE INDEX "oauth_tokens_user_id_idx" ON "oauth_tokens"("user_id");

-- CreateIndex
CREATE INDEX "oauth_tokens_provider_id_idx" ON "oauth_tokens"("provider_id");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_tokens_user_id_provider_id_key" ON "oauth_tokens"("user_id", "provider_id");

-- CreateIndex
CREATE INDEX "options_positions_user_id_idx" ON "options_positions"("user_id");

-- CreateIndex
CREATE INDEX "options_positions_symbol_idx" ON "options_positions"("symbol");

-- CreateIndex
CREATE INDEX "options_positions_status_idx" ON "options_positions"("status");

-- CreateIndex
CREATE INDEX "options_positions_expiration_date_idx" ON "options_positions"("expiration_date");

-- CreateIndex
CREATE INDEX "crypto_holdings_user_id_idx" ON "crypto_holdings"("user_id");

-- CreateIndex
CREATE INDEX "crypto_holdings_symbol_idx" ON "crypto_holdings"("symbol");

-- CreateIndex
CREATE UNIQUE INDEX "crypto_holdings_user_id_symbol_key" ON "crypto_holdings"("user_id", "symbol");

-- CreateIndex
CREATE INDEX "crypto_transactions_holding_id_idx" ON "crypto_transactions"("holding_id");

-- CreateIndex
CREATE INDEX "crypto_transactions_executed_at_idx" ON "crypto_transactions"("executed_at");

-- CreateIndex
CREATE INDEX "backtest_results_user_id_idx" ON "backtest_results"("user_id");

-- CreateIndex
CREATE INDEX "backtest_results_symbol_idx" ON "backtest_results"("symbol");

-- CreateIndex
CREATE INDEX "backtest_results_strategy_type_idx" ON "backtest_results"("strategy_type");

-- CreateIndex
CREATE INDEX "backtest_results_created_at_idx" ON "backtest_results"("created_at");

-- CreateIndex
CREATE INDEX "tax_harvesting_opportunities_user_id_idx" ON "tax_harvesting_opportunities"("user_id");

-- CreateIndex
CREATE INDEX "tax_harvesting_opportunities_symbol_idx" ON "tax_harvesting_opportunities"("symbol");

-- CreateIndex
CREATE INDEX "tax_harvesting_opportunities_status_idx" ON "tax_harvesting_opportunities"("status");

-- CreateIndex
CREATE INDEX "tax_harvesting_opportunities_unrealized_loss_idx" ON "tax_harvesting_opportunities"("unrealized_loss");

-- CreateIndex
CREATE INDEX "tax_harvesting_reports_user_id_idx" ON "tax_harvesting_reports"("user_id");

-- CreateIndex
CREATE INDEX "tax_harvesting_reports_year_idx" ON "tax_harvesting_reports"("year");

-- CreateIndex
CREATE UNIQUE INDEX "tax_harvesting_reports_user_id_year_key" ON "tax_harvesting_reports"("user_id", "year");

-- CreateIndex
CREATE INDEX "assistant_sessions_user_id_idx" ON "assistant_sessions"("user_id");

-- CreateIndex
CREATE INDEX "assistant_sessions_portfolio_id_idx" ON "assistant_sessions"("portfolio_id");

-- CreateIndex
CREATE INDEX "assistant_sessions_created_at_idx" ON "assistant_sessions"("created_at");

-- CreateIndex
CREATE INDEX "assistant_messages_session_id_idx" ON "assistant_messages"("session_id");

-- CreateIndex
CREATE INDEX "assistant_messages_created_at_idx" ON "assistant_messages"("created_at");

-- CreateIndex
CREATE INDEX "assistant_attachments_session_id_idx" ON "assistant_attachments"("session_id");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_webhook_id_fkey" FOREIGN KEY ("webhook_id") REFERENCES "webhooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSettings" ADD CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolios" ADD CONSTRAINT "portfolios_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holdings" ADD CONSTRAINT "holdings_portfolio_id_fkey" FOREIGN KEY ("portfolio_id") REFERENCES "portfolios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_lots" ADD CONSTRAINT "tax_lots_holding_id_fkey" FOREIGN KEY ("holding_id") REFERENCES "holdings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_portfolio_id_fkey" FOREIGN KEY ("portfolio_id") REFERENCES "portfolios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioSnapshot" ADD CONSTRAINT "PortfolioSnapshot_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "portfolios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Watchlist" ADD CONSTRAINT "Watchlist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_watchlist_id_fkey" FOREIGN KEY ("watchlist_id") REFERENCES "Watchlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioSectorAllocation" ADD CONSTRAINT "PortfolioSectorAllocation_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "portfolios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paper_positions" ADD CONSTRAINT "paper_positions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "paper_trading_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paper_orders" ADD CONSTRAINT "paper_orders_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "paper_trading_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "broker_credentials" ADD CONSTRAINT "broker_credentials_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "broker_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "broker_orders" ADD CONSTRAINT "broker_orders_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "broker_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crypto_transactions" ADD CONSTRAINT "crypto_transactions_holding_id_fkey" FOREIGN KEY ("holding_id") REFERENCES "crypto_holdings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistant_messages" ADD CONSTRAINT "assistant_messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "assistant_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistant_attachments" ADD CONSTRAINT "assistant_attachments_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "assistant_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

