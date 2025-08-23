import dataCache from './data-cache.js';

/**
 * Market data processing and volatility calculations
 */
class MarketCalculations {
  
  /**
   * Calculate historical volatility from price data
   */
  static calculateHistoricalVolatility(priceData, period = 30, annualizationFactor = 252) {
    const { prices, dates } = priceData;
    
    if (dates.length < period + 1) {
      throw new Error(`Insufficient data for ${period}-day volatility calculation. Need at least ${period + 1} days.`);
    }

    // Get the most recent prices (sorted dates are most recent first)
    const recentDates = dates.slice(0, period + 1);
    const dailyReturns = [];

    // Calculate daily returns
    for (let i = 0; i < period; i++) {
      const currentDate = recentDates[i];
      const previousDate = recentDates[i + 1];
      
      const currentPrice = prices[currentDate].close;
      const previousPrice = prices[previousDate].close;
      
      const dailyReturn = Math.log(currentPrice / previousPrice);
      dailyReturns.push(dailyReturn);
    }

    // Calculate sample standard deviation
    const meanReturn = dailyReturns.reduce((sum, ret) => sum + ret, 0) / dailyReturns.length;
    const variance = dailyReturns.reduce((sum, ret) => sum + Math.pow(ret - meanReturn, 2), 0) / (dailyReturns.length - 1);
    const dailyVolatility = Math.sqrt(variance);
    
    // Annualize the volatility
    const annualizedVolatility = dailyVolatility * Math.sqrt(annualizationFactor);

    return {
      dailyVolatility,
      annualizedVolatility,
      period,
      dataPoints: dailyReturns.length,
      meanDailyReturn: meanReturn,
      annualizedReturn: meanReturn * annualizationFactor,
      calculationDate: new Date().toISOString()
    };
  }

  /**
   * Calculate multiple volatility periods
   */
  static calculateMultiPeriodVolatility(priceData, periods = [10, 20, 30, 60, 90]) {
    const volatilities = {};
    
    for (const period of periods) {
      try {
        const vol = this.calculateHistoricalVolatility(priceData, period);
        volatilities[`${period}d`] = vol;
      } catch (error) {
        console.warn(`Could not calculate ${period}-day volatility: ${error.message}`);
        volatilities[`${period}d`] = null;
      }
    }

    return {
      symbol: priceData.symbol,
      volatilities,
      calculationDate: new Date().toISOString()
    };
  }

  /**
   * Calculate rolling volatility over time
   */
  static calculateRollingVolatility(priceData, window = 30, step = 5) {
    const { prices, dates } = priceData;
    const rollingVolatilities = [];

    // Start from the most recent data and work backwards
    for (let i = 0; i < dates.length - window - 1; i += step) {
      try {
        const windowDates = dates.slice(i, i + window + 1);
        const windowPrices = {};
        
        windowDates.forEach(date => {
          windowPrices[date] = prices[date];
        });
        
        const windowData = {
          prices: windowPrices,
          dates: windowDates
        };
        
        const volatility = this.calculateHistoricalVolatility(windowData, window);
        
        rollingVolatilities.push({
          date: windowDates[0], // Most recent date in window
          volatility: volatility.annualizedVolatility,
          period: window
        });
        
      } catch (error) {
        // Skip this window if insufficient data
        continue;
      }
    }

    return rollingVolatilities;
  }

  /**
   * Calculate correlation between two price series
   */
  static calculateCorrelation(priceData1, priceData2, period = 30) {
    // Find common dates
    const commonDates = priceData1.dates.filter(date => 
      priceData2.dates.includes(date)
    ).slice(0, period + 1);

    if (commonDates.length < period + 1) {
      throw new Error(`Insufficient overlapping data for correlation calculation`);
    }

    const returns1 = [];
    const returns2 = [];

    // Calculate returns for both series
    for (let i = 0; i < period; i++) {
      const currentDate = commonDates[i];
      const previousDate = commonDates[i + 1];
      
      const return1 = Math.log(priceData1.prices[currentDate].close / priceData1.prices[previousDate].close);
      const return2 = Math.log(priceData2.prices[currentDate].close / priceData2.prices[previousDate].close);
      
      returns1.push(return1);
      returns2.push(return2);
    }

    // Calculate correlation coefficient
    const n = returns1.length;
    const mean1 = returns1.reduce((sum, r) => sum + r, 0) / n;
    const mean2 = returns2.reduce((sum, r) => sum + r, 0) / n;
    
    let numerator = 0;
    let sum1Sq = 0;
    let sum2Sq = 0;
    
    for (let i = 0; i < n; i++) {
      const diff1 = returns1[i] - mean1;
      const diff2 = returns2[i] - mean2;
      
      numerator += diff1 * diff2;
      sum1Sq += diff1 * diff1;
      sum2Sq += diff2 * diff2;
    }
    
    const correlation = numerator / Math.sqrt(sum1Sq * sum2Sq);
    
    return {
      correlation,
      period,
      dataPoints: n,
      symbol1: priceData1.symbol,
      symbol2: priceData2.symbol,
      calculationDate: new Date().toISOString()
    };
  }

