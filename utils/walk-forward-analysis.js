import {
  BacktestingEngine,
  RebalancingStrategy,
  TransactionCostModel
} from './backtesting-engine.js';
import {
  optimizeRiskParity as optimizeRiskParityCore,
  blackLittermanOptimization,
  optimizePortfolioMinVariance,
  calculateCovarianceMatrix,
  calculateReturns,
  calculateMarketCapWeights
} from './portfolio-math.js';
import { mean, standardDeviation, quantile } from 'simple-statistics';

/**
 * Walk-Forward Analysis Implementation
 * Gold standard for backtesting validation (2024 research)
 * Prevents overfitting and provides realistic performance estimates
 */

/**
 * Walk-Forward Configuration
 */
export class WalkForwardConfig {
  constructor(config = {}) {
    // Time windows
    this.lookbackWindow = config.lookbackWindow || 252;      // 1 year optimization window
    this.holdoutWindow = config.holdoutWindow || 63;         // 3 months out-of-sample test
    this.stepSize = config.stepSize || 21;                   // 1 month step forward
    this.minHistory = config.minHistory || 126;              // 6 months minimum data
    
    // Optimization settings
    this.optimizationMethod = config.optimizationMethod || 'risk_parity';  // 'mean_variance', 'risk_parity', 'black_litterman'
    this.rebalanceFrequency = config.rebalanceFrequency || 'monthly';
    this.transactionCosts = config.transactionCosts || true;
    
    // Robustness testing
    this.confidenceLevel = config.confidenceLevel || 0.95;
    this.robustnessThreshold = config.robustnessThreshold || 0.5;  // 50% of original performance
    
    // Parameter optimization ranges
    this.parameterRanges = config.parameterRanges || {};
  }
}

/**
 * Walk-Forward Optimization Result
 */
export class WalkForwardResult {
  constructor() {
    this.periods = [];           // Individual test periods
    this.aggregateStats = null;  // Overall performance
    this.robustnessScore = 0;    // Robustness metric
    this.isRobust = false;       // Passes robustness test
    this.bestParameters = null;  // Optimal parameters found
    this.parameterStability = {}; // Parameter consistency across periods
  }
}

/**
 * Walk-Forward Period Result
 */
export class WalkForwardPeriod {
  constructor(startDate, endDate, optimizationWindow, testWindow) {
    this.startDate = startDate;
    this.endDate = endDate;
    this.optimizationWindow = optimizationWindow;
    this.testWindow = testWindow;
    
    this.optimalParameters = null;
    this.inSampleStats = null;
    this.outOfSampleStats = null;
    this.weights = null;
    this.transactionCosts = 0;
    this.success = false;
  }
}

/**
 * Portfolio Strategy Optimizer
 * Finds optimal parameters for different portfolio strategies
 */
export class PortfolioStrategyOptimizer {
  constructor(symbols, historicalData) {
    this.symbols = symbols;
    this.historicalData = historicalData;
  }
  
  /**
   * Optimize portfolio strategy for given data window
   */
  async optimizeStrategy(method, dataWindow, parameterRanges = {}) {
    try {
      switch (method) {
        case 'risk_parity':
          return await this.optimizeRiskParity(dataWindow, parameterRanges);
        case 'mean_variance':
          return await this.optimizeMeanVariance(dataWindow, parameterRanges);
        case 'black_litterman':
          return await this.optimizeBlackLitterman(dataWindow, parameterRanges);
        default:
          throw new Error(`Unknown optimization method: ${method}`);
      }
    } catch (error) {
      console.warn(`Optimization failed for method ${method}:`, error.message);
      return this.getFallbackStrategy();
    }
  }
  
