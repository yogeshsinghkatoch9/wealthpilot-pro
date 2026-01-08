/**
 * Options Strategy Engine
 * Client-side calculations for options strategy analysis
 * Includes simplified Black-Scholes and payoff calculations
 */

class OptionsStrategyEngine {
  constructor() {
    this.currentSymbol = 'AAPL';
    this.currentPrice = 185.50;
    this.selectedOutlook = 'bullish';
    this.selectedRisk = 'moderate';
    this.selectedStrategy = null;
    this.payoffChart = null;

    // Strategy definitions
    this.strategies = {
      bullish: {
        conservative: ['covered_call', 'collar'],
        moderate: ['call_spread', 'synthetic_long'],
        aggressive: ['long_call', 'call_spread']
      },
      bearish: {
        conservative: ['protective_put', 'collar'],
        moderate: ['put_spread', 'bear_call_spread'],
        aggressive: ['long_put', 'bear_call_spread']
      },
      neutral: {
        conservative: ['iron_condor', 'butterfly'],
        moderate: ['calendar_spread', 'iron_condor'],
        aggressive: ['straddle', 'strangle']
      },
      highvol: {
        conservative: ['iron_butterfly', 'iron_condor'],
        moderate: ['short_straddle', 'iron_butterfly'],
        aggressive: ['short_strangle', 'ratio_spread']
      }
    };

    // Strategy metadata
    this.strategyMeta = {
      covered_call: {
        name: 'Covered Call',
        description: 'Own stock + sell call',
        legs: 2,
        complexity: 'Easy',
        maxProfitType: 'Limited',
        maxLossType: 'Substantial'
      },
      collar: {
        name: 'Collar',
        description: 'Stock + long put + short call',
        legs: 3,
        complexity: 'Moderate',
        maxProfitType: 'Limited',
        maxLossType: 'Limited'
      },
      call_spread: {
        name: 'Bull Call Spread',
        description: 'Buy lower call, sell higher call',
        legs: 2,
        complexity: 'Easy',
        maxProfitType: 'Limited',
        maxLossType: 'Limited'
      },
      synthetic_long: {
        name: 'Synthetic Long',
        description: 'Long call + short put at same strike',
        legs: 2,
        complexity: 'Moderate',
        maxProfitType: 'Unlimited',
        maxLossType: 'Substantial'
      },
      long_call: {
        name: 'Long Call',
        description: 'Buy a call option',
        legs: 1,
        complexity: 'Easy',
        maxProfitType: 'Unlimited',
        maxLossType: 'Limited'
      },
      protective_put: {
        name: 'Protective Put',
        description: 'Own stock + buy put',
        legs: 2,
        complexity: 'Easy',
        maxProfitType: 'Unlimited',
        maxLossType: 'Limited'
      },
      put_spread: {
        name: 'Bear Put Spread',
        description: 'Buy higher put, sell lower put',
        legs: 2,
        complexity: 'Easy',
        maxProfitType: 'Limited',
        maxLossType: 'Limited'
      },
      bear_call_spread: {
        name: 'Bear Call Spread',
        description: 'Sell lower call, buy higher call',
        legs: 2,
        complexity: 'Easy',
        maxProfitType: 'Limited',
        maxLossType: 'Limited'
      },
      long_put: {
        name: 'Long Put',
        description: 'Buy a put option',
        legs: 1,
        complexity: 'Easy',
        maxProfitType: 'Substantial',
        maxLossType: 'Limited'
      },
      iron_condor: {
        name: 'Iron Condor',
        description: 'Put spread + call spread',
        legs: 4,
        complexity: 'Moderate',
        maxProfitType: 'Limited',
        maxLossType: 'Limited'
      },
      butterfly: {
        name: 'Iron Butterfly',
        description: 'ATM straddle + OTM strangle',
        legs: 4,
        complexity: 'Moderate',
        maxProfitType: 'Limited',
        maxLossType: 'Limited'
      },
      calendar_spread: {
        name: 'Calendar Spread',
        description: 'Short near-term, long far-term',
        legs: 2,
        complexity: 'Moderate',
        maxProfitType: 'Limited',
        maxLossType: 'Limited'
      },
      straddle: {
        name: 'Long Straddle',
        description: 'Buy ATM call + put',
        legs: 2,
        complexity: 'Easy',
        maxProfitType: 'Unlimited',
        maxLossType: 'Limited'
      },
      strangle: {
        name: 'Long Strangle',
        description: 'Buy OTM call + put',
        legs: 2,
        complexity: 'Easy',
        maxProfitType: 'Unlimited',
        maxLossType: 'Limited'
      },
      iron_butterfly: {
        name: 'Iron Butterfly',
        description: 'Sell ATM straddle + buy OTM strangle',
        legs: 4,
        complexity: 'Moderate',
        maxProfitType: 'Limited',
        maxLossType: 'Limited'
      },
      short_straddle: {
        name: 'Short Straddle',
        description: 'Sell ATM call + put',
        legs: 2,
        complexity: 'Moderate',
        maxProfitType: 'Limited',
        maxLossType: 'Unlimited'
      },
      short_strangle: {
        name: 'Short Strangle',
        description: 'Sell OTM call + put',
        legs: 2,
        complexity: 'Moderate',
        maxProfitType: 'Limited',
        maxLossType: 'Substantial'
      },
      ratio_spread: {
        name: 'Ratio Spread',
        description: 'Uneven number of options',
        legs: 3,
        complexity: 'Complex',
        maxProfitType: 'Limited',
        maxLossType: 'Unlimited'
      }
    };

    this.init();
  }

