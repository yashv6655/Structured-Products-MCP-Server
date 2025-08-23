import { mean, standardDeviation, quantile, sampleVariance } from 'simple-statistics';
import { calculateReturns } from './portfolio-math.js';

/**
 * Monte Carlo Confidence Interval System
 * Advanced robustness testing for portfolio strategies
 * Based on 2024 academic research on portfolio optimization confidence intervals
 */

/**
 * Monte Carlo Configuration
 */
export class MonteCarloConfig {
  constructor(config = {}) {
    this.numSimulations = config.numSimulations || 10000;
    this.confidenceLevels = config.confidenceLevels || [0.90, 0.95, 0.99];
    this.blockBootstrapLength = config.blockBootstrapLength || 22; // ~1 month blocks
    this.returnDistribution = config.returnDistribution || 'bootstrap'; // 'bootstrap', 'normal', 'historical'
    this.robustnessThreshold = config.robustnessThreshold || 0.5; // 50% of base case performance
    this.includePerturbations = config.includePerturbations || true;
    this.perturbationMagnitude = config.perturbationMagnitude || 0.1; // 10% parameter perturbation
  }
}

/**
 * Monte Carlo Result
 */
export class MonteCarloResult {
  constructor() {
    this.simulations = [];              // All simulation results
    this.confidenceIntervals = {};      // Confidence intervals by metric
    this.robustnessMetrics = {};        // Robustness test results
    this.distributionStats = {};        // Distribution statistics
    this.scenarioAnalysis = {};         // Worst/best case scenarios
    this.isRobust = false;              // Overall robustness flag
    this.robustnessScore = 0;           // Composite robustness score
  }
}

/**
 * Simulation Scenario
 */
export class SimulationScenario {
  constructor() {
    this.returns = [];                  // Simulated returns
    this.totalReturn = 0;              // Total return for scenario
    this.volatility = 0;               // Volatility for scenario
    this.sharpeRatio = 0;              // Sharpe ratio for scenario
    this.maxDrawdown = 0;              // Maximum drawdown
    this.var95 = 0;                    // Value at Risk (95%)
    this.parameters = {};              // Strategy parameters used
    this.perturbations = {};           // Applied perturbations
  }
}

/**
 * Block Bootstrap Sampler
 * Preserves return correlations and time series structure
 */
export class BlockBootstrapSampler {
  constructor(originalReturns, blockLength = 22) {
    this.originalReturns = originalReturns;
    this.blockLength = blockLength;
    this.numBlocks = Math.ceil(originalReturns.length / blockLength);
  }
  
  /**
   * Generate bootstrap sample preserving time series structure
   */
  generateSample(targetLength) {
    const sample = [];
    
    while (sample.length < targetLength) {
      // Randomly select a starting point for the block
      const maxStartIndex = Math.max(0, this.originalReturns.length - this.blockLength);
      const startIndex = Math.floor(Math.random() * (maxStartIndex + 1));
      
      // Extract block
      const endIndex = Math.min(startIndex + this.blockLength, this.originalReturns.length);
      const block = this.originalReturns.slice(startIndex, endIndex);
      
      // Add block to sample
      sample.push(...block);
    }
    
    return sample.slice(0, targetLength);
  }
}

/**
 * Parameter Perturbation Engine
 * Tests strategy robustness to parameter uncertainty
 */
export class ParameterPerturbation {
  constructor(baseParameters, perturbationMagnitude = 0.1) {
    this.baseParameters = baseParameters;
    this.perturbationMagnitude = perturbationMagnitude;
  }
  
  /**
   * Generate perturbed parameters for robustness testing
   */
  generatePerturbedParameters() {
    const perturbed = {};
    const perturbations = {};
    
    Object.entries(this.baseParameters).forEach(([param, value]) => {
      if (typeof value === 'number') {
        // Add random perturbation
        const perturbation = (Math.random() - 0.5) * 2 * this.perturbationMagnitude;
        const perturbedValue = value * (1 + perturbation);
        
        perturbed[param] = perturbedValue;
        perturbations[param] = perturbation;
      } else {
        // Keep non-numeric parameters unchanged
        perturbed[param] = value;
        perturbations[param] = 0;
      }
    });
    
    return { parameters: perturbed, perturbations: perturbations };
  }
}

/**
 * Portfolio Strategy Simulator
 * Simulates portfolio performance under various scenarios
 */
export class PortfolioStrategySimulator {
  constructor(strategyFunction, baseParameters) {
    this.strategyFunction = strategyFunction;
    this.baseParameters = baseParameters;
  }
  