  /**
   * Risk Parity optimization with parameter search
   */
  async optimizeRiskParity(dataWindow, parameterRanges) {
    // Extract returns for the window
    const windowReturns = this.extractReturnsForWindow(dataWindow);
    const covarianceMatrix = calculateCovarianceMatrix(windowReturns);
    
    // Parameter ranges for Risk Parity
    const maxIterationsRange = parameterRanges.maxIterations || [50, 100, 200];
    const toleranceRange = parameterRanges.tolerance || [1e-6, 1e-5, 1e-4];
    
    let bestResult = null;
    let bestScore = -Infinity;
    
    // Grid search over parameters
    for (const maxIterations of maxIterationsRange) {
      for (const tolerance of toleranceRange) {
        try {
          const result = optimizeRiskParityCore(covarianceMatrix, null, maxIterations, tolerance);
          
          if (result.converged) {
            // Score based on risk parity quality and convergence
            const score = result.riskParityScore - (result.iterations / maxIterations) * 0.1;
            
            if (score > bestScore) {
              bestScore = score;
              bestResult = {
                weights: result.weights,
                parameters: { maxIterations, tolerance },
                converged: result.converged,
                iterations: result.iterations,
                riskParityScore: result.riskParityScore,
                score: score
              };
            }
          }
        } catch (error) {
          continue;
        }
      }
    }
    
    return bestResult || this.getFallbackStrategy();
  }
  
  /**
   * Mean-Variance optimization with parameter search
   */
  async optimizeMeanVariance(dataWindow, parameterRanges) {
    const windowReturns = this.extractReturnsForWindow(dataWindow);
    const covarianceMatrix = calculateCovarianceMatrix(windowReturns);
    const expectedReturns = windowReturns.map(returns => mean(returns));
    
    // Parameter ranges
    const targetReturnRange = parameterRanges.targetReturn || 
      this.generateTargetReturnRange(expectedReturns);
    
    let bestResult = null;
    let bestScore = -Infinity;
    
    for (const targetReturn of targetReturnRange) {
      try {
        const weights = optimizePortfolioMinVariance(expectedReturns, covarianceMatrix, targetReturn);
        const portfolioReturn = expectedReturns.reduce((sum, ret, i) => sum + weights[i] * ret, 0);
        const portfolioVol = Math.sqrt(weights.reduce((sum, w, i) => 
          sum + weights.reduce((innerSum, w2, j) => innerSum + w * w2 * covarianceMatrix.get(i, j), 0), 0
        ));
        
        const sharpeRatio = portfolioVol > 0 ? (portfolioReturn - 0.05) / portfolioVol : 0;
        
        if (sharpeRatio > bestScore) {
          bestScore = sharpeRatio;
          bestResult = {
            weights: weights,
            parameters: { targetReturn },
            expectedReturn: portfolioReturn,
            volatility: portfolioVol,
            sharpeRatio: sharpeRatio,
            score: sharpeRatio
          };
        }
      } catch (error) {
        continue;
      }
    }
    
    return bestResult || this.getFallbackStrategy();
  }
  
  /**
   * Black-Litterman optimization (simplified parameter search)
   */
  async optimizeBlackLitterman(dataWindow, parameterRanges) {
    const windowReturns = this.extractReturnsForWindow(dataWindow);
    const covarianceMatrix = calculateCovarianceMatrix(windowReturns);
    
    // Use market cap weights as starting point
    const marketCapWeights = new Array(this.symbols.length).fill(1 / this.symbols.length);
    
    // Parameter ranges
    const tauRange = parameterRanges.tau || [0.01, 0.025, 0.05, 0.1];
    const riskAversionRange = parameterRanges.riskAversion || [1, 3, 5, 10];
    
    let bestResult = null;
    let bestScore = -Infinity;
    
    for (const tau of tauRange) {
      for (const riskAversion of riskAversionRange) {
        try {
          // Simple BL without views for parameter optimization
          const blResult = blackLittermanOptimization(
            marketCapWeights, covarianceMatrix, [], [], tau, riskAversion
          );
          
          if (blResult.weights) {
            const score = blResult.portfolioReturn / blResult.portfolioVolatility;
            
            if (score > bestScore) {
              bestScore = score;
              bestResult = {
                weights: blResult.weights,
                parameters: { tau, riskAversion },
                expectedReturn: blResult.portfolioReturn,
                volatility: blResult.portfolioVolatility,
                score: score
              };
            }
          }
        } catch (error) {
          continue;
        }
      }
    }
    
    return bestResult || this.getFallbackStrategy();
  }
  
