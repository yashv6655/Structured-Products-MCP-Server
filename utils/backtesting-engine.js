import { mean, standardDeviation, quantile } from 'simple-statistics';
import {
  calculateReturns,
  calculatePortfolioReturn,
  calculatePortfolioVolatility,
  calculateSharpeRatio,
  calculateSortinoRatio,
  calculateMaxDrawdown,
  calculateVaR,
  calculateExpectedShortfall
} from './portfolio-math.js';

/**
 * Advanced Portfolio Backtesting Engine
 * Event-driven architecture for realistic portfolio simulation
 * Based on academic research and industry best practices (2024)
 */

/**
 * Portfolio Event Types for Event-Driven Architecture
 */
export const PortfolioEventTypes = {
  REBALANCE: 'rebalance',
  TRADE_EXECUTION: 'trade_execution', 
  DIVIDEND_PAYMENT: 'dividend_payment',
  CORPORATE_ACTION: 'corporate_action',
  MARKET_DATA_UPDATE: 'market_data_update',
  PERFORMANCE_MEASUREMENT: 'performance_measurement'
};

/**
 * Transaction Cost Model
 * Multi-layer cost structure based on academic research
 */
export class TransactionCostModel {
  constructor(config = {}) {
    // Fixed costs (per transaction)
    this.fixedCost = config.fixedCost || 0.0;  // $0 per trade
    
    // Variable costs (basis points of trade value)
    this.variableCostBps = config.variableCostBps || 5.0;  // 5 bps = 0.05%
    
    // Market impact costs (non-linear in trade size)
    this.marketImpactBps = config.marketImpactBps || 2.0;  // 2 bps = 0.02%
    this.marketImpactExponent = config.marketImpactExponent || 0.5;  // Square root law
    
    // Bid-ask spread costs
    this.bidAskSpreadBps = config.bidAskSpreadBps || 3.0;  // 3 bps = 0.03%
    
    // Minimum trade size to avoid excessive fixed costs
    this.minTradeSize = config.minTradeSize || 100;  // $100 minimum
  }
  
  /**
   * Calculate total transaction costs for a trade
   */
  calculateTradeCost(tradeValue, averageDailyVolume = 1000000) {
    if (Math.abs(tradeValue) < this.minTradeSize) {
      return 0;  // Skip very small trades
    }
    
    const absTradeValue = Math.abs(tradeValue);
    
    // Fixed cost component
    const fixedCostAmount = this.fixedCost;
    
    // Variable cost component (linear in trade size)
    const variableCostAmount = absTradeValue * (this.variableCostBps / 10000);
    
    // Market impact cost (non-linear, increases with trade size relative to volume)
    const volumeRatio = absTradeValue / averageDailyVolume;
    const marketImpactAmount = absTradeValue * 
      (this.marketImpactBps / 10000) * 
      Math.pow(volumeRatio, this.marketImpactExponent);
    
    // Bid-ask spread cost (always applies)
    const bidAskCostAmount = absTradeValue * (this.bidAskSpreadBps / 10000);
    
    return {
      fixedCost: fixedCostAmount,
      variableCost: variableCostAmount,
      marketImpact: marketImpactAmount,
      bidAskSpread: bidAskCostAmount,
      totalCost: fixedCostAmount + variableCostAmount + marketImpactAmount + bidAskCostAmount
    };
  }
}

/**
 * Portfolio State Manager
 * Tracks portfolio composition and performance over time
 */
export class PortfolioState {
  constructor(initialCash = 100000, symbols = []) {
    this.cash = initialCash;
    this.totalValue = initialCash;
    this.positions = {};  // symbol -> {shares, avgPrice, currentPrice, value}
    this.symbols = [...symbols];
    this.history = [];
    this.transactions = [];
    this.dividends = [];
    
    // Initialize positions
    symbols.forEach(symbol => {
      this.positions[symbol] = {
        shares: 0,
        avgPrice: 0,
        currentPrice: 0,
        value: 0,
        weight: 0
      };
    });
  }
  