  /**
   * Simulate strategy performance with given returns and parameters
   */
  async simulateStrategy(returns, parameters = null) {
    const params = parameters || this.baseParameters;
    
    try {
      // Apply strategy function with given parameters and returns
      const result = await this.strategyFunction(returns, params);
      
      // Calculate performance metrics
      const scenario = new SimulationScenario();
      scenario.returns = result.returns || returns;
      scenario.totalReturn = this.calculateTotalReturn(scenario.returns);
      scenario.volatility = standardDeviation(scenario.returns);
      scenario.sharpeRatio = this.calculateSharpeRatio(scenario.returns);
      scenario.maxDrawdown = this.calculateMaxDrawdown(scenario.returns);
      scenario.var95 = this.calculateVaR(scenario.returns, 0.95);
      scenario.parameters = params;
      
      return scenario;
    } catch (error) {
      // Return null scenario if simulation fails
      const failedScenario = new SimulationScenario();
      failedScenario.totalReturn = -1; // Mark as failed
      return failedScenario;
    }
  }
  
  calculateTotalReturn(returns) {
    return returns.reduce((total, r) => total * (1 + r), 1) - 1;
  }
  
  calculateSharpeRatio(returns, riskFreeRate = 0.05) {
    const excessReturns = returns.map(r => r - riskFreeRate / 252);
    const meanExcess = mean(excessReturns);
    const stdExcess = standardDeviation(excessReturns);
    return stdExcess > 0 ? (meanExcess * Math.sqrt(252)) / (stdExcess * Math.sqrt(252)) : 0;
  }
  
  calculateMaxDrawdown(returns) {
    let maxDrawdown = 0;
    let peak = 1;
    let current = 1;
    
    for (const ret of returns) {
      current *= (1 + ret);
      if (current > peak) {
        peak = current;
      }
      const drawdown = (peak - current) / peak;
      maxDrawdown = Math.max(maxDrawdown, drawdown);
    }
    
    return maxDrawdown;
  }
  
  calculateVaR(returns, confidenceLevel) {
    const sortedReturns = [...returns].sort((a, b) => a - b);
    const index = Math.floor((1 - confidenceLevel) * sortedReturns.length);
    return -sortedReturns[Math.max(0, index)];
  }
}

/**
 * Main Monte Carlo Confidence Engine
 */
export class MonteCarloConfidenceEngine {
  constructor(config) {
    this.config = new MonteCarloConfig(config);
    this.baselineReturns = [];
    this.simulator = null;
    this.baselineMetrics = null;
  }
  
  /**
   * Initialize with baseline data and strategy
   */
  initialize(baselineReturns, strategyFunction, baseParameters) {
    this.baselineReturns = baselineReturns;
    this.simulator = new PortfolioStrategySimulator(strategyFunction, baseParameters);
    this.baselineMetrics = null;
  }
  
  /**
   * Run comprehensive Monte Carlo confidence analysis
   */
  async runConfidenceAnalysis() {
    if (!this.simulator) {
      throw new Error('Monte Carlo engine not initialized');
    }
    
    const result = new MonteCarloResult();
    
    // Calculate baseline performance
    this.baselineMetrics = await this.simulator.simulateStrategy(this.baselineReturns);
    
    // Run Monte Carlo simulations
    result.simulations = await this.runMonteCarloSimulations();
    
    // Calculate confidence intervals
    result.confidenceIntervals = this.calculateConfidenceIntervals(result.simulations);
    
    // Perform robustness tests
    result.robustnessMetrics = this.calculateRobustnessMetrics(result.simulations);
    
    // Calculate distribution statistics
    result.distributionStats = this.calculateDistributionStats(result.simulations);
    
    // Scenario analysis
    result.scenarioAnalysis = this.performScenarioAnalysis(result.simulations);
    
    // Overall robustness assessment
    result.robustnessScore = this.calculateOverallRobustnessScore(result.robustnessMetrics);
    result.isRobust = result.robustnessScore >= this.config.robustnessThreshold;
    
    return result;
  }
  
  /**
   * Run Monte Carlo simulations
   */
  async runMonteCarloSimulations() {
    const simulations = [];
    const bootstrapSampler = new BlockBootstrapSampler(
      this.baselineReturns, 
      this.config.blockBootstrapLength
    );
    
    const parameterPerturber = this.config.includePerturbations ? 
      new ParameterPerturbation(this.simulator.baseParameters, this.config.perturbationMagnitude) : 
      null;
    
    for (let i = 0; i < this.config.numSimulations; i++) {
      try {
        // Generate return scenario
        let simulatedReturns;
        switch (this.config.returnDistribution) {
          case 'bootstrap':
            simulatedReturns = bootstrapSampler.generateSample(this.baselineReturns.length);
            break;
          case 'normal':
            simulatedReturns = this.generateNormalReturns();
            break;
          case 'historical':
            simulatedReturns = this.shuffleReturns();
            break;
          default:
            simulatedReturns = bootstrapSampler.generateSample(this.baselineReturns.length);
        }
        
        // Generate parameters (with or without perturbations)
        let parameters = this.simulator.baseParameters;
        let perturbations = {};
        
        if (parameterPerturber && Math.random() < 0.5) { // 50% of simulations use perturbed parameters
          const perturbationResult = parameterPerturber.generatePerturbedParameters();
          parameters = perturbationResult.parameters;
          perturbations = perturbationResult.perturbations;
        }
        
        // Run simulation
        const scenario = await this.simulator.simulateStrategy(simulatedReturns, parameters);
        scenario.perturbations = perturbations;
        
        simulations.push(scenario);
        
        // Progress tracking (every 1000 simulations)
        if (i > 0 && i % 1000 === 0) {
          console.log(`Monte Carlo progress: ${i}/${this.config.numSimulations} simulations completed`);
        }
        
      } catch (error) {
        console.warn(`Simulation ${i} failed:`, error.message);
        // Continue with next simulation
      }
    }
    
    return simulations.filter(s => s.totalReturn !== -1); // Filter out failed simulations
  }
  