  /**
   * Helper methods
   */
  extractReturnsForWindow(dataWindow) {
    const windowReturns = [];
    
    for (const symbol of this.symbols) {
      const symbolData = this.historicalData[symbol];
      const windowData = symbolData.filter(d => 
        new Date(d.date) >= new Date(dataWindow.start) && 
        new Date(d.date) <= new Date(dataWindow.end)
      );
      
      if (windowData.length > 1) {
        const prices = windowData.map(d => d.price);
        const returns = calculateReturns(prices, 'percentage');
        windowReturns.push(returns);
      }
    }
    
    return windowReturns;
  }
  
  generateTargetReturnRange(expectedReturns) {
    const minReturn = Math.min(...expectedReturns);
    const maxReturn = Math.max(...expectedReturns);
    const step = (maxReturn - minReturn) / 5;
    
    const range = [];
    for (let i = 0; i < 6; i++) {
      range.push(minReturn + i * step);
    }
    return range;
  }
  
  getFallbackStrategy() {
    // Equal weight fallback
    const equalWeight = 1 / this.symbols.length;
    return {
      weights: new Array(this.symbols.length).fill(equalWeight),
      parameters: { method: 'equal_weight' },
      score: 0,
      fallback: true
    };
  }
}

/**
 * Main Walk-Forward Analysis Engine
 */
export class WalkForwardAnalysis {
  constructor(config) {
    this.config = new WalkForwardConfig(config);
    this.symbols = [];
    this.historicalData = {};
    this.benchmarkData = [];
    this.optimizer = null;
  }
  
  /**
   * Initialize with data
   */
  initialize(symbols, historicalData, benchmarkData = []) {
    this.symbols = symbols;
    this.historicalData = historicalData;
    this.benchmarkData = benchmarkData;
    this.optimizer = new PortfolioStrategyOptimizer(symbols, historicalData);
    
    this.validateData();
  }
  
  /**
   * Run complete walk-forward analysis
   */
  async runWalkForwardAnalysis() {
    const result = new WalkForwardResult();
    
    // Generate time windows for walk-forward
    const windows = this.generateTimeWindows();
    
    if (windows.length === 0) {
      throw new Error('Insufficient data for walk-forward analysis');
    }
    
    // Process each window
    for (let i = 0; i < windows.length; i++) {
      const window = windows[i];
      
      try {
        const period = await this.processWalkForwardPeriod(window, i);
        result.periods.push(period);
      } catch (error) {
        console.warn(`Walk-forward period ${i} failed:`, error.message);
        // Continue with next period
      }
    }
    
    // Calculate aggregate statistics
    result.aggregateStats = this.calculateAggregateStats(result.periods);
    result.robustnessScore = this.calculateRobustnessScore(result.periods);
    result.isRobust = result.robustnessScore >= this.config.robustnessThreshold;
    result.bestParameters = this.findBestParameters(result.periods);
    result.parameterStability = this.analyzeParameterStability(result.periods);
    
    return result;
  }
  
  /**
   * Process a single walk-forward period
   */
  async processWalkForwardPeriod(window, periodIndex) {
    const period = new WalkForwardPeriod(
      window.optimizationStart,
      window.testEnd,
      window.optimization,
      window.test
    );
    
    try {
      // Step 1: Optimize on in-sample data
      const optimizationResult = await this.optimizer.optimizeStrategy(
        this.config.optimizationMethod,
        window.optimization,
        this.config.parameterRanges
      );
      
      if (!optimizationResult) {
        throw new Error('Optimization failed');
      }
      
      period.optimalParameters = optimizationResult.parameters;
      period.weights = optimizationResult.weights;
      
      // Step 2: Backtest on in-sample data for reference
      const inSampleBacktest = await this.runBacktestForPeriod(
        optimizationResult.weights,
        window.optimization
      );
      period.inSampleStats = inSampleBacktest;
      
      // Step 3: Test on out-of-sample data
      const outOfSampleBacktest = await this.runBacktestForPeriod(
        optimizationResult.weights,
        window.test
      );
      period.outOfSampleStats = outOfSampleBacktest;
      period.transactionCosts = outOfSampleBacktest.totalTransactionCosts;
      
      period.success = true;
      
    } catch (error) {
      period.success = false;
      console.warn(`Period ${periodIndex} failed:`, error.message);
    }
    
    return period;
  }
  