  init() {
    console.log('Options Strategy Engine initialized');
    this.attachEventListeners();
    this.updateStrategies();
    this.selectStrategy('call_spread');
  }

  attachEventListeners() {
    // Outlook tabs
    document.querySelectorAll('#outlookTabs .premium-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        document.querySelectorAll('#outlookTabs .premium-tab').forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        this.selectedOutlook = e.target.dataset.outlook;
        this.updateOutlookBadge();
        this.updateStrategies();
      });
    });

    // Risk tabs
    document.querySelectorAll('#riskTabs .premium-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        document.querySelectorAll('#riskTabs .premium-tab').forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        this.selectedRisk = e.target.dataset.risk;
        this.updateStrategies();
      });
    });

    // Fetch quote button
    document.getElementById('fetchQuoteBtn')?.addEventListener('click', () => {
      this.fetchQuote();
    });

    // Symbol input enter key
    document.getElementById('symbolInput')?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.fetchQuote();
      }
    });

    // Analyze button
    document.getElementById('analyzeBtn')?.addEventListener('click', () => {
      this.analyzeStrategies();
    });

    // Chart view tabs
    document.querySelectorAll('[data-view]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('[data-view]').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        this.updateChartView(e.target.dataset.view);
      });
    });

    // Export button
    document.getElementById('exportBtn')?.addEventListener('click', () => {
      this.exportAnalysis();
    });
  }

  updateOutlookBadge() {
    const badge = document.getElementById('strategyOutlookBadge');
    if (!badge) return;

    const outlookConfig = {
      bullish: { text: 'Bullish', class: 'premium-badge-success' },
      bearish: { text: 'Bearish', class: 'premium-badge-danger' },
      neutral: { text: 'Neutral', class: 'premium-badge-neutral' },
      highvol: { text: 'High Volatility', class: 'premium-badge-warning' }
    };

    const config = outlookConfig[this.selectedOutlook] || outlookConfig.bullish;
    badge.textContent = config.text;
    badge.className = `premium-badge ${config.class}`;
  }

  async fetchQuote() {
    const symbolInput = document.getElementById('symbolInput');
    const symbol = symbolInput?.value.toUpperCase() || 'AAPL';

    try {
      // Simulated quote data (in production, fetch from API)
      const mockPrices = {
        'AAPL': 185.50,
        'MSFT': 378.25,
        'GOOGL': 141.80,
        'AMZN': 178.50,
        'TSLA': 248.75,
        'NVDA': 485.60,
        'META': 505.20,
        'SPY': 478.50,
        'QQQ': 405.30,
        'IWM': 198.40
      };

      this.currentSymbol = symbol;
      this.currentPrice = mockPrices[symbol] || (100 + Math.random() * 200);

      document.getElementById('currentSymbol').textContent = this.currentSymbol;
      document.getElementById('currentPrice').textContent = '$' + this.currentPrice.toFixed(2);

      this.updateStrategies();
      if (this.selectedStrategy) {
        this.selectStrategy(this.selectedStrategy);
      }

      this.showToast(`Quote updated: ${symbol} @ $${this.currentPrice.toFixed(2)}`, 'success');
    } catch (error) {
      console.error('Error fetching quote:', error);
      this.showToast('Failed to fetch quote', 'error');
    }
  }

  getRecommendedStrategies(outlook, riskTolerance) {
    const strategies = this.strategies[outlook]?.[riskTolerance] || [];
    return strategies.map(key => ({
      key,
      ...this.strategyMeta[key],
      ...this.calculateStrategyMetrics(key)
    }));
  }

  calculateStrategyMetrics(strategyKey) {
    const price = this.currentPrice;
    const dte = parseInt(document.getElementById('dteInput')?.value) || 30;
    const iv = (parseFloat(document.getElementById('ivInput')?.value) || 25) / 100;
    const contracts = parseInt(document.getElementById('contractsInput')?.value) || 1;

    // Calculate strikes based on price
    const atmStrike = Math.round(price / 5) * 5;
    const otmCallStrike = atmStrike + 10;
    const otmPutStrike = atmStrike - 10;
    const widthSpread = 5;

    // Simplified premium calculations
    const callPremium = this.calculateBlackScholes(price, atmStrike, dte / 365, iv, 0.0525, 'call');
    const putPremium = this.calculateBlackScholes(price, atmStrike, dte / 365, iv, 0.0525, 'put');
    const otmCallPremium = this.calculateBlackScholes(price, otmCallStrike, dte / 365, iv, 0.0525, 'call');
    const otmPutPremium = this.calculateBlackScholes(price, otmPutStrike, dte / 365, iv, 0.0525, 'put');

    let maxProfit, maxLoss, breakevens, legs;

    switch (strategyKey) {
      case 'call_spread':
        const debitCall = callPremium - otmCallPremium;
        maxProfit = (widthSpread - debitCall) * 100 * contracts;
        maxLoss = debitCall * 100 * contracts;
        breakevens = [atmStrike + debitCall];
        legs = [
          { type: 'call', action: 'buy', strike: atmStrike, premium: callPremium },
          { type: 'call', action: 'sell', strike: otmCallStrike, premium: otmCallPremium }
        ];
        break;

      case 'put_spread':
        const debitPut = putPremium - otmPutPremium;
        maxProfit = (widthSpread - debitPut) * 100 * contracts;
        maxLoss = debitPut * 100 * contracts;
        breakevens = [atmStrike - debitPut];
        legs = [
          { type: 'put', action: 'buy', strike: atmStrike, premium: putPremium },
          { type: 'put', action: 'sell', strike: otmPutStrike, premium: otmPutPremium }
        ];
        break;

      case 'iron_condor':
        const credit = otmCallPremium + otmPutPremium -
                      this.calculateBlackScholes(price, otmCallStrike + 5, dte / 365, iv, 0.0525, 'call') -
                      this.calculateBlackScholes(price, otmPutStrike - 5, dte / 365, iv, 0.0525, 'put');
        maxProfit = credit * 100 * contracts;
        maxLoss = (5 - credit) * 100 * contracts;
        breakevens = [otmPutStrike - credit, otmCallStrike + credit];
        legs = [
          { type: 'put', action: 'buy', strike: otmPutStrike - 5, premium: 0 },
          { type: 'put', action: 'sell', strike: otmPutStrike, premium: otmPutPremium },
          { type: 'call', action: 'sell', strike: otmCallStrike, premium: otmCallPremium },
          { type: 'call', action: 'buy', strike: otmCallStrike + 5, premium: 0 }
        ];
        break;

      case 'straddle':
        const straddleCost = callPremium + putPremium;
        maxProfit = Infinity;
        maxLoss = straddleCost * 100 * contracts;
        breakevens = [atmStrike - straddleCost, atmStrike + straddleCost];
        legs = [
          { type: 'call', action: 'buy', strike: atmStrike, premium: callPremium },
          { type: 'put', action: 'buy', strike: atmStrike, premium: putPremium }
        ];
        break;

      case 'strangle':
        const strangleCost = otmCallPremium + otmPutPremium;
        maxProfit = Infinity;
        maxLoss = strangleCost * 100 * contracts;
        breakevens = [otmPutStrike - strangleCost, otmCallStrike + strangleCost];
        legs = [
          { type: 'call', action: 'buy', strike: otmCallStrike, premium: otmCallPremium },
          { type: 'put', action: 'buy', strike: otmPutStrike, premium: otmPutPremium }
        ];
        break;

      case 'short_straddle':
        const straddleCredit = callPremium + putPremium;
        maxProfit = straddleCredit * 100 * contracts;
        maxLoss = Infinity;
        breakevens = [atmStrike - straddleCredit, atmStrike + straddleCredit];
        legs = [
          { type: 'call', action: 'sell', strike: atmStrike, premium: callPremium },
          { type: 'put', action: 'sell', strike: atmStrike, premium: putPremium }
        ];
        break;

      case 'covered_call':
        maxProfit = (otmCallStrike - price + otmCallPremium) * 100 * contracts;
        maxLoss = (price - otmCallPremium) * 100 * contracts;
        breakevens = [price - otmCallPremium];
        legs = [
          { type: 'stock', action: 'buy', strike: price, premium: 0 },
          { type: 'call', action: 'sell', strike: otmCallStrike, premium: otmCallPremium }
        ];
        break;

      case 'protective_put':
        maxProfit = Infinity;
        maxLoss = (price - otmPutStrike + otmPutPremium) * 100 * contracts;
        breakevens = [price + otmPutPremium];
        legs = [
          { type: 'stock', action: 'buy', strike: price, premium: 0 },
          { type: 'put', action: 'buy', strike: otmPutStrike, premium: otmPutPremium }
        ];
        break;

      case 'long_call':
        maxProfit = Infinity;
        maxLoss = callPremium * 100 * contracts;
        breakevens = [atmStrike + callPremium];
        legs = [
          { type: 'call', action: 'buy', strike: atmStrike, premium: callPremium }
        ];
        break;

      case 'long_put':
        maxProfit = (atmStrike - putPremium) * 100 * contracts;
        maxLoss = putPremium * 100 * contracts;
        breakevens = [atmStrike - putPremium];
        legs = [
          { type: 'put', action: 'buy', strike: atmStrike, premium: putPremium }
        ];
        break;

      case 'bear_call_spread':
        const creditBearCall = callPremium - otmCallPremium;
        maxProfit = creditBearCall * 100 * contracts;
        maxLoss = (widthSpread - creditBearCall) * 100 * contracts;
        breakevens = [atmStrike + creditBearCall];
        legs = [
          { type: 'call', action: 'sell', strike: atmStrike, premium: callPremium },
          { type: 'call', action: 'buy', strike: otmCallStrike, premium: otmCallPremium }
        ];
        break;

      case 'collar':
        maxProfit = (otmCallStrike - price + otmCallPremium - otmPutPremium) * 100 * contracts;
        maxLoss = (price - otmPutStrike - otmCallPremium + otmPutPremium) * 100 * contracts;
        breakevens = [price - otmCallPremium + otmPutPremium];
        legs = [
          { type: 'stock', action: 'buy', strike: price, premium: 0 },
          { type: 'put', action: 'buy', strike: otmPutStrike, premium: otmPutPremium },
          { type: 'call', action: 'sell', strike: otmCallStrike, premium: otmCallPremium }
        ];
        break;

      case 'synthetic_long':
        maxProfit = Infinity;
        maxLoss = atmStrike * 100 * contracts;
        breakevens = [atmStrike + callPremium - putPremium];
        legs = [
          { type: 'call', action: 'buy', strike: atmStrike, premium: callPremium },
          { type: 'put', action: 'sell', strike: atmStrike, premium: putPremium }
        ];
        break;

      case 'iron_butterfly':
      case 'butterfly':
        const butterflyCredit = callPremium + putPremium - otmCallPremium - otmPutPremium;
        maxProfit = butterflyCredit * 100 * contracts;
        maxLoss = (10 - butterflyCredit) * 100 * contracts;
        breakevens = [atmStrike - butterflyCredit, atmStrike + butterflyCredit];
        legs = [
          { type: 'put', action: 'buy', strike: otmPutStrike, premium: otmPutPremium },
          { type: 'put', action: 'sell', strike: atmStrike, premium: putPremium },
          { type: 'call', action: 'sell', strike: atmStrike, premium: callPremium },
          { type: 'call', action: 'buy', strike: otmCallStrike, premium: otmCallPremium }
        ];
        break;

      case 'calendar_spread':
        const nearTermPremium = callPremium * 0.6;
        const farTermPremium = callPremium * 1.2;
        const calendarDebit = farTermPremium - nearTermPremium;
        maxProfit = calendarDebit * 2 * 100 * contracts;
        maxLoss = calendarDebit * 100 * contracts;
        breakevens = [atmStrike - 5, atmStrike + 5];
        legs = [
          { type: 'call', action: 'sell', strike: atmStrike, premium: nearTermPremium, expiry: 'Near' },
          { type: 'call', action: 'buy', strike: atmStrike, premium: farTermPremium, expiry: 'Far' }
        ];
        break;

      case 'short_strangle':
        const strangleCredit = otmCallPremium + otmPutPremium;
        maxProfit = strangleCredit * 100 * contracts;
        maxLoss = Infinity;
        breakevens = [otmPutStrike - strangleCredit, otmCallStrike + strangleCredit];
        legs = [
          { type: 'call', action: 'sell', strike: otmCallStrike, premium: otmCallPremium },
          { type: 'put', action: 'sell', strike: otmPutStrike, premium: otmPutPremium }
        ];
        break;

      case 'ratio_spread':
        const ratioDebit = callPremium - 2 * otmCallPremium;
        maxProfit = (otmCallStrike - atmStrike - ratioDebit) * 100 * contracts;
        maxLoss = Infinity;
        breakevens = [atmStrike + ratioDebit, 2 * otmCallStrike - atmStrike - ratioDebit];
        legs = [
          { type: 'call', action: 'buy', strike: atmStrike, premium: callPremium },
          { type: 'call', action: 'sell', strike: otmCallStrike, premium: otmCallPremium, qty: 2 }
        ];
        break;

      default:
        maxProfit = 500;
        maxLoss = 200;
        breakevens = [atmStrike];
        legs = [];
    }

    const pop = this.calculateProbabilityOfProfit(strategyKey, breakevens, price, iv, dte);
    const riskReward = maxLoss > 0 ? maxProfit / maxLoss : Infinity;

    return {
      maxProfit: isFinite(maxProfit) ? maxProfit : 'Unlimited',
      maxLoss: isFinite(maxLoss) ? maxLoss : 'Unlimited',
      breakevens,
      legs,
      pop,
      riskReward: isFinite(riskReward) ? riskReward : Infinity,
      greeks: this.calculateGreeks(strategyKey, { price, iv, dte, legs })
    };
  }

  calculatePayoff(strategy, strikes, premium, priceRange) {
    const payoffs = [];
    const price = this.currentPrice;
    const metrics = this.calculateStrategyMetrics(strategy);

    // Generate price range
    const minPrice = price * 0.7;
    const maxPrice = price * 1.3;
    const step = (maxPrice - minPrice) / 100;

    for (let p = minPrice; p <= maxPrice; p += step) {
      let payoff = 0;

      metrics.legs.forEach(leg => {
        const intrinsicValue = leg.type === 'call'
          ? Math.max(0, p - leg.strike)
          : leg.type === 'put'
            ? Math.max(0, leg.strike - p)
            : leg.type === 'stock'
              ? p - leg.strike
              : 0;

        const qty = leg.qty || 1;
        const premium = leg.premium || 0;

        if (leg.action === 'buy') {
          payoff += (intrinsicValue - premium) * qty;
        } else {
          payoff += (premium - intrinsicValue) * qty;
        }
      });

      payoffs.push({
        price: p,
        payoff: payoff * 100
      });
    }

    return payoffs;
  }

  calculateGreeks(strategy, params) {
    const { price, iv, dte, legs } = params;
    const T = dte / 365;
    const r = 0.0525;

    let totalDelta = 0;
    let totalGamma = 0;
    let totalTheta = 0;
    let totalVega = 0;
    let totalRho = 0;

    legs.forEach(leg => {
      if (leg.type === 'stock') {
        totalDelta += leg.action === 'buy' ? 1 : -1;
        return;
      }

      const greeks = this.calculateOptionGreeks(price, leg.strike, T, iv, r, leg.type);
      const multiplier = (leg.action === 'buy' ? 1 : -1) * (leg.qty || 1);

      totalDelta += greeks.delta * multiplier;
      totalGamma += greeks.gamma * multiplier;
      totalTheta += greeks.theta * multiplier;
      totalVega += greeks.vega * multiplier;
      totalRho += greeks.rho * multiplier;
    });

    return {
      delta: totalDelta,
      gamma: totalGamma,
      theta: totalTheta,
      vega: totalVega,
      rho: totalRho
    };
  }

  calculateOptionGreeks(S, K, T, sigma, r, type) {
    const d1 = (Math.log(S / K) + (r + sigma * sigma / 2) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);
    const nd1 = this.normalCDF(d1);
    const nd2 = this.normalCDF(d2);
    const npd1 = this.normalPDF(d1);

    const delta = type === 'call' ? nd1 : nd1 - 1;
    const gamma = npd1 / (S * sigma * Math.sqrt(T));
    const theta = (-(S * npd1 * sigma) / (2 * Math.sqrt(T)) -
                   r * K * Math.exp(-r * T) * (type === 'call' ? nd2 : -this.normalCDF(-d2))) / 365;
    const vega = S * npd1 * Math.sqrt(T) / 100;
    const rho = type === 'call'
      ? K * T * Math.exp(-r * T) * nd2 / 100
      : -K * T * Math.exp(-r * T) * this.normalCDF(-d2) / 100;

    return { delta, gamma, theta, vega, rho };
  }

  calculateProbabilityOfProfit(strategy, breakevens, price, iv, dte) {
    const T = dte / 365;
    const annualVol = iv;

    // Simplified probability calculation using normal distribution
    if (breakevens.length === 1) {
      const be = breakevens[0];
      const move = (be - price) / price;
      const zScore = move / (annualVol * Math.sqrt(T));

      // For bullish strategies
      if (strategy.includes('call') || strategy === 'synthetic_long' || strategy === 'covered_call') {
        return (1 - this.normalCDF(zScore)) * 100;
      }
      // For bearish strategies
      return this.normalCDF(zScore) * 100;
    }

    if (breakevens.length === 2) {
      const beLower = Math.min(...breakevens);
      const beUpper = Math.max(...breakevens);
      const zLower = (beLower - price) / (price * annualVol * Math.sqrt(T));
      const zUpper = (beUpper - price) / (price * annualVol * Math.sqrt(T));

      // For neutral strategies (profit between breakevens)
      if (['iron_condor', 'iron_butterfly', 'butterfly', 'short_straddle', 'short_strangle'].includes(strategy)) {
        return (this.normalCDF(zUpper) - this.normalCDF(zLower)) * 100;
      }
      // For volatility strategies (profit outside breakevens)
      return ((1 - this.normalCDF(zUpper)) + this.normalCDF(zLower)) * 100;
    }

    return 50;
  }

  calculateBlackScholes(S, K, T, sigma, r, type) {
    if (T <= 0) return Math.max(0, type === 'call' ? S - K : K - S);

    const d1 = (Math.log(S / K) + (r + sigma * sigma / 2) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);

    if (type === 'call') {
      return S * this.normalCDF(d1) - K * Math.exp(-r * T) * this.normalCDF(d2);
    } else {
      return K * Math.exp(-r * T) * this.normalCDF(-d2) - S * this.normalCDF(-d1);
    }
  }

  normalCDF(x) {
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x) / Math.sqrt(2);

    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

    return 0.5 * (1.0 + sign * y);
  }

  normalPDF(x) {
    return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
  }

  generatePayoffDiagram(strategy) {
    const payoffs = this.calculatePayoff(strategy);
    this.renderPayoffChart(payoffs, strategy);
  }

  renderPayoffChart(payoffs, strategy) {
    const ctx = document.getElementById('payoffChart');
    if (!ctx) return;

    if (this.payoffChart) {
      this.payoffChart.destroy();
    }

    const labels = payoffs.map(p => p.price.toFixed(0));
    const data = payoffs.map(p => p.payoff);

    // Find zero crossing for gradient
    const zeroIndex = data.findIndex((val, i) => i > 0 && data[i - 1] <= 0 && val >= 0) ||
                      data.findIndex((val, i) => i > 0 && data[i - 1] >= 0 && val <= 0);

    this.payoffChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'P&L at Expiration',
          data: data,
          borderColor: '#6366f1',
          borderWidth: 2,
          fill: {
            target: 'origin',
            above: 'rgba(16, 185, 129, 0.15)',
            below: 'rgba(239, 68, 68, 0.15)'
          },
          tension: 0.1,
          pointRadius: 0,
          pointHoverRadius: 6,
          pointHoverBackgroundColor: '#6366f1'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          intersect: false,
          mode: 'index'
        },
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            backgroundColor: 'rgba(15, 15, 17, 0.95)',
            borderColor: 'rgba(99, 102, 241, 0.3)',
            borderWidth: 1,
            titleFont: {
              family: 'Inter',
              size: 12
            },
            bodyFont: {
              family: 'JetBrains Mono',
              size: 13
            },
            padding: 12,
            displayColors: false,
            callbacks: {
              title: (items) => `Stock Price: $${items[0].label}`,
              label: (item) => {
                const val = item.raw;
                const sign = val >= 0 ? '+' : '';
                return `P&L: ${sign}$${val.toFixed(2)}`;
              }
            }
          },
          annotation: {
            annotations: {
              currentPrice: {
                type: 'line',
                xMin: labels.findIndex(l => parseFloat(l) >= this.currentPrice),
                xMax: labels.findIndex(l => parseFloat(l) >= this.currentPrice),
                borderColor: 'rgba(245, 158, 11, 0.7)',
                borderWidth: 2,
                borderDash: [5, 5],
                label: {
                  display: true,
                  content: 'Current',
                  position: 'start',
                  backgroundColor: 'rgba(245, 158, 11, 0.9)',
                  color: '#fff',
                  font: {
                    size: 10
                  }
                }
              },
              zeroLine: {
                type: 'line',
                yMin: 0,
                yMax: 0,
                borderColor: 'rgba(255, 255, 255, 0.2)',
                borderWidth: 1
              }
            }
          }
        },
        scales: {
          x: {
            grid: {
              color: 'rgba(255, 255, 255, 0.05)'
            },
            ticks: {
              color: '#71717a',
              font: {
                family: 'JetBrains Mono',
                size: 10
              },
              maxTicksLimit: 10,
              callback: function(value, index) {
                return '$' + this.getLabelForValue(value);
              }
            }
          },
          y: {
            grid: {
              color: 'rgba(255, 255, 255, 0.05)'
            },
            ticks: {
              color: '#71717a',
              font: {
                family: 'JetBrains Mono',
                size: 10
              },
              callback: function(value) {
                const sign = value >= 0 ? '+' : '';
                return sign + '$' + value.toFixed(0);
              }
            }
          }
        }
      }
    });
  }

  updateStrategies() {
    const strategies = this.getRecommendedStrategies(this.selectedOutlook, this.selectedRisk);
    this.renderStrategyCards(strategies);
    this.updateComparisonTable(strategies);

    if (strategies.length > 0 && !this.selectedStrategy) {
      this.selectStrategy(strategies[0].key);
    }
  }

  renderStrategyCards(strategies) {
    const container = document.getElementById('strategiesGrid');
    if (!container) return;

    container.innerHTML = strategies.map(strategy => `
      <div class="strategy-card cursor-pointer transition-all duration-200 hover:scale-[1.02]
                  ${this.selectedStrategy === strategy.key ? 'ring-2 ring-indigo-500' : ''}"
           data-strategy="${strategy.key}"
           onclick="window.optionsEngine.selectStrategy('${strategy.key}')">
        <div class="stat-card${strategy.pop > 55 ? '-forest' : ''} h-full">
          <div class="flex items-start justify-between mb-3">
            <h4 class="font-semibold text-primary">${strategy.name}</h4>
            <span class="premium-badge premium-badge-${strategy.complexity === 'Easy' ? 'success' : strategy.complexity === 'Moderate' ? 'warning' : 'info'}">
              ${strategy.complexity}
            </span>
          </div>
          <p class="text-sm text-tertiary mb-4">${strategy.description}</p>
          <div class="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p class="text-xs text-tertiary">Max Profit</p>
              <p class="font-mono font-semibold ${strategy.maxProfit === 'Unlimited' ? 'value-positive' : 'text-primary'}">
                ${strategy.maxProfit === 'Unlimited' ? 'Unlimited' : '$' + Math.abs(strategy.maxProfit).toFixed(0)}
              </p>
            </div>
            <div>
              <p class="text-xs text-tertiary">Max Loss</p>
              <p class="font-mono font-semibold ${strategy.maxLoss === 'Unlimited' ? 'value-negative' : 'text-primary'}">
                ${strategy.maxLoss === 'Unlimited' ? 'Unlimited' : '-$' + Math.abs(strategy.maxLoss).toFixed(0)}
              </p>
            </div>
            <div>
              <p class="text-xs text-tertiary">PoP</p>
              <p class="font-mono font-semibold ${strategy.pop > 55 ? 'value-positive' : strategy.pop < 45 ? 'value-negative' : 'text-primary'}">
                ${strategy.pop.toFixed(1)}%
              </p>
            </div>
            <div>
              <p class="text-xs text-tertiary">Legs</p>
              <p class="font-mono font-semibold text-primary">${strategy.legs.length}</p>
            </div>
          </div>
        </div>
      </div>
    `).join('');
  }

  updateComparisonTable(strategies) {
    const tbody = document.getElementById('comparisonTableBody');
    if (!tbody) return;

    tbody.innerHTML = strategies.map(strategy => `
      <tr class="cursor-pointer hover:bg-elevated transition-colors"
          onclick="window.optionsEngine.selectStrategy('${strategy.key}')">
        <td>
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500/20 to-purple-500/20
                        flex items-center justify-center text-xs font-bold text-indigo-400">
              ${strategy.legs.length}L
            </div>
            <div>
              <p class="font-medium text-primary">${strategy.name}</p>
              <p class="text-xs text-tertiary">${strategy.description}</p>
            </div>
          </div>
        </td>
        <td class="text-right font-mono ${strategy.maxProfit === 'Unlimited' ? 'value-positive' : ''}">
          ${strategy.maxProfit === 'Unlimited' ? 'Unlimited' : '+$' + Math.abs(strategy.maxProfit).toFixed(0)}
        </td>
        <td class="text-right font-mono ${strategy.maxLoss === 'Unlimited' ? 'value-negative' : ''}">
          ${strategy.maxLoss === 'Unlimited' ? 'Unlimited' : '-$' + Math.abs(strategy.maxLoss).toFixed(0)}
        </td>
        <td class="text-right font-mono text-secondary">
          ${strategy.breakevens.map(b => '$' + b.toFixed(2)).join(', ')}
        </td>
        <td class="text-right">
          <span class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold
                       ${strategy.pop > 55 ? 'bg-emerald-500/20 text-emerald-400' :
                         strategy.pop < 45 ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400'}">
            ${strategy.pop.toFixed(1)}%
          </span>
        </td>
        <td class="text-right font-mono text-secondary">
          ${strategy.riskReward === Infinity ? 'Inf' : '1:' + strategy.riskReward.toFixed(1)}
        </td>
        <td class="text-center">
          <span class="premium-badge premium-badge-${strategy.complexity === 'Easy' ? 'success' :
                       strategy.complexity === 'Moderate' ? 'warning' : 'info'}">
            ${strategy.complexity}
          </span>
        </td>
        <td class="text-center">
          <button class="premium-btn premium-btn-sm premium-btn-secondary"
                  onclick="event.stopPropagation(); window.optionsEngine.selectStrategy('${strategy.key}')">
            Analyze
          </button>
        </td>
      </tr>
    `).join('');
  }

  selectStrategy(strategyKey) {
    this.selectedStrategy = strategyKey;
    const metrics = this.calculateStrategyMetrics(strategyKey);
    const meta = this.strategyMeta[strategyKey];

    // Update selected strategy name
    document.getElementById('selectedStrategyName').textContent = meta.name;

    // Update metrics display
    document.getElementById('maxProfit').textContent =
      metrics.maxProfit === 'Unlimited' ? 'Unlimited' : '$' + Math.abs(metrics.maxProfit).toFixed(0);
    document.getElementById('maxProfit').className =
      'text-lg font-bold font-mono ' + (metrics.maxProfit === 'Unlimited' || metrics.maxProfit > 0 ? 'value-positive' : 'value-negative');

    document.getElementById('maxLoss').textContent =
      metrics.maxLoss === 'Unlimited' ? 'Unlimited' : '-$' + Math.abs(metrics.maxLoss).toFixed(0);
    document.getElementById('maxLoss').className =
      'text-lg font-bold font-mono ' + (metrics.maxLoss === 'Unlimited' ? 'value-negative' : 'value-negative');

    document.getElementById('breakeven').textContent =
      metrics.breakevens.map(b => '$' + b.toFixed(2)).join(' / ');

    const rrText = metrics.riskReward === Infinity ? 'Unlimited' : '1:' + metrics.riskReward.toFixed(1);
    document.getElementById('riskReward').textContent = rrText;

    // Update PoP
    document.getElementById('popValue').textContent = metrics.pop.toFixed(1) + '%';
    document.getElementById('popBar').style.width = Math.min(100, metrics.pop) + '%';

    // Update Greeks
    document.getElementById('greekDelta').textContent =
      (metrics.greeks.delta >= 0 ? '+' : '') + metrics.greeks.delta.toFixed(3);
    document.getElementById('greekGamma').textContent = metrics.greeks.gamma.toFixed(4);
    document.getElementById('greekTheta').textContent =
      (metrics.greeks.theta >= 0 ? '+' : '') + '$' + metrics.greeks.theta.toFixed(2);
    document.getElementById('greekTheta').className =
      'font-mono font-semibold ' + (metrics.greeks.theta >= 0 ? 'value-positive' : 'value-negative');
    document.getElementById('greekVega').textContent = '$' + metrics.greeks.vega.toFixed(2);
    document.getElementById('greekRho').textContent = '$' + metrics.greeks.rho.toFixed(2);

    // Update position legs
    this.renderPositionLegs(metrics.legs);

    // Generate payoff diagram
    this.generatePayoffDiagram(strategyKey);

    // Update strategy cards visual selection
    document.querySelectorAll('.strategy-card').forEach(card => {
      card.classList.toggle('ring-2', card.dataset.strategy === strategyKey);
      card.classList.toggle('ring-indigo-500', card.dataset.strategy === strategyKey);
    });
  }

  renderPositionLegs(legs) {
    const container = document.getElementById('positionLegs');
    if (!container) return;

    container.innerHTML = legs.map(leg => {
      const actionColor = leg.action === 'buy' ? 'text-emerald-400' : 'text-red-400';
      const actionBg = leg.action === 'buy' ? 'bg-emerald-500/10' : 'bg-red-500/10';
      const typeIcon = leg.type === 'call' ? 'C' : leg.type === 'put' ? 'P' : 'S';
      const qty = leg.qty || 1;

      return `
        <div class="flex items-center justify-between p-3 ${actionBg} rounded-lg border border-subtle">
          <div class="flex items-center gap-3">
            <span class="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center
                        text-xs font-bold ${actionColor}">
              ${typeIcon}
            </span>
            <div>
              <p class="text-sm font-medium text-primary">
                ${leg.action.toUpperCase()} ${qty > 1 ? qty + 'x ' : ''}${leg.type.toUpperCase()}
              </p>
              <p class="text-xs text-tertiary">
                Strike: $${leg.strike?.toFixed(2) || '---'}
                ${leg.expiry ? ` (${leg.expiry})` : ''}
              </p>
            </div>
          </div>
          <div class="text-right">
            <p class="text-sm font-mono ${actionColor}">
              ${leg.action === 'buy' ? '-' : '+'}$${(leg.premium * 100).toFixed(0)}
            </p>
          </div>
        </div>
      `;
    }).join('');
  }

  updateChartView(view) {
    // Different chart views based on selection
    switch (view) {
      case 'payoff':
        this.generatePayoffDiagram(this.selectedStrategy);
        break;
      case 'pnl':
        this.generatePnLChart(this.selectedStrategy);
        break;
      case 'probability':
        this.generateProbabilityChart(this.selectedStrategy);
        break;
    }
  }

  generatePnLChart(strategy) {
    // For now, same as payoff - could add time decay visualization
    this.generatePayoffDiagram(strategy);
  }

  generateProbabilityChart(strategy) {
    const ctx = document.getElementById('payoffChart');
    if (!ctx) return;

    if (this.payoffChart) {
      this.payoffChart.destroy();
    }

    const price = this.currentPrice;
    const iv = (parseFloat(document.getElementById('ivInput')?.value) || 25) / 100;
    const dte = parseInt(document.getElementById('dteInput')?.value) || 30;
    const T = dte / 365;
    const stdDev = price * iv * Math.sqrt(T);

    // Generate probability distribution
    const labels = [];
    const probabilities = [];
    const minPrice = price - 3 * stdDev;
    const maxPrice = price + 3 * stdDev;
    const step = (maxPrice - minPrice) / 100;

    for (let p = minPrice; p <= maxPrice; p += step) {
      labels.push(p.toFixed(0));
      const z = (p - price) / stdDev;
      probabilities.push(this.normalPDF(z) * 100);
    }

    this.payoffChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Probability Distribution',
          data: probabilities,
          borderColor: '#8b5cf6',
          backgroundColor: 'rgba(139, 92, 246, 0.2)',
          fill: true,
          tension: 0.4,
          pointRadius: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(15, 15, 17, 0.95)',
            callbacks: {
              title: (items) => `Price: $${items[0].label}`,
              label: (item) => `Probability: ${item.raw.toFixed(2)}%`
            }
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: {
              color: '#71717a',
              font: { family: 'JetBrains Mono', size: 10 },
              maxTicksLimit: 10,
              callback: function(value) { return '$' + this.getLabelForValue(value); }
            }
          },
          y: {
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: {
              color: '#71717a',
              font: { family: 'JetBrains Mono', size: 10 },
              callback: function(value) { return value.toFixed(1) + '%'; }
            }
          }
        }
      }
    });
  }

  analyzeStrategies() {
    // Refresh all calculations with current parameters
    this.updateStrategies();
    if (this.selectedStrategy) {
      this.selectStrategy(this.selectedStrategy);
    }
    this.showToast('Strategies analyzed', 'success');
  }

  exportAnalysis() {
    const strategies = this.getRecommendedStrategies(this.selectedOutlook, this.selectedRisk);

    let csv = 'Strategy,Max Profit,Max Loss,Breakeven(s),PoP,Risk/Reward,Complexity\n';
    strategies.forEach(s => {
      csv += `"${s.name}",`;
      csv += `"${s.maxProfit === 'Unlimited' ? 'Unlimited' : '$' + s.maxProfit.toFixed(2)}",`;
      csv += `"${s.maxLoss === 'Unlimited' ? 'Unlimited' : '$' + s.maxLoss.toFixed(2)}",`;
      csv += `"${s.breakevens.map(b => '$' + b.toFixed(2)).join(', ')}",`;
      csv += `"${s.pop.toFixed(1)}%",`;
      csv += `"${s.riskReward === Infinity ? 'Inf' : '1:' + s.riskReward.toFixed(1)}",`;
      csv += `"${s.complexity}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `options-strategies-${this.currentSymbol}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);

    this.showToast('Analysis exported', 'success');
  }

  showToast(message, type = 'info') {
    if (typeof window.showToast === 'function') {
      window.showToast(message, type);
    } else {
      console.log(`[${type}] ${message}`);
    }
  }
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  window.optionsEngine = new OptionsStrategyEngine();
});
