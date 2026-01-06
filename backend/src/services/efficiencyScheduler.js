/**
 * Efficiency Data Scheduler
 * Refreshes efficiency data for all holdings at end of trading day (6 PM EST)
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Data freshness threshold (1 day in milliseconds)
const DATA_FRESHNESS_MS = 24 * 60 * 60 * 1000;

// Fetch fresh data from Yahoo Finance API
async function fetchFromYahoo(symbol) {
  try {
    const yahooUrl = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=financialData,defaultKeyStatistics,summaryDetail,assetProfile`;
    const response = await fetch(yahooUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    if (!response.ok) return null;

    const data = await response.json();
    const result = data.quoteSummary?.result?.[0];
    if (!result) return null;

    const profile = result.assetProfile || {};
    const financials = result.financialData || {};
    const keyStats = result.defaultKeyStatistics || {};
    const summary = result.summaryDetail || {};

    const revenue = financials.totalRevenue?.raw || null;
    const employees = profile.fullTimeEmployees || null;
    const netIncome = financials.netIncomeToCommon?.raw || keyStats.netIncomeToCommon?.raw || null;
    const grossProfit = financials.grossProfits?.raw || null;

    return {
      symbol,
      companyName: profile.longName || symbol,
      sector: profile.sector || 'Technology',
      industry: profile.industry || '',
      revenue,
      employees,
      netIncome,
      grossProfit,
      marketCap: summary.marketCap?.raw || null,
      operatingMargin: financials.operatingMargins?.raw || null,
      profitMargin: financials.profitMargins?.raw || null,
      grossMargin: financials.grossMargins?.raw || null,
      revPerEmployee: revenue && employees ? revenue / employees : null,
      profitPerEmployee: netIncome && employees ? netIncome / employees : null,
      grossProfitPerEmployee: grossProfit && employees ? grossProfit / employees : null,
      dataSource: 'yahoo'
    };
  } catch (error) {
    console.error(`[EfficiencyScheduler] Error fetching ${symbol}:`, error.message);
    return null;
  }
}

// Refresh all efficiency data
async function refreshAllEfficiencyData() {
  console.log('[EfficiencyScheduler] Starting daily efficiency data refresh...');

  try {
    // Get all unique symbols from holdings
    const allHoldings = await prisma.holdings.findMany({
      select: { symbol: true },
      distinct: ['symbol']
    });

    const symbols = allHoldings.map(h => h.symbol);
    console.log(`[EfficiencyScheduler] Refreshing ${symbols.length} symbols`);

    let refreshed = 0;
    let failed = 0;

    for (const symbol of symbols) {
      try {
        const freshData = await fetchFromYahoo(symbol);

        if (freshData && freshData.revPerEmployee) {
          await prisma.efficiencyData.upsert({
            where: { symbol: symbol.toUpperCase() },
            update: {
              companyName: freshData.companyName,
              sector: freshData.sector,
              industry: freshData.industry,
              revenue: freshData.revenue,
              employees: freshData.employees,
              netIncome: freshData.netIncome,
              grossProfit: freshData.grossProfit,
              marketCap: freshData.marketCap,
              revPerEmployee: freshData.revPerEmployee,
              profitPerEmployee: freshData.profitPerEmployee,
              grossProfitPerEmployee: freshData.grossProfitPerEmployee,
              operatingMargin: freshData.operatingMargin,
              profitMargin: freshData.profitMargin,
              grossMargin: freshData.grossMargin,
              dataSource: freshData.dataSource,
              fetchedAt: new Date()
            },
            create: {
              symbol: symbol.toUpperCase(),
              companyName: freshData.companyName,
              sector: freshData.sector,
              industry: freshData.industry,
              revenue: freshData.revenue,
              employees: freshData.employees,
              netIncome: freshData.netIncome,
              grossProfit: freshData.grossProfit,
              marketCap: freshData.marketCap,
              revPerEmployee: freshData.revPerEmployee,
              profitPerEmployee: freshData.profitPerEmployee,
              grossProfitPerEmployee: freshData.grossProfitPerEmployee,
              operatingMargin: freshData.operatingMargin,
              profitMargin: freshData.profitMargin,
              grossMargin: freshData.grossMargin,
              dataSource: freshData.dataSource,
              fetchedAt: new Date()
            }
          });
          refreshed++;
        } else {
          failed++;
        }

        // Rate limiting - wait 200ms between requests
        await new Promise(resolve => setTimeout(resolve, 200));

      } catch (err) {
        console.error(`[EfficiencyScheduler] Error refreshing ${symbol}:`, err.message);
        failed++;
      }
    }

    console.log(`[EfficiencyScheduler] Complete: ${refreshed} refreshed, ${failed} failed`);
    return { refreshed, failed, total: symbols.length };

  } catch (error) {
    console.error('[EfficiencyScheduler] Error in refresh:', error);
    throw error;
  }
}

// Calculate next run time (6 PM EST)
function getNextRunTime() {
  const now = new Date();

  // Convert to EST (UTC-5)
  const estOffset = -5 * 60 * 60 * 1000;
  const estNow = new Date(now.getTime() + estOffset + now.getTimezoneOffset() * 60 * 1000);

  // Set to 6 PM EST today
  const targetTime = new Date(estNow);
  targetTime.setHours(18, 0, 0, 0);

  // If we've already passed 6 PM EST, schedule for tomorrow
  if (estNow > targetTime) {
    targetTime.setDate(targetTime.getDate() + 1);
  }

  // Convert back to local time
  const localTarget = new Date(targetTime.getTime() - estOffset - now.getTimezoneOffset() * 60 * 1000);

  return localTarget;
}

// Schedule next run
function scheduleNextRun() {
  const nextRun = getNextRunTime();
  const delay = nextRun.getTime() - Date.now();

  console.log(`[EfficiencyScheduler] Next run scheduled at ${nextRun.toISOString()} (in ${Math.round(delay / 1000 / 60)} minutes)`);

  setTimeout(async () => {
    try {
      await refreshAllEfficiencyData();
    } catch (error) {
      console.error('[EfficiencyScheduler] Scheduled refresh failed:', error);
    }

    // Schedule next run
    scheduleNextRun();
  }, delay);
}

// Start the scheduler
function start() {
  console.log('[EfficiencyScheduler] Starting efficiency data scheduler...');

  // Schedule the daily run at 6 PM EST
  scheduleNextRun();

  console.log('[EfficiencyScheduler] Scheduler started');
}

// Manual refresh endpoint
async function manualRefresh() {
  return refreshAllEfficiencyData();
}

module.exports = {
  start,
  manualRefresh,
  refreshAllEfficiencyData
};