  /**
   * Run backtest for a specific period with given weights
   */
  async runBacktestForPeriod(weights, timeWindow) {
    // Create rebalancing strategy with optimized weights
    const targetWeights = {};
    this.symbols.forEach((symbol, i) => {
      targetWeights[symbol] = weights[i];
    });
    
    const rebalancingStrategy = new RebalancingStrategy(
      targetWeights,
      this.config.rebalanceFrequency
    );
    
    // Create transaction cost model
    const transactionCostModel = this.config.transactionCosts ? 
      new TransactionCostModel() : new TransactionCostModel({ variableCostBps: 0, fixedCost: 0 });
    
    // Set up backtesting engine
    const engine = new BacktestingEngine({
      initialCash: 100000,
      symbols: this.symbols,
      transactionCostModel: transactionCostModel
    });
    
    // Extract historical data for this time window
    const windowHistoricalData = this.extractDataForWindow(timeWindow);
    const windowBenchmarkData = this.extractBenchmarkDataForWindow(timeWindow);
    
    // Initialize and run backtest
    engine.initialize(rebalancingStrategy, windowHistoricalData, windowBenchmarkData);
    const backtestResult = await engine.runBacktest();
    
    return backtestResult.portfolio;
  }
  
  /**
   * Generate time windows for walk-forward analysis
   */
  generateTimeWindows() {
    const windows = [];
    const allDates = this.getAllTradingDates();
    
    if (allDates.length < this.config.lookbackWindow + this.config.holdoutWindow) {
      return windows;
    }
    
    let startIndex = this.config.lookbackWindow;
    
    while (startIndex + this.config.holdoutWindow < allDates.length) {
      const optimizationStart = allDates[startIndex - this.config.lookbackWindow];
      const optimizationEnd = allDates[startIndex - 1];
      const testStart = allDates[startIndex];
      const testEnd = allDates[Math.min(startIndex + this.config.holdoutWindow - 1, allDates.length - 1)];
      
      windows.push({
        optimizationStart: optimizationStart,
        optimization: { start: optimizationStart, end: optimizationEnd },
        test: { start: testStart, end: testEnd },
        testEnd: testEnd
      });
      
      startIndex += this.config.stepSize;
    }
    
    return windows;
  }
  
  /**
   * Calculate aggregate statistics across all periods
   */
  calculateAggregateStats(periods) {
    const successfulPeriods = periods.filter(p => p.success && p.outOfSampleStats);
    
    if (successfulPeriods.length === 0) {
      return null;
    }
    
    // Aggregate returns
    const allReturns = [];
    const totalReturns = [];
    const sharpeRatios = [];
    const maxDrawdowns = [];
    const transactionCosts = [];
    
    successfulPeriods.forEach(period => {
      const stats = period.outOfSampleStats;
      if (stats.returns) {
        allReturns.push(...stats.returns);
        totalReturns.push(stats.totalReturn);
        sharpeRatios.push(stats.sharpeRatio);
        maxDrawdowns.push(stats.maxDrawdown);
        transactionCosts.push(period.transactionCosts);
      }
    });
    
    return {
      periods: successfulPeriods.length,
      averageReturn: mean(totalReturns),
      averageSharpeRatio: mean(sharpeRatios),
      averageMaxDrawdown: mean(maxDrawdowns),
      volatility: standardDeviation(allReturns),
      totalTransactionCosts: transactionCosts.reduce((sum, cost) => sum + cost, 0),
      winRate: totalReturns.filter(r => r > 0).length / totalReturns.length,
      consistency: this.calculateConsistency(totalReturns)
    };
  }
  