  /**
   * Update market prices for all positions
   */
  updatePrices(priceData, date) {
    let totalValue = this.cash;
    
    // Update position values
    Object.keys(this.positions).forEach(symbol => {
      if (priceData[symbol]) {
        this.positions[symbol].currentPrice = priceData[symbol];
        this.positions[symbol].value = this.positions[symbol].shares * priceData[symbol];
        totalValue += this.positions[symbol].value;
      }
    });
    
    this.totalValue = totalValue;
    
    // Update position weights
    Object.keys(this.positions).forEach(symbol => {
      this.positions[symbol].weight = this.totalValue > 0 ? 
        this.positions[symbol].value / this.totalValue : 0;
    });
    
    // Record snapshot
    this.history.push({
      date: date,
      totalValue: this.totalValue,
      cash: this.cash,
      positions: JSON.parse(JSON.stringify(this.positions))
    });
  }
  
  /**
   * Execute a trade with transaction costs
   */
  executeTrade(symbol, targetValue, currentPrice, transactionCostModel, date) {
    if (!this.positions[symbol]) {
      throw new Error(`Symbol ${symbol} not in portfolio`);
    }
    
    const currentValue = this.positions[symbol].value;
    const tradeValue = targetValue - currentValue;
    
    // Calculate transaction costs
    const costs = transactionCostModel.calculateTradeCost(tradeValue);
    
    // Check if we have enough cash for purchase + costs
    if (tradeValue + costs.totalCost > this.cash) {
      // Reduce trade to available cash
      const availableCash = this.cash - costs.totalCost;
      if (availableCash > 0) {
        const reducedTradeValue = Math.min(tradeValue, availableCash);
        const reducedCosts = transactionCostModel.calculateTradeCost(reducedTradeValue);
        return this.executeTrade(symbol, currentValue + reducedTradeValue, currentPrice, transactionCostModel, date);
      } else {
        // Skip trade if insufficient funds
        return { executed: false, reason: 'insufficient_funds' };
      }
    }
    
    // Execute the trade
    const sharesToTrade = tradeValue / currentPrice;
    const newShares = this.positions[symbol].shares + sharesToTrade;
    
    // Update position
    if (newShares > 0) {
      // Calculate new average price for long positions
      const totalCost = (this.positions[symbol].shares * this.positions[symbol].avgPrice) + 
                       (sharesToTrade * currentPrice);
      this.positions[symbol].avgPrice = totalCost / newShares;
    } else {
      this.positions[symbol].avgPrice = currentPrice;
    }
    
    this.positions[symbol].shares = newShares;
    this.positions[symbol].value = newShares * currentPrice;
    
    // Update cash
    this.cash -= (tradeValue + costs.totalCost);
    
    // Record transaction
    this.transactions.push({
      date: date,
      symbol: symbol,
      shares: sharesToTrade,
      price: currentPrice,
      value: tradeValue,
      costs: costs,
      cashAfter: this.cash
    });
    
    return {
      executed: true,
      shares: sharesToTrade,
      value: tradeValue,
      costs: costs
    };
  }
  
  /**
   * Get current portfolio weights
   */
  getCurrentWeights() {
    const weights = {};
    Object.keys(this.positions).forEach(symbol => {
      weights[symbol] = this.positions[symbol].weight;
    });
    return weights;
  }
  