  /**
   * Calculate confidence intervals for key metrics
   */
  calculateConfidenceIntervals(simulations) {
    const intervals = {};
    const metrics = ['totalReturn', 'volatility', 'sharpeRatio', 'maxDrawdown', 'var95'];
    
    metrics.forEach(metric => {
      const values = simulations.map(s => s[metric]).filter(v => !isNaN(v));
      
      if (values.length > 0) {
        intervals[metric] = {};
        
        this.config.confidenceLevels.forEach(level => {
          const lowerPercentile = (1 - level) / 2;
          const upperPercentile = 1 - lowerPercentile;
          
          intervals[metric][`${(level * 100).toFixed(0)}%`] = {
            lower: quantile(values, lowerPercentile),
            upper: quantile(values, upperPercentile),
            median: quantile(values, 0.5),
            mean: mean(values)
          };
        });
      }
    });
    
    return intervals;
  }
  
  /**
   * Calculate robustness metrics
   */
  calculateRobustnessMetrics(simulations) {
    const metrics = {};
    const baselineReturn = this.baselineMetrics.totalReturn;
    const baselineSharpe = this.baselineMetrics.sharpeRatio;
    
    // Performance robustness
    const returns = simulations.map(s => s.totalReturn);
    const sharpeRatios = simulations.map(s => s.sharpeRatio);
    
    metrics.returnRobustness = {
      percentileAboveThreshold: returns.filter(r => r >= baselineReturn * this.config.robustnessThreshold).length / returns.length,
      percentilePositive: returns.filter(r => r > 0).length / returns.length,
      worstCase: Math.min(...returns),
      bestCase: Math.max(...returns),
      downside95: quantile(returns, 0.05)
    };
    
    metrics.sharpeRobustness = {
      percentileAboveThreshold: sharpeRatios.filter(s => s >= baselineSharpe * this.config.robustnessThreshold).length / sharpeRatios.length,
      percentilePositive: sharpeRatios.filter(s => s > 0).length / sharpeRatios.length,
      worstCase: Math.min(...sharpeRatios),
      bestCase: Math.max(...sharpeRatios)
    };
    
    // Parameter sensitivity (if perturbations were used)
    const perturbedSimulations = simulations.filter(s => 
      Object.keys(s.perturbations || {}).length > 0
    );
    
    if (perturbedSimulations.length > 0) {
      const perturbedReturns = perturbedSimulations.map(s => s.totalReturn);
      const baseCaseReturns = simulations.filter(s => 
        Object.keys(s.perturbations || {}).length === 0
      ).map(s => s.totalReturn);
      
      if (baseCaseReturns.length > 0) {
        metrics.parameterSensitivity = {
          perturbedMean: mean(perturbedReturns),
          baseCaseMean: mean(baseCaseReturns),
          sensitivityRatio: mean(perturbedReturns) / mean(baseCaseReturns)
        };
      }
    }
    
    return metrics;
  }
  
  /**
   * Calculate distribution statistics
   */
  calculateDistributionStats(simulations) {
    const returns = simulations.map(s => s.totalReturn);
    const sharpeRatios = simulations.map(s => s.sharpeRatio);
    
    return {
      returns: {
        mean: mean(returns),
        median: quantile(returns, 0.5),
        std: standardDeviation(returns),
        skewness: this.calculateSkewness(returns),
        kurtosis: this.calculateKurtosis(returns),
        min: Math.min(...returns),
        max: Math.max(...returns)
      },
      sharpeRatios: {
        mean: mean(sharpeRatios),
        median: quantile(sharpeRatios, 0.5),
        std: standardDeviation(sharpeRatios),
        skewness: this.calculateSkewness(sharpeRatios),
        kurtosis: this.calculateKurtosis(sharpeRatios)
      }
    };
  }
  