  /**
   * Calculate beta (systematic risk) relative to market
   */
  static calculateBeta(stockPriceData, marketPriceData, period = 60) {
    // Calculate correlation and volatilities
    const correlation = this.calculateCorrelation(stockPriceData, marketPriceData, period);
    const stockVol = this.calculateHistoricalVolatility(stockPriceData, period);
    const marketVol = this.calculateHistoricalVolatility(marketPriceData, period);
    
    // Beta = Correlation * (Stock Vol / Market Vol)
    const beta = correlation.correlation * (stockVol.annualizedVolatility / marketVol.annualizedVolatility);
    
    return {
      beta,
      correlation: correlation.correlation,
      stockVolatility: stockVol.annualizedVolatility,
      marketVolatility: marketVol.annualizedVolatility,
      period,
      stock: stockPriceData.symbol,
      market: marketPriceData.symbol,
      calculationDate: new Date().toISOString()
    };
  }

  /**
   * Detect volatility regime (low, medium, high)
   */
  static detectVolatilityRegime(volatility, thresholds = { low: 0.15, medium: 0.25, high: 0.40 }) {
    if (volatility < thresholds.low) {
      return { regime: 'low', description: 'Low volatility environment', level: volatility };
    } else if (volatility < thresholds.medium) {
      return { regime: 'medium', description: 'Normal volatility environment', level: volatility };
    } else if (volatility < thresholds.high) {
      return { regime: 'high', description: 'High volatility environment', level: volatility };
    } else {
      return { regime: 'extreme', description: 'Extreme volatility environment', level: volatility };
    }
  }

  /**
   * Calculate Value at Risk (VaR) from price returns
   */
  static calculateVaR(priceData, confidence = 0.05, period = 30, holdingPeriod = 1) {
    const { prices, dates } = priceData;
    
    if (dates.length < period + 1) {
      throw new Error(`Insufficient data for VaR calculation`);
    }

    // Calculate daily returns
    const returns = [];
    for (let i = 0; i < period; i++) {
      const currentPrice = prices[dates[i]].close;
      const previousPrice = prices[dates[i + 1]].close;
      const dailyReturn = (currentPrice - previousPrice) / previousPrice;
      returns.push(dailyReturn);
    }

    // Sort returns (worst to best)
    returns.sort((a, b) => a - b);
    
    // Find VaR at confidence level
    const varIndex = Math.floor(confidence * returns.length);
    const var1Day = returns[varIndex];
    
    // Adjust for holding period (square root of time rule)
    const varHoldingPeriod = var1Day * Math.sqrt(holdingPeriod);
    
    // Expected Shortfall (average of losses beyond VaR)
    const tailLosses = returns.slice(0, varIndex);
    const expectedShortfall = tailLosses.reduce((sum, r) => sum + r, 0) / tailLosses.length;
    
    return {
      confidenceLevel: confidence,
      holdingPeriod,
      var: Math.abs(varHoldingPeriod),
      expectedShortfall: Math.abs(expectedShortfall),
      worstReturn: Math.abs(returns[0]),
      bestReturn: returns[returns.length - 1],
      dataPoints: returns.length,
      calculationDate: new Date().toISOString()
    };
  }