  /**
   * Get portfolio performance statistics
   */
  getPerformanceStats() {
    if (this.history.length < 2) {
      return null;
    }
    
    // Calculate portfolio returns
    const values = this.history.map(h => h.totalValue);
    const returns = calculateReturns(values, 'percentage');
    const dates = this.history.slice(1).map(h => h.date);
    
    // Calculate cumulative returns
    const cumulativeReturns = returns.reduce((acc, r, i) => {
      if (i === 0) {
        acc.push(1 + r);
      } else {
        acc.push(acc[i - 1] * (1 + r));
      }
      return acc;
    }, []);
    
    // Performance metrics
    const totalReturn = values[values.length - 1] / values[0] - 1;
    const volatility = standardDeviation(returns);
    const sharpeRatio = calculateSharpeRatio(mean(returns), volatility);
    const sortinoRatio = calculateSortinoRatio(mean(returns), returns);
    const maxDrawdownInfo = calculateMaxDrawdown(cumulativeReturns);
    
    // Risk metrics
    const var95 = calculateVaR(returns, 0.95);
    const var99 = calculateVaR(returns, 0.99);
    const es95 = calculateExpectedShortfall(returns, 0.95);
    
    // Calculate total transaction costs
    const totalCosts = this.transactions.reduce((sum, t) => sum + t.costs.totalCost, 0);
    
    return {
      totalReturn: totalReturn,
      annualizedReturn: Math.pow(1 + totalReturn, 252 / returns.length) - 1,
      volatility: volatility,
      annualizedVolatility: volatility * Math.sqrt(252),
      sharpeRatio: sharpeRatio,
      sortinoRatio: sortinoRatio,
      maxDrawdown: maxDrawdownInfo.maxDrawdown,
      var95: var95,
      var99: var99,
      expectedShortfall95: es95,
      totalTransactionCosts: totalCosts,
      transactionCostDrag: totalCosts / values[0],
      numberOfTrades: this.transactions.length,
      returns: returns,
      dates: dates,
      cumulativeReturns: cumulativeReturns,
      portfolioValues: values
    };
  }
}

/**
 * Rebalancing Strategy Interface
 */
export class RebalancingStrategy {
  constructor(targetWeights, frequency = 'monthly', threshold = 0.05) {
    this.targetWeights = { ...targetWeights };
    this.frequency = frequency;  // 'daily', 'weekly', 'monthly', 'quarterly'
    this.threshold = threshold;   // Rebalance when drift exceeds this threshold
    this.lastRebalanceDate = null;
  }
  
  /**
   * Check if rebalancing is needed
   */
  needsRebalancing(currentWeights, date) {
    // Time-based rebalancing check
    if (this.lastRebalanceDate) {
      const daysSinceRebalance = this.getDaysBetween(this.lastRebalanceDate, date);
      const frequencyDays = this.getFrequencyDays();
      
      if (daysSinceRebalance < frequencyDays) {
        // Check threshold-based rebalancing
        return this.checkThresholdRebalancing(currentWeights);
      }
    }
    
    return true;  // Time for scheduled rebalancing
  }
  
  /**
   * Check if weights have drifted beyond threshold
   */
  checkThresholdRebalancing(currentWeights) {
    for (const symbol of Object.keys(this.targetWeights)) {
      const currentWeight = currentWeights[symbol] || 0;
      const targetWeight = this.targetWeights[symbol];
      const drift = Math.abs(currentWeight - targetWeight);
      
      if (drift > this.threshold) {
        return true;
      }
    }
    return false;
  }
  
  /**
   * Get target portfolio value for each symbol
   */
  getTargetValues(totalPortfolioValue) {
    const targetValues = {};
    Object.keys(this.targetWeights).forEach(symbol => {
      targetValues[symbol] = totalPortfolioValue * this.targetWeights[symbol];
    });
    return targetValues;
  }
  
  /**
   * Helper methods
   */
  getFrequencyDays() {
    switch (this.frequency) {
      case 'daily': return 1;
      case 'weekly': return 7;
      case 'monthly': return 30;
      case 'quarterly': return 90;
      default: return 30;
    }
  }
  
  getDaysBetween(date1, date2) {
    const diffTime = Math.abs(new Date(date2) - new Date(date1));
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }
  
  /**
   * Update target weights (for dynamic strategies)
   */
  updateWeights(newWeights) {
    this.targetWeights = { ...newWeights };
  }
}

/**
 * Main Backtesting Engine
 * Event-driven portfolio simulation
 */
export class BacktestingEngine {
  constructor(config = {}) {
    this.initialCash = config.initialCash || 100000;
    this.symbols = config.symbols || [];
    this.transactionCostModel = config.transactionCostModel || new TransactionCostModel();
    this.portfolioState = null;
    this.rebalancingStrategy = null;
    this.historicalData = {};  // symbol -> [{date, price}]
    this.benchmarkData = [];   // [{date, price}] for benchmark
    
    // Event handlers
    this.eventHandlers = {
      [PortfolioEventTypes.REBALANCE]: this.handleRebalance.bind(this),
      [PortfolioEventTypes.MARKET_DATA_UPDATE]: this.handleMarketDataUpdate.bind(this),
      [PortfolioEventTypes.PERFORMANCE_MEASUREMENT]: this.handlePerformanceMeasurement.bind(this)
    };
  }
  
