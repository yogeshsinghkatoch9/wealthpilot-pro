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
