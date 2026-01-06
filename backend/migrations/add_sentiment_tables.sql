-- Sentiment Analysis Tables Migration
-- Created: 2025-12-15

-- SentimentData table
CREATE TABLE IF NOT EXISTS "SentimentData" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "symbol" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "overallScore" REAL NOT NULL,
    "overallSentiment" TEXT NOT NULL,
    "socialMediaScore" REAL NOT NULL,
    "newsScore" REAL NOT NULL,
    "analystScore" REAL NOT NULL,
    "mentionVolume" INTEGER NOT NULL,
    "correlationScore" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "SentimentData_symbol_date_key" ON "SentimentData"("symbol", "date");
CREATE INDEX IF NOT EXISTS "SentimentData_symbol_idx" ON "SentimentData"("symbol");
CREATE INDEX IF NOT EXISTS "SentimentData_date_idx" ON "SentimentData"("date");
CREATE INDEX IF NOT EXISTS "SentimentData_overallScore_idx" ON "SentimentData"("overallScore");

-- SocialMediaMention table
CREATE TABLE IF NOT EXISTS "SocialMediaMention" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "symbol" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "content" TEXT,
    "sentiment" TEXT NOT NULL,
    "sentimentScore" REAL NOT NULL,
    "author" TEXT,
    "mentions" INTEGER NOT NULL DEFAULT 1,
    "likes" INTEGER,
    "retweets" INTEGER,
    "publishedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "SocialMediaMention_symbol_idx" ON "SocialMediaMention"("symbol");
CREATE INDEX IF NOT EXISTS "SocialMediaMention_platform_idx" ON "SocialMediaMention"("platform");
CREATE INDEX IF NOT EXISTS "SocialMediaMention_publishedAt_idx" ON "SocialMediaMention"("publishedAt");
CREATE INDEX IF NOT EXISTS "SocialMediaMention_sentiment_idx" ON "SocialMediaMention"("sentiment");

-- TrendingTopic table
CREATE TABLE IF NOT EXISTS "TrendingTopic" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "symbol" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "mentionCount" INTEGER NOT NULL,
    "sentiment" TEXT NOT NULL,
    "trendingScore" REAL NOT NULL,
    "date" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "TrendingTopic_symbol_topic_date_key" ON "TrendingTopic"("symbol", "topic", "date");
CREATE INDEX IF NOT EXISTS "TrendingTopic_symbol_idx" ON "TrendingTopic"("symbol");
CREATE INDEX IF NOT EXISTS "TrendingTopic_date_idx" ON "TrendingTopic"("date");
CREATE INDEX IF NOT EXISTS "TrendingTopic_trendingScore_idx" ON "TrendingTopic"("trendingScore");

-- SentimentHistory table
CREATE TABLE IF NOT EXISTS "SentimentHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "symbol" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL,
    "score" REAL NOT NULL,
    "volume" INTEGER NOT NULL,
    "source" TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS "SentimentHistory_symbol_idx" ON "SentimentHistory"("symbol");
CREATE INDEX IF NOT EXISTS "SentimentHistory_timestamp_idx" ON "SentimentHistory"("timestamp");
CREATE INDEX IF NOT EXISTS "SentimentHistory_source_idx" ON "SentimentHistory"("source");
