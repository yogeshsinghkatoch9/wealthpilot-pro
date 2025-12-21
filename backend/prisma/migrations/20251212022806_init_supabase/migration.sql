-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "phone" TEXT,
    "avatarUrl" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "theme" TEXT NOT NULL DEFAULT 'dark',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "planExpiresAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "Portfolio" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "benchmark" TEXT NOT NULL DEFAULT 'SPY',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "cashBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Portfolio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Holding" (
    "id" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "shares" DOUBLE PRECISION NOT NULL,
    "avgCostBasis" DOUBLE PRECISION NOT NULL,
    "sector" TEXT,
    "assetType" TEXT NOT NULL DEFAULT 'stock',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Holding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxLot" (
    "id" TEXT NOT NULL,
    "holdingId" TEXT NOT NULL,
    "shares" DOUBLE PRECISION NOT NULL,
    "costBasis" DOUBLE PRECISION NOT NULL,
    "purchaseDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxLot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "shares" DOUBLE PRECISION,
    "price" DOUBLE PRECISION,
    "amount" DOUBLE PRECISION NOT NULL,
    "fees" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "executedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "WatchlistItem" (
    "id" TEXT NOT NULL,
    "watchlistId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "targetPrice" DOUBLE PRECISION,
    "notes" TEXT,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WatchlistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "symbol" TEXT,
    "type" TEXT NOT NULL,
    "condition" TEXT NOT NULL,
    "message" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isTriggered" BOOLEAN NOT NULL DEFAULT false,
    "triggeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockQuote" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT,
    "exchange" TEXT,
    "sector" TEXT,
    "industry" TEXT,
    "price" DOUBLE PRECISION NOT NULL,
    "previousClose" DOUBLE PRECISION,
    "open" DOUBLE PRECISION,
    "high" DOUBLE PRECISION,
    "low" DOUBLE PRECISION,
    "volume" INTEGER,
    "avgVolume" INTEGER,
    "marketCap" INTEGER,
    "peRatio" DOUBLE PRECISION,
    "eps" DOUBLE PRECISION,
    "dividend" DOUBLE PRECISION,
    "dividendYield" DOUBLE PRECISION,
    "beta" DOUBLE PRECISION,
    "week52High" DOUBLE PRECISION,
    "week52Low" DOUBLE PRECISION,
    "change" DOUBLE PRECISION,
    "changePercent" DOUBLE PRECISION,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockHistory" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "open" DOUBLE PRECISION NOT NULL,
    "high" DOUBLE PRECISION NOT NULL,
    "low" DOUBLE PRECISION NOT NULL,
    "close" DOUBLE PRECISION NOT NULL,
    "adjClose" DOUBLE PRECISION NOT NULL,
    "volume" INTEGER NOT NULL,

    CONSTRAINT "StockHistory_pkey" PRIMARY KEY ("id")
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

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_token_idx" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "ApiKey_keyHash_idx" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE UNIQUE INDEX "UserSettings_userId_key" ON "UserSettings"("userId");

-- CreateIndex
CREATE INDEX "Portfolio_userId_idx" ON "Portfolio"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Portfolio_userId_name_key" ON "Portfolio"("userId", "name");

-- CreateIndex
CREATE INDEX "Holding_portfolioId_idx" ON "Holding"("portfolioId");

-- CreateIndex
CREATE INDEX "Holding_symbol_idx" ON "Holding"("symbol");

-- CreateIndex
CREATE UNIQUE INDEX "Holding_portfolioId_symbol_key" ON "Holding"("portfolioId", "symbol");

-- CreateIndex
CREATE INDEX "TaxLot_holdingId_idx" ON "TaxLot"("holdingId");

-- CreateIndex
CREATE INDEX "Transaction_portfolioId_idx" ON "Transaction"("portfolioId");

-- CreateIndex
CREATE INDEX "Transaction_userId_idx" ON "Transaction"("userId");

-- CreateIndex
CREATE INDEX "Transaction_symbol_idx" ON "Transaction"("symbol");

-- CreateIndex
CREATE INDEX "Transaction_executedAt_idx" ON "Transaction"("executedAt");

-- CreateIndex
CREATE INDEX "PortfolioSnapshot_portfolioId_idx" ON "PortfolioSnapshot"("portfolioId");

-- CreateIndex
CREATE INDEX "PortfolioSnapshot_snapshotDate_idx" ON "PortfolioSnapshot"("snapshotDate");

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioSnapshot_portfolioId_snapshotDate_key" ON "PortfolioSnapshot"("portfolioId", "snapshotDate");

-- CreateIndex
CREATE INDEX "Watchlist_userId_idx" ON "Watchlist"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Watchlist_userId_name_key" ON "Watchlist"("userId", "name");

-- CreateIndex
CREATE INDEX "WatchlistItem_watchlistId_idx" ON "WatchlistItem"("watchlistId");

-- CreateIndex
CREATE UNIQUE INDEX "WatchlistItem_watchlistId_symbol_key" ON "WatchlistItem"("watchlistId", "symbol");

-- CreateIndex
CREATE INDEX "Alert_userId_idx" ON "Alert"("userId");

-- CreateIndex
CREATE INDEX "Alert_symbol_idx" ON "Alert"("symbol");

-- CreateIndex
CREATE INDEX "Alert_isActive_idx" ON "Alert"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "StockQuote_symbol_key" ON "StockQuote"("symbol");

-- CreateIndex
CREATE INDEX "StockQuote_symbol_idx" ON "StockQuote"("symbol");

-- CreateIndex
CREATE INDEX "StockHistory_symbol_idx" ON "StockHistory"("symbol");

-- CreateIndex
CREATE INDEX "StockHistory_date_idx" ON "StockHistory"("date");

-- CreateIndex
CREATE UNIQUE INDEX "StockHistory_symbol_date_key" ON "StockHistory"("symbol", "date");

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

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSettings" ADD CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Portfolio" ADD CONSTRAINT "Portfolio_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Holding" ADD CONSTRAINT "Holding_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxLot" ADD CONSTRAINT "TaxLot_holdingId_fkey" FOREIGN KEY ("holdingId") REFERENCES "Holding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioSnapshot" ADD CONSTRAINT "PortfolioSnapshot_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Watchlist" ADD CONSTRAINT "Watchlist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchlistItem" ADD CONSTRAINT "WatchlistItem_watchlistId_fkey" FOREIGN KEY ("watchlistId") REFERENCES "Watchlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