  /**
   * Calculate robustness score
   */
  calculateRobustnessScore(periods) {
    const successfulPeriods = periods.filter(p => p.success);
    if (successfulPeriods.length === 0) return 0;
    
    // Calculate performance consistency across periods
    const returns = successfulPeriods.map(p => p.outOfSampleStats?.totalReturn || 0);
    const sharpeRatios = successfulPeriods.map(p => p.outOfSampleStats?.sharpeRatio || 0);
    
    // Robustness = consistency of positive performance
    const positiveReturns = returns.filter(r => r > 0).length;
    const positiveSharpe = sharpeRatios.filter(s => s > 0).length;
    
    const returnConsistency = positiveReturns / returns.length;
    const sharpeConsistency = positiveSharpe / sharpeRatios.length;
    
    return (returnConsistency + sharpeConsistency) / 2;
  }
  
  /**
   * Find best parameters across periods
   */
  findBestParameters(periods) {
    const parameterCounts = {};
    
    periods.forEach(period => {
      if (period.success && period.optimalParameters) {
        const paramKey = JSON.stringify(period.optimalParameters);
        parameterCounts[paramKey] = (parameterCounts[paramKey] || 0) + 1;
      }
    });
    
    if (Object.keys(parameterCounts).length === 0) return null;
    
    // Return most frequently used parameters
    const mostFrequent = Object.entries(parameterCounts)
      .sort(([,a], [,b]) => b - a)[0];
    
    return JSON.parse(mostFrequent[0]);
  }
  
  /**
   * Analyze parameter stability across periods
   */
  analyzeParameterStability(periods) {
    const stability = {};
    const successfulPeriods = periods.filter(p => p.success);
    
    if (successfulPeriods.length === 0) return stability;
    
    // Extract parameter values for each period
    const parameterSeries = {};
    successfulPeriods.forEach(period => {
      if (period.optimalParameters) {
        Object.entries(period.optimalParameters).forEach(([param, value]) => {
          if (!parameterSeries[param]) parameterSeries[param] = [];
          parameterSeries[param].push(value);
        });
      }
    });
    
    // Calculate stability metrics for each parameter
    Object.entries(parameterSeries).forEach(([param, values]) => {
      if (values.length > 1) {
        stability[param] = {
          mean: mean(values),
          std: standardDeviation(values),
          coefficient_of_variation: standardDeviation(values) / Math.abs(mean(values)),
          stability_score: 1 - Math.min(1, standardDeviation(values) / Math.abs(mean(values)))
        };
      }
    });
    
    return stability;
  }
  
  /**
   * Utility methods
   */
  validateData() {
    const requiredLength = this.config.lookbackWindow + this.config.holdoutWindow;
    const availableLength = this.getAllTradingDates().length;
    
    if (availableLength < requiredLength) {
      throw new Error(`Insufficient data: need ${requiredLength} days, have ${availableLength}`);
    }
  }
  
  getAllTradingDates() {
    const dateSet = new Set();
    Object.values(this.historicalData).forEach(symbolData => {
      symbolData.forEach(d => dateSet.add(d.date));
    });
    return Array.from(dateSet).sort();
  }
  
  extractDataForWindow(timeWindow) {
    const windowData = {};
    
    Object.entries(this.historicalData).forEach(([symbol, data]) => {
      windowData[symbol] = data.filter(d => 
        new Date(d.date) >= new Date(timeWindow.start) && 
        new Date(d.date) <= new Date(timeWindow.end)
      );
    });
    
    return windowData;
  }
  
  extractBenchmarkDataForWindow(timeWindow) {
    return this.benchmarkData.filter(d => 
      new Date(d.date) >= new Date(timeWindow.start) && 
      new Date(d.date) <= new Date(timeWindow.end)
    );
  }
  
  calculateConsistency(returns) {
    if (returns.length === 0) return 0;
    
    const positiveReturns = returns.filter(r => r > 0).length;
    return positiveReturns / returns.length;
  }
}