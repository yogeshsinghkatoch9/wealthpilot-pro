/**
 * Seed script to populate sector data from APIs
 * Run with: node src/scripts/seedSectorData.js
 */

const sectorService = require('../services/advanced/sectorAnalysis');

const logger = require('../utils/logger');
async function seedSectorData() {
  logger.debug('🌱 Starting sector data seeding...\n');

  try {
    // Step 1: Update all sector data from Financial Modeling Prep
    logger.debug('📊 Fetching sector data from Financial Modeling Prep...');
    const updateResult = await sectorService.updateAllSectorData();

    if (updateResult.success) {
      logger.debug(`✅ Updated ${updateResult.updated.length} sectors:`);
      updateResult.updated.forEach(code => logger.debug(`   - ${code}`));
    } else {
      logger.debug(`❌ Error updating sector data: ${updateResult.error}`);
    }

    // Step 2: Fetch real-time performance from Alpha Vantage
    logger.debug('\n📈 Fetching real-time sector performance from Alpha Vantage...');
    const avData = await sectorService.fetchAlphaVantageSectorPerformance();

    if (avData) {
      logger.debug(`✅ Fetched performance for ${avData.length} sectors from Alpha Vantage`);
    } else {
      logger.warn('⚠️  Alpha Vantage API limit may be reached');
    }

    // Step 3: Update historical performance from Polygon.io
    logger.debug('\n📉 Fetching historical performance from Polygon.io (this may take a while due to rate limits)...');
    logger.debug('⏳ Please wait... (approximately 2-3 minutes)');

    const historyResult = await sectorService.updateSectorPerformanceHistory(90);

    if (historyResult.success) {
      logger.debug(`✅ Updated historical data for ${historyResult.updated.length} sectors`);
    } else {
      logger.debug(`❌ Error updating historical data: ${historyResult.error}`);
    }

    // Step 4: Verify data
    logger.debug('\n🔍 Verifying seeded data...');
    const allSectors = await sectorService.getAllSectors();
    logger.debug(`✅ Database contains ${allSectors.length} sectors with current data`);

    logger.debug('\n🎉 Sector data seeding complete!\n');
    logger.debug('📍 You can now visit http://localhost:3000/sector-analysis to view the data\n');

    process.exit(0);
  } catch (error) {
    logger.error('\n❌ Error during seeding:', error);
    process.exit(1);
  }
}

// Run the seed function
seedSectorData();