  /**
   * Calculate technical indicators
   */
  static calculateTechnicalIndicators(priceData, periods = { sma: 20, rsi: 14 }) {
    const { prices, dates } = priceData;
    const indicators = {};
    
    // Simple Moving Average
    if (dates.length >= periods.sma) {
      const recentPrices = dates.slice(0, periods.sma).map(date => prices[date].close);
      const sma = recentPrices.reduce((sum, price) => sum + price, 0) / periods.sma;
      indicators.sma = {
        value: sma,
        period: periods.sma,
        currentPrice: recentPrices[0],
        relativePosition: (recentPrices[0] - sma) / sma
      };
    }
    
    // Simple RSI calculation
    if (dates.length >= periods.rsi + 1) {
      const returns = [];
      for (let i = 0; i < periods.rsi; i++) {
        const currentPrice = prices[dates[i]].close;
        const previousPrice = prices[dates[i + 1]].close;
        returns.push(currentPrice - previousPrice);
      }
      
      const gains = returns.filter(r => r > 0);
      const losses = returns.filter(r => r < 0).map(r => Math.abs(r));
      
      const avgGain = gains.length > 0 ? gains.reduce((sum, g) => sum + g, 0) / periods.rsi : 0;
      const avgLoss = losses.length > 0 ? losses.reduce((sum, l) => sum + l, 0) / periods.rsi : 0;
      
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      const rsi = 100 - (100 / (1 + rs));
      
      indicators.rsi = {
        value: rsi,
        period: periods.rsi,
        interpretation: rsi > 70 ? 'Overbought' : rsi < 30 ? 'Oversold' : 'Neutral'
      };
    }
    
    return {
      symbol: priceData.symbol,
      indicators,
      calculationDate: new Date().toISOString()
    };
  }

  /**
   * Comprehensive market analysis
   */
  static async performMarketAnalysis(priceData, marketData = null) {
    const analysis = {
      symbol: priceData.symbol,
      timestamp: new Date().toISOString()
    };

    try {
      // Multi-period volatility
      analysis.volatility = this.calculateMultiPeriodVolatility(priceData);
      
      // Current volatility regime
      const currentVol = analysis.volatility.volatilities['30d']?.annualizedVolatility;
      if (currentVol) {
        analysis.volatilityRegime = this.detectVolatilityRegime(currentVol);
      }
      
      // VaR analysis
      analysis.riskMetrics = this.calculateVaR(priceData);
      
      // Technical indicators
      analysis.technicalIndicators = this.calculateTechnicalIndicators(priceData);
      
      // Beta calculation (if market data provided)
      if (marketData) {
        try {
          analysis.beta = this.calculateBeta(priceData, marketData);
        } catch (error) {
          console.warn('Could not calculate beta:', error.message);
        }
      }
      
      // Rolling volatility trend
      analysis.volatilityTrend = this.calculateRollingVolatility(priceData, 30, 10).slice(0, 10);
      
      return analysis;
      
    } catch (error) {
      console.error('Error in market analysis:', error.message);
      throw error;
    }
  }

  /**
   * Format analysis results for display
   */
  static formatAnalysisResults(analysis) {
    let report = `# Market Analysis: ${analysis.symbol}\n\n`;
    
    // Volatility Summary
    if (analysis.volatility) {
      report += `## Volatility Analysis\n`;
      const vols = analysis.volatility.volatilities;
      
      Object.keys(vols).forEach(period => {
        if (vols[period]) {
          const vol = vols[period];
          report += `- **${period} Volatility**: ${(vol.annualizedVolatility * 100).toFixed(1)}%\n`;
        }
      });
      
      if (analysis.volatilityRegime) {
        report += `- **Current Regime**: ${analysis.volatilityRegime.description}\n`;
      }
      
      report += `\n`;
    }
    
    // Risk Metrics
    if (analysis.riskMetrics) {
      const risk = analysis.riskMetrics;
      report += `## Risk Metrics\n`;
      report += `- **1-Day VaR (95%)**: ${(risk.var * 100).toFixed(2)}%\n`;
      report += `- **Expected Shortfall**: ${(risk.expectedShortfall * 100).toFixed(2)}%\n`;
      report += `- **Worst Historical Return**: ${(risk.worstReturn * 100).toFixed(2)}%\n\n`;
    }
    
    // Technical Indicators
    if (analysis.technicalIndicators?.indicators) {
      const indicators = analysis.technicalIndicators.indicators;
      report += `## Technical Analysis\n`;
      
      if (indicators.sma) {
        const sma = indicators.sma;
        report += `- **20-Day SMA**: $${sma.value.toFixed(2)} (Current: ${(sma.relativePosition * 100).toFixed(1)}% ${sma.relativePosition > 0 ? 'above' : 'below'})\n`;
      }
      
      if (indicators.rsi) {
        const rsi = indicators.rsi;
        report += `- **RSI (14)**: ${rsi.value.toFixed(1)} (${rsi.interpretation})\n`;
      }
      
      report += `\n`;
    }
    
    // Beta Analysis
    if (analysis.beta) {
      const beta = analysis.beta;
      report += `## Systematic Risk\n`;
      report += `- **Beta vs ${beta.market}**: ${beta.beta.toFixed(2)}\n`;
      report += `- **Correlation**: ${(beta.correlation * 100).toFixed(1)}%\n\n`;
    }
    
    return report;
  }
}

export default MarketCalculations;