  /**
   * Initialize backtest with strategy and data
   */
  initialize(rebalancingStrategy, historicalData, benchmarkData = null) {
    this.rebalancingStrategy = rebalancingStrategy;
    this.historicalData = historicalData;
    this.benchmarkData = benchmarkData || [];
    this.portfolioState = new PortfolioState(this.initialCash, this.symbols);
    
    // Validate data
    this.validateHistoricalData();
  }
  
  /**
   * Run the backtest simulation
   */
  async runBacktest() {
    if (!this.portfolioState || !this.rebalancingStrategy) {
      throw new Error('Backtest not properly initialized');
    }
    
    // Get all unique dates across all symbols
    const allDates = this.getAllTradingDates();
    
    // Simulate each trading day
    for (const date of allDates) {
      await this.simulateTradingDay(date);
    }
    
    // Generate final performance report
    return this.generatePerformanceReport();
  }
  
  /**
   * Simulate a single trading day
   */
  async simulateTradingDay(date) {
    // Get price data for this date
    const priceData = this.getPriceDataForDate(date);
    
    // Fire market data update event
    await this.fireEvent(PortfolioEventTypes.MARKET_DATA_UPDATE, {
      date: date,
      priceData: priceData
    });
    
    // Check if rebalancing is needed
    const currentWeights = this.portfolioState.getCurrentWeights();
    if (this.rebalancingStrategy.needsRebalancing(currentWeights, date)) {
      await this.fireEvent(PortfolioEventTypes.REBALANCE, {
        date: date,
        priceData: priceData,
        currentWeights: currentWeights
      });
      
      this.rebalancingStrategy.lastRebalanceDate = date;
    }
  }
  
  /**
   * Event Handlers
   */
  async handleMarketDataUpdate(eventData) {
    const { date, priceData } = eventData;
    this.portfolioState.updatePrices(priceData, date);
  }
  
  async handleRebalance(eventData) {
    const { date, priceData } = eventData;
    
    // Get target values for rebalancing
    const targetValues = this.rebalancingStrategy.getTargetValues(this.portfolioState.totalValue);
    
    // Execute trades for each symbol
    for (const symbol of Object.keys(targetValues)) {
      if (priceData[symbol]) {
        this.portfolioState.executeTrade(
          symbol,
          targetValues[symbol],
          priceData[symbol],
          this.transactionCostModel,
          date
        );
      }
    }
  }
  
  async handlePerformanceMeasurement(eventData) {
    // This can be extended for custom performance measurement logic
    return this.portfolioState.getPerformanceStats();
  }
  
  /**
   * Fire an event through the event system
   */
  async fireEvent(eventType, eventData) {
    const handler = this.eventHandlers[eventType];
    if (handler) {
      return await handler(eventData);
    }
  }
  
  /**
   * Utility methods for data processing
   */
  validateHistoricalData() {
    // Check that all symbols have data
    for (const symbol of this.symbols) {
      if (!this.historicalData[symbol] || this.historicalData[symbol].length === 0) {
        throw new Error(`No historical data for symbol: ${symbol}`);
      }
    }
  }
  
  getAllTradingDates() {
    const dateSet = new Set();
    
    // Collect all dates from all symbols
    Object.values(this.historicalData).forEach(symbolData => {
      symbolData.forEach(dataPoint => {
        dateSet.add(dataPoint.date);
      });
    });
    
    // Sort dates chronologically
    return Array.from(dateSet).sort();
  }
  
  getPriceDataForDate(date) {
    const priceData = {};
    
    Object.keys(this.historicalData).forEach(symbol => {
      const dataPoint = this.historicalData[symbol].find(d => d.date === date);
      if (dataPoint) {
        priceData[symbol] = dataPoint.price;
      }
    });
    
    return priceData;
  }
  