  /**
   * Perform scenario analysis
   */
  performScenarioAnalysis(simulations) {
    const sortedByReturn = [...simulations].sort((a, b) => a.totalReturn - b.totalReturn);
    const sortedBySharpe = [...simulations].sort((a, b) => a.sharpeRatio - b.sharpeRatio);
    
    return {
      worstCase: {
        return: sortedByReturn[0],
        sharpe: sortedBySharpe[0]
      },
      bestCase: {
        return: sortedByReturn[sortedByReturn.length - 1],
        sharpe: sortedBySharpe[sortedBySharpe.length - 1]
      },
      percentiles: {
        return: {
          p5: sortedByReturn[Math.floor(0.05 * sortedByReturn.length)],
          p25: sortedByReturn[Math.floor(0.25 * sortedByReturn.length)],
          p75: sortedByReturn[Math.floor(0.75 * sortedByReturn.length)],
          p95: sortedByReturn[Math.floor(0.95 * sortedByReturn.length)]
        }
      }
    };
  }
  
  /**
   * Calculate overall robustness score
   */
  calculateOverallRobustnessScore(robustnessMetrics) {
    const returnRobustness = robustnessMetrics.returnRobustness?.percentileAboveThreshold || 0;
    const sharpeRobustness = robustnessMetrics.sharpeRobustness?.percentileAboveThreshold || 0;
    const positiveReturnRate = robustnessMetrics.returnRobustness?.percentilePositive || 0;
    
    // Weighted average of robustness metrics
    const weights = [0.4, 0.4, 0.2]; // Return robustness, Sharpe robustness, positive return rate
    const scores = [returnRobustness, sharpeRobustness, positiveReturnRate];
    
    return weights.reduce((sum, weight, i) => sum + weight * scores[i], 0);
  }
  
  /**
   * Utility methods for distribution statistics
   */
  calculateSkewness(values) {
    const n = values.length;
    const meanVal = mean(values);
    const stdVal = standardDeviation(values);
    
    if (stdVal === 0) return 0;
    
    const skewness = values.reduce((sum, x) => {
      return sum + Math.pow((x - meanVal) / stdVal, 3);
    }, 0) / n;
    
    return skewness;
  }
  
  calculateKurtosis(values) {
    const n = values.length;
    const meanVal = mean(values);
    const stdVal = standardDeviation(values);
    
    if (stdVal === 0) return 0;
    
    const kurtosis = values.reduce((sum, x) => {
      return sum + Math.pow((x - meanVal) / stdVal, 4);
    }, 0) / n;
    
    return kurtosis - 3; // Excess kurtosis
  }
  
  generateNormalReturns() {
    const meanReturn = mean(this.baselineReturns);
    const stdReturn = standardDeviation(this.baselineReturns);
    const returns = [];
    
    for (let i = 0; i < this.baselineReturns.length; i++) {
      // Box-Muller transform for normal distribution
      const u1 = Math.random();
      const u2 = Math.random();
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      returns.push(meanReturn + z * stdReturn);
    }
    
    return returns;
  }
  
  shuffleReturns() {
    const shuffled = [...this.baselineReturns];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }
}

/**
 * Confidence Interval Visualization Data Generator
 * Prepares data for visualization of confidence intervals
 */
export class ConfidenceVisualizationData {
  static generateVisualizationData(monteCarloResult) {
    const data = {
      distributions: {},
      confidenceIntervals: {},
      scenarioAnalysis: {},
      robustnessMetrics: {}
    };
    
    // Distribution histograms
    const returns = monteCarloResult.simulations.map(s => s.totalReturn);
    const sharpeRatios = monteCarloResult.simulations.map(s => s.sharpeRatio);
    
    data.distributions.returns = this.createHistogramBins(returns, 50);
    data.distributions.sharpe = this.createHistogramBins(sharpeRatios, 50);
    
    // Confidence interval data
    data.confidenceIntervals = monteCarloResult.confidenceIntervals;
    
    // Scenario analysis
    data.scenarioAnalysis = monteCarloResult.scenarioAnalysis;
    
    // Robustness metrics
    data.robustnessMetrics = {
      score: monteCarloResult.robustnessScore,
      isRobust: monteCarloResult.isRobust,
      details: monteCarloResult.robustnessMetrics
    };
    
    return data;
  }
  
  static createHistogramBins(values, numBins = 50) {
    const min = Math.min(...values);
    const max = Math.max(...values);
    const binWidth = (max - min) / numBins;
    
    const bins = Array(numBins).fill(0);
    const binEdges = Array(numBins + 1).fill(0).map((_, i) => min + i * binWidth);
    
    values.forEach(value => {
      const binIndex = Math.min(Math.floor((value - min) / binWidth), numBins - 1);
      bins[binIndex]++;
    });
    
    return {
      bins: bins,
      edges: binEdges,
      counts: bins,
      density: bins.map(count => count / values.length)
    };
  }
}