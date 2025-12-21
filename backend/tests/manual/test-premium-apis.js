/**
 * Test Premium API Integration
 * Tests: Finnhub, FMP, Alpha Vantage, News API
 */

const liveDataService = require('../../src/services/liveDataService');

async function testPremiumAPIs() {
  console.log('\n🧪 TESTING PREMIUM API INTEGRATION\n');
  console.log('=' .repeat(60));

  // Test 1: Stock Prices (Finnhub -> FMP -> Yahoo fallback chain)
  console.log('\n📊 TEST 1: Stock Prices (Fallback Chain)');
  console.log('-'.repeat(60));
  try {
    const testSymbols = ['AAPL', 'MSFT', 'GOOGL'];
    console.log(`Fetching prices for: ${testSymbols.join(', ')}`);

    const prices = await liveDataService.getStockPrices(testSymbols);

    for (const symbol of testSymbols) {
      const data = prices[symbol];
      if (data) {
        console.log(`\n${symbol}:`);
        console.log(`  Price: $${data.price.toFixed(2)}`);
        console.log(`  Change: ${data.change > 0 ? '+' : ''}${data.change.toFixed(2)} (${data.changePercent.toFixed(2)}%)`);
        console.log(`  High/Low: $${data.high?.toFixed(2)} / $${data.low?.toFixed(2)}`);
        console.log(`  Source: ${data.source}`);
        console.log('  ✅ SUCCESS');
      } else {
        console.log(`\n${symbol}: ❌ FAILED - No data`);
      }
    }
  } catch (error) {
    console.error('❌ ERROR:', error.message);
  }

  // Test 2: Crypto Prices (CoinGecko)
  console.log('\n\n💰 TEST 2: Crypto Prices');
  console.log('-'.repeat(60));
  try {
    const cryptoSymbols = ['BTC', 'ETH', 'SOL'];
    console.log(`Fetching crypto for: ${cryptoSymbols.join(', ')}`);

    const cryptoPrices = await liveDataService.getCryptoPrices(cryptoSymbols);

    for (const symbol of cryptoSymbols) {
      const data = cryptoPrices[symbol];
      if (data) {
        console.log(`\n${symbol}:`);
        console.log(`  Price: $${data.price.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
        console.log(`  24h Change: ${data.change24h > 0 ? '+' : ''}${data.change24h.toFixed(2)}%`);
        console.log(`  Source: ${data.source}`);
        console.log('  ✅ SUCCESS');
      } else {
        console.log(`\n${symbol}: ❌ FAILED - No data`);
      }
    }
  } catch (error) {
    console.error('❌ ERROR:', error.message);
  }

  // Test 3: Forex Rates
  console.log('\n\n💵 TEST 3: Forex Rates');
  console.log('-'.repeat(60));
  try {
    const forexData = await liveDataService.getForexRates('USD');

    console.log(`Base Currency: ${forexData.base}`);
    console.log(`Source: ${forexData.source}`);
    console.log('\nMajor Rates:');

    const majorCurrencies = ['EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF'];
    majorCurrencies.forEach(currency => {
      const rate = forexData.rates[currency];
      if (rate) {
        console.log(`  ${currency}: ${rate.toFixed(4)}`);
      }
    });
    console.log('  ✅ SUCCESS');
  } catch (error) {
    console.error('❌ ERROR:', error.message);
  }

  // Test 4: Company Information (Alpha Vantage -> FMP)
  console.log('\n\n🏢 TEST 4: Company Information');
  console.log('-'.repeat(60));
  try {
    const symbol = 'AAPL';
    console.log(`Fetching company info for: ${symbol}`);

    const companyInfo = await liveDataService.getCompanyInfo(symbol);

    if (companyInfo && companyInfo.symbol) {
      console.log(`\nCompany: ${companyInfo.name}`);
      console.log(`Sector: ${companyInfo.sector}`);
      console.log(`Industry: ${companyInfo.industry}`);
      console.log(`Market Cap: $${(companyInfo.marketCap / 1e9).toFixed(2)}B`);
      console.log(`P/E Ratio: ${companyInfo.peRatio?.toFixed(2)}`);
      console.log(`Dividend Yield: ${companyInfo.dividendYield?.toFixed(2)}%`);
      console.log(`Beta: ${companyInfo.beta?.toFixed(2)}`);
      console.log(`52-Week Range: $${companyInfo.fiftyTwoWeekLow?.toFixed(2)} - $${companyInfo.fiftyTwoWeekHigh?.toFixed(2)}`);
      console.log(`Source: ${companyInfo.source}`);
      console.log('✅ SUCCESS');
    } else {
      console.log('❌ FAILED - No data received');
    }
  } catch (error) {
    console.error('❌ ERROR:', error.message);
  }

  // Test 5: Dividend Data
  console.log('\n\n💸 TEST 5: Dividend Data');
  console.log('-'.repeat(60));
  try {
    const dividendSymbols = ['AAPL', 'MSFT'];
    console.log(`Fetching dividends for: ${dividendSymbols.join(', ')}`);

    const dividends = await liveDataService.getDividendData(dividendSymbols);

    for (const symbol of dividendSymbols) {
      const data = dividends[symbol];
      if (data) {
        console.log(`\n${symbol}:`);
        console.log(`  Annual Dividend: $${data.annualDividend?.toFixed(2)}`);
        console.log(`  Yield: ${data.yield?.toFixed(2)}%`);
        console.log(`  Source: ${data.source}`);
        console.log('  ✅ SUCCESS');
      } else {
        console.log(`\n${symbol}: ⚠️  No dividend data`);
      }
    }
  } catch (error) {
    console.error('❌ ERROR:', error.message);
  }

  // Test 6: Market News
  console.log('\n\n📰 TEST 6: Market News');
  console.log('-'.repeat(60));
  try {
    console.log('Fetching latest market news...');

    const news = await liveDataService.getMarketNews({
      query: 'AAPL,MSFT,GOOGL',
      pageSize: 5
    });

    if (news && news.length > 0) {
      console.log(`\nFound ${news.length} articles:\n`);

      news.slice(0, 3).forEach((article, index) => {
        console.log(`${index + 1}. ${article.title}`);
        console.log(`   Source: ${article.source}`);
        console.log(`   Sentiment: ${article.sentiment}`);
        console.log(`   Published: ${new Date(article.publishedAt).toLocaleString()}`);
        console.log();
      });
      console.log('✅ SUCCESS');
    } else {
      console.log('⚠️  No news articles found (API may need configuration)');
    }
  } catch (error) {
    console.error('❌ ERROR:', error.message);
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('✅ PREMIUM API INTEGRATION TEST COMPLETE');
  console.log('='.repeat(60));
  console.log('\nAPI Sources:');
  console.log('  • Stock Prices: Finnhub → FMP → Yahoo Finance');
  console.log('  • Company Info: Alpha Vantage → FMP');
  console.log('  • Crypto: CoinGecko');
  console.log('  • Forex: ExchangeRate-API');
  console.log('  • News: Market AUX (News API)');
  console.log('  • Dividends: Yahoo Finance');
  console.log('\nAll services use 60-second caching for optimal performance.\n');
}

// Run tests
testPremiumAPIs().catch(console.error);
