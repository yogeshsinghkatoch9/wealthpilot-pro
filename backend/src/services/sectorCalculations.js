/**
 * Sector Rotation Calculation Engine
 * Pure calculation functions for financial indicators
 * All formulas based on professional trading standards
 */

class SectorCalculations {
  /**
   * Calculate Rate of Change (ROC) - Momentum indicator
   * @param {Array} priceData - Array of {date, close} objects sorted by date (oldest first)
   * @param {number} periods - Lookback period (5, 20, 50, 200)
   * @returns {number} ROC percentage
   */
  static calculateROC(priceData, periods) {
    if (!priceData || priceData.length < periods + 1) {
      return 0;
    }

    const currentPrice = priceData[priceData.length - 1].close;
    const pastPrice = priceData[priceData.length - 1 - periods].close;

    if (!pastPrice || pastPrice === 0) return 0;

    return ((currentPrice - pastPrice) / pastPrice) * 100;
  }

  /**
   * Calculate Relative Strength Index (RSI)
   * @param {Array} priceData - Array of {date, close} objects
   * @param {number} periods - Typically 14
   * @returns {number} RSI value (0-100)
   */
  static calculateRSI(priceData, periods = 14) {
    if (!priceData || priceData.length < periods + 1) {
      return 50; // Neutral
    }

    let gains = 0;
    let losses = 0;

    // Calculate gains and losses
    for (let i = priceData.length - periods; i < priceData.length; i++) {
      const change = priceData[i].close - priceData[i - 1].close;
      if (change > 0) {
        gains += change;
      } else {
        losses += Math.abs(change);
      }
    }

    const avgGain = gains / periods;
    const avgLoss = losses / periods;

    if (avgLoss === 0) return 100; // All gains, fully overbought

    const rs = avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));

    return parseFloat(rsi.toFixed(2));
  }

  /**
   * Calculate Money Flow Index (MFI) - Volume-weighted RSI
   * @param {Array} priceData - Array of {date, high, low, close, volume} objects
   * @param {number} periods - Typically 14
   * @returns {number} MFI value (0-100)
   */
  static calculateMFI(priceData, periods = 14) {
    if (!priceData || priceData.length < periods + 1) {
      return 50; // Neutral
    }

    let positiveFlow = 0;
    let negativeFlow = 0;

    for (let i = priceData.length - periods; i < priceData.length; i++) {
      const bar = priceData[i];
      const prevBar = priceData[i - 1];

      // Calculate typical price
      const typicalPrice = (bar.high + bar.low + bar.close) / 3;
      const prevTypicalPrice = (prevBar.high + prevBar.low + prevBar.close) / 3;

      // Calculate raw money flow
      const rawMoneyFlow = typicalPrice * bar.volume;

      // Classify as positive or negative flow
      if (typicalPrice > prevTypicalPrice) {
        positiveFlow += rawMoneyFlow;
      } else if (typicalPrice < prevTypicalPrice) {
        negativeFlow += rawMoneyFlow;
      }
    }

    if (negativeFlow === 0) return 100; // All positive flow

    const moneyRatio = positiveFlow / negativeFlow;
    const mfi = 100 - (100 / (1 + moneyRatio));

    return parseFloat(mfi.toFixed(2));
  }

  /**
   * Calculate Relative Strength vs Benchmark (S&P 500)
   * @param {Array} sectorData - Sector price data
   * @param {Array} benchmarkData - Benchmark (SPY) price data
   * @param {number} periods - Lookback period
   * @returns {number} Relative strength percentage
   */
  static calculateRelativeStrength(sectorData, benchmarkData, periods = 20) {
    if (!sectorData || !benchmarkData ||
        sectorData.length < periods || benchmarkData.length < periods) {
      return 0;
    }

    const sectorReturn = this.calculateROC(sectorData, periods);
    const benchmarkReturn = this.calculateROC(benchmarkData, periods);

    // Relative strength = sector return - benchmark return
    return parseFloat((sectorReturn - benchmarkReturn).toFixed(2));
  }

  /**
   * Calculate Money Flow (volume × price change)
   * @param {Array} priceData - Array of {date, close, volume} objects
   * @param {number} periods - Lookback period (5 or 20 days typical)
   * @returns {number} Money flow score
   */
  static calculateMoneyFlow(priceData, periods = 5) {
    if (!priceData || priceData.length < periods + 1) {
      return 0;
    }

    let totalFlow = 0;

    for (let i = priceData.length - periods; i < priceData.length; i++) {
      const bar = priceData[i];
      const prevBar = priceData[i - 1];

      const priceChange = ((bar.close - prevBar.close) / prevBar.close) * 100;
      const volumeRatio = bar.volume / prevBar.volume;

      // Money flow = volume ratio × price change
      const flow = volumeRatio * priceChange;
      totalFlow += flow;
    }

    return parseFloat((totalFlow / periods).toFixed(2));
  }

  /**
   * Determine Economic Cycle Phase based on sector performance
   * @param {Object} sectorPerformance - Object with sector performance data
   * @returns {Object} {phase, phaseName, confidence, favoredSectors}
   */
  static determineEconomicCycle(sectorPerformance) {
    // Defensive sectors: XLP (staples), XLU (utilities), XLV (healthcare)
    const defensiveAvg = (
      sectorPerformance.XLP +
      sectorPerformance.XLU +
      sectorPerformance.XLV
    ) / 3;

    // Cyclical sectors: XLY (discretionary), XLI (industrials), XLF (financials)
    const cyclicalAvg = (
      sectorPerformance.XLY +
      sectorPerformance.XLI +
      sectorPerformance.XLF
    ) / 3;

    // Commodity/Late cycle: XLE (energy), XLB (materials)
    const commodityAvg = (
      sectorPerformance.XLE +
      sectorPerformance.XLB
    ) / 2;

    // Technology
    const techPerf = sectorPerformance.XLK || 0;

    // Determine phase
    if (cyclicalAvg > defensiveAvg && techPerf > 0 && cyclicalAvg > commodityAvg) {
      // Early to Mid Cycle: Cyclicals outperforming, tech positive
      if (techPerf > cyclicalAvg) {
        return {
          phase: 'mid',
          phaseName: 'Mid Cycle',
          confidence: 'high',
          favoredSectors: ['Technology', 'Industrials', 'Financials'],
          description: 'Strong growth, business investment high'
        };
      } else {
        return {
          phase: 'early',
          phaseName: 'Early Cycle',
          confidence: 'medium',
          favoredSectors: ['Financials', 'Consumer Discretionary', 'Industrials', 'Technology'],
          description: 'Recovery underway, consumer spending rising'
        };
      }
    } else if (commodityAvg > cyclicalAvg && commodityAvg > defensiveAvg) {
      // Late Cycle: Commodities outperforming
      return {
        phase: 'late',
        phaseName: 'Late Cycle',
        confidence: 'medium',
        favoredSectors: ['Energy', 'Materials', 'Industrials'],
        description: 'Growth slowing, inflation rising'
      };
    } else {
      // Recession/Defensive: Defensive sectors outperforming
      return {
        phase: 'recession',
        phaseName: 'Recession',
        confidence: defensiveAvg - cyclicalAvg > 5 ? 'high' : 'medium',
        favoredSectors: ['Consumer Staples', 'Utilities', 'Healthcare'],
        description: 'Economic contraction, seeking safety'
      };
    }
  }

  /**
   * Generate Rotation Signal based on multiple indicators
   * @param {Object} metrics - {roc5, roc20, rsi, mfi, relativeStrength}
   * @returns {Object} {signal, strength, reason}
   */
  static generateRotationSignal(metrics) {
    const { roc5, roc20, rsi, mfi, relativeStrength } = metrics;

    let score = 0;
    const reasons = [];

    // Strong momentum (both short and medium term positive)
    if (roc5 > 0 && roc20 > 0) {
      score += 2;
      reasons.push('Positive momentum');
    } else if (roc5 < 0 && roc20 < 0) {
      score -= 2;
      reasons.push('Negative momentum');
    }

    // RSI signals
    if (rsi < 30) {
      score += 2;
      reasons.push('Oversold (RSI < 30)');
    } else if (rsi > 70) {
      score -= 2;
      reasons.push('Overbought (RSI > 70)');
    } else if (rsi >= 40 && rsi <= 60) {
      score += 1;
      reasons.push('Neutral RSI');
    }

    // Money flow
    if (mfi > 60) {
      score += 1;
      reasons.push('Strong money inflow');
    } else if (mfi < 40) {
      score -= 1;
      reasons.push('Money outflow');
    }

    // Relative strength vs benchmark
    if (relativeStrength > 5) {
      score += 2;
      reasons.push('Outperforming benchmark');
    } else if (relativeStrength < -5) {
      score -= 2;
      reasons.push('Underperforming benchmark');
    }

    // Generate signal
    let signal, strength;
    if (score >= 5) {
      signal = 'Strong Buy';
      strength = 'strong';
    } else if (score >= 3) {
      signal = 'Buy';
      strength = 'moderate';
    } else if (score >= -2) {
      signal = 'Hold';
      strength = 'neutral';
    } else if (score >= -4) {
      signal = 'Sell';
      strength = 'moderate';
    } else {
      signal = 'Strong Sell';
      strength = 'strong';
    }

    return {
      signal,
      strength,
      score,
      reason: reasons.join(', ')
    };
  }

  /**
   * Identify Rotation Pairs (money moving FROM sector A TO sector B)
   * @param {Array} sectors - Array of sector objects with performance metrics
   * @returns {Array} Array of rotation pair objects
   */
  static identifyRotationPairs(sectors) {
    const rotationPairs = [];

    // Sort sectors by relative strength
    const sortedBySectors = [...sectors].sort((a, b) =>
      b.relativeStrength - a.relativeStrength
    );

    // Top performers (potential inflow targets)
    const topSectors = sortedBySectors.slice(0, 3);

    // Bottom performers (potential outflow sources)
    const bottomSectors = sortedBySectors.slice(-3);

    // Create rotation pairs
    bottomSectors.forEach(fromSector => {
      topSectors.forEach(toSector => {
        const strengthDiff = toSector.relativeStrength - fromSector.relativeStrength;

        // Only create pair if significant difference (>3% for meaningful rotation)
        if (strengthDiff > 3) {
          rotationPairs.push({
            fromSector: fromSector.name,
            fromCode: fromSector.code,
            toSector: toSector.name,
            toCode: toSector.code,
            strengthDifference: parseFloat(strengthDiff.toFixed(2)),
            flowAmount: Math.abs(fromSector.moneyFlow),
            confidence: strengthDiff > 10 ? 'high' : strengthDiff > 6 ? 'medium' : 'low'
          });
        }
      });
    });

    // Sort by strength difference (highest first)
    return rotationPairs.sort((a, b) => b.strengthDifference - a.strengthDifference);
  }
}

module.exports = SectorCalculations;