  /**
   * Generate comprehensive performance report
   */
  generatePerformanceReport() {
    const portfolioStats = this.portfolioState.getPerformanceStats();
    const benchmarkStats = this.calculateBenchmarkStats();
    
    return {
      portfolio: portfolioStats,
      benchmark: benchmarkStats,
      relativePerformance: this.calculateRelativePerformance(portfolioStats, benchmarkStats),
      transactions: this.portfolioState.transactions,
      finalPositions: this.portfolioState.positions,
      cashRemaining: this.portfolioState.cash,
      totalValue: this.portfolioState.totalValue
    };
  }
  
  calculateBenchmarkStats() {
    if (!this.benchmarkData || this.benchmarkData.length < 2) {
      return null;
    }
    
    const benchmarkPrices = this.benchmarkData.map(d => d.price);
    const benchmarkReturns = calculateReturns(benchmarkPrices, 'percentage');
    const benchmarkTotalReturn = benchmarkPrices[benchmarkPrices.length - 1] / benchmarkPrices[0] - 1;
    
    return {
      totalReturn: benchmarkTotalReturn,
      volatility: standardDeviation(benchmarkReturns),
      sharpeRatio: calculateSharpeRatio(mean(benchmarkReturns), standardDeviation(benchmarkReturns)),
      maxDrawdown: calculateMaxDrawdown(benchmarkPrices.map((p, i) => p / benchmarkPrices[0])).maxDrawdown,
      returns: benchmarkReturns
    };
  }
  
  calculateRelativePerformance(portfolioStats, benchmarkStats) {
    if (!portfolioStats || !benchmarkStats) {
      return null;
    }
    
    return {
      excessReturn: portfolioStats.totalReturn - benchmarkStats.totalReturn,
      trackingError: this.calculateTrackingError(portfolioStats.returns, benchmarkStats.returns),
      informationRatio: this.calculateInformationRatio(portfolioStats.returns, benchmarkStats.returns),
      beta: this.calculateBeta(portfolioStats.returns, benchmarkStats.returns),
      alpha: this.calculateAlpha(portfolioStats, benchmarkStats)
    };
  }
  
  calculateTrackingError(portfolioReturns, benchmarkReturns) {
    if (portfolioReturns.length !== benchmarkReturns.length) {
      return null;
    }
    
    const excessReturns = portfolioReturns.map((r, i) => r - benchmarkReturns[i]);
    return standardDeviation(excessReturns);
  }
  
  calculateInformationRatio(portfolioReturns, benchmarkReturns) {
    const trackingError = this.calculateTrackingError(portfolioReturns, benchmarkReturns);
    if (!trackingError || trackingError === 0) {
      return null;
    }
    
    const excessReturns = portfolioReturns.map((r, i) => r - benchmarkReturns[i]);
    return mean(excessReturns) / trackingError;
  }
  
  calculateBeta(portfolioReturns, benchmarkReturns) {
    if (portfolioReturns.length !== benchmarkReturns.length) {
      return null;
    }
    
    const portfolioMean = mean(portfolioReturns);
    const benchmarkMean = mean(benchmarkReturns);
    
    let covariance = 0;
    let benchmarkVariance = 0;
    
    for (let i = 0; i < portfolioReturns.length; i++) {
      const portfolioDiff = portfolioReturns[i] - portfolioMean;
      const benchmarkDiff = benchmarkReturns[i] - benchmarkMean;
      
      covariance += portfolioDiff * benchmarkDiff;
      benchmarkVariance += benchmarkDiff * benchmarkDiff;
    }
    
    return benchmarkVariance !== 0 ? 
      (covariance / (portfolioReturns.length - 1)) / (benchmarkVariance / (portfolioReturns.length - 1)) : 
      null;
  }
  
  calculateAlpha(portfolioStats, benchmarkStats) {
    const beta = this.calculateBeta(portfolioStats.returns, benchmarkStats.returns);
    if (beta === null) {
      return null;
    }
    
    // Alpha = Portfolio Return - (Risk Free Rate + Beta * (Benchmark Return - Risk Free Rate))
    // Simplified: Alpha ≈ Portfolio Return - Beta * Benchmark Return
    return portfolioStats.totalReturn - (beta * benchmarkStats.totalReturn);
  }
